import type { AppConfig } from "../config.js";
import type { DbPool } from "../database/client.js";
import {
  clearOperationalAlert,
  getMonitorRun,
  markRecoverySent,
  setOperationalAlert
} from "../database/repositories.js";
import { logger } from "../logger.js";
import { describeError } from "../tls/errorInfo.js";
import { formatTimestamp } from "../time.js";
import type { NotificationChannel } from "../notifications/types.js";

export async function handleOperationalState(
  pool: DbPool,
  config: AppConfig,
  channels: NotificationChannel[],
  input: {
    monitorName: string;
    targetUrl: string;
    consecutiveFailures: number;
    operationalAlertActive: boolean;
    operationalTelegramAt: Date | null;
    operationalEmailAt: Date | null;
    recovered: boolean;
  }
): Promise<void> {
  const now = new Date();
  const detected = formatTimestamp(now, config.TIMEZONE) ?? now.toISOString();

  if (input.recovered && input.operationalAlertActive) {
    const payload = {
      eventType: "OPERATIONAL_RECOVERY" as const,
      monitorName: input.monitorName,
      targetUrl: input.targetUrl,
      detectedAtFormatted: detected,
      extraLines: ["The monitor completed a successful check after repeated failures."]
    };
    if (config.MONITOR_SEND_RECOVERY_ALERT) {
      await Promise.all(
        channels.map(async (channel) => {
          if (!channel.enabled) {
            return;
          }
          try {
            await channel.send(payload);
            await markRecoverySent(pool, input.monitorName, channel.name, now);
          } catch (error) {
            logger.error(
              { channel: channel.name, err: describeError(error) },
              "Recovery notification failed"
            );
          }
        })
      );
    }
    await clearOperationalAlert(pool, input.monitorName, now);
    logger.info({ monitor: input.monitorName }, "Monitor recovered after repeated failures");
    return;
  }

  if (input.consecutiveFailures < config.MONITOR_FAILURE_ALERT_THRESHOLD) {
    return;
  }

  const needsTelegram = !input.operationalTelegramAt;
  const needsEmail = !input.operationalEmailAt;
  if (input.operationalAlertActive && !needsTelegram && !needsEmail) {
    return;
  }

  const payload = {
    eventType: "OPERATIONAL_FAILURE" as const,
    monitorName: input.monitorName,
    targetUrl: input.targetUrl,
    detectedAtFormatted: detected,
    extraLines: [
      `Consecutive failures: ${input.consecutiveFailures}`,
      `Threshold: ${config.MONITOR_FAILURE_ALERT_THRESHOLD}`,
      "Statuses were not changed because parsing/fetching failed."
    ]
  };

  let telegramOk = Boolean(input.operationalTelegramAt);
  let emailOk = Boolean(input.operationalEmailAt);
  await Promise.all(
    channels.map(async (channel) => {
      if (!channel.enabled) {
        return;
      }
      if (channel.name === "telegram" && telegramOk) {
        return;
      }
      if (channel.name === "email" && emailOk) {
        return;
      }
      try {
        await channel.send(payload);
        if (channel.name === "telegram") {
          telegramOk = true;
        } else {
          emailOk = true;
        }
      } catch (error) {
        logger.error(
          { channel: channel.name, err: describeError(error) },
          "Operational alert failed"
        );
      }
    })
  );

  const channel =
    telegramOk && emailOk ? "both" : telegramOk ? "telegram" : emailOk ? "email" : "none";
  await setOperationalAlert(pool, input.monitorName, true, channel, now);
}

export async function loadOperationalContext(pool: DbPool, monitorName: string) {
  const run = await getMonitorRun(pool, monitorName);
  return {
    operationalAlertActive: run?.operational_alert_active ?? false,
    operationalTelegramAt: run?.operational_alert_telegram_at ?? null,
    operationalEmailAt: run?.operational_alert_email_at ?? null
  };
}
