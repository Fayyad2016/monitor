import type { AppConfig } from "../config.js";
import type { DbPool } from "../database/client.js";
import {
  listUnsentNotifications,
  markChannelNotified,
  markNotificationAttemptError,
  markNotificationChannelSent,
  type PendingNotification
} from "../database/repositories.js";
import { logger } from "../logger.js";
import { formatTimestamp } from "../time.js";
import { createEmailChannel } from "./email.js";
import { createTelegramChannel } from "./telegram.js";
import type { AlertEventType, NotificationChannel, NotificationPayload } from "./types.js";

export function createNotificationChannels(config: AppConfig): NotificationChannel[] {
  return [createTelegramChannel(config), createEmailChannel(config)];
}

function toPayload(row: PendingNotification, timezone: string): NotificationPayload {
  return {
    eventType: row.event_type as AlertEventType,
    monitorName: row.monitor_name,
    targetUrl: row.target_url,
    housingFund: row.housing_fund,
    previousStatus: row.previous_status,
    currentStatus: row.current_status,
    detectedAtFormatted: formatTimestamp(row.detected_at, timezone) ?? String(row.detected_at)
  };
}

export async function dispatchPendingNotifications(
  pool: DbPool,
  config: AppConfig,
  channels: NotificationChannel[] = createNotificationChannels(config)
): Promise<void> {
  const pending = await listUnsentNotifications(pool);
  for (const row of pending) {
    const payload = toPayload(row, config.TIMEZONE);
    await Promise.all(
      channels.map(async (channel) => {
        const alreadySent = channel.name === "telegram" ? row.telegram_sent_at : row.email_sent_at;
        if (alreadySent) {
          return;
        }
        if (!channel.enabled) {
          await markNotificationAttemptError(pool, row.id, `${channel.name} is not configured`, new Date());
          return;
        }
        try {
          await channel.send(payload);
          const at = new Date();
          await markNotificationChannelSent(pool, row.id, channel.name, at);
          await markChannelNotified(pool, {
            monitorName: row.monitor_name,
            housingFundKey: row.housing_fund_key,
            channel: channel.name,
            at
          });
          if (channel.name === "telegram") {
            row.telegram_sent_at = at;
          } else {
            row.email_sent_at = at;
          }
          logger.info(
            {
              monitor: row.monitor_name,
              fund: row.housing_fund,
              eventType: row.event_type,
              channel: channel.name
            },
            "Notification sent"
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown notification error";
          await markNotificationAttemptError(pool, row.id, `${channel.name}: ${message}`, new Date());
          logger.error(
            {
              monitor: row.monitor_name,
              fund: row.housing_fund,
              channel: channel.name,
              err: message
            },
            "Notification channel failed; will retry without duplicating the other channel"
          );
        }
      })
    );
  }
}
