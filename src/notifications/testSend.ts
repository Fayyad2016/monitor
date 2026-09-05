import { createHash, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../config.js";
import { FINDBOLIG_MONITOR_NAME, FINDBOLIG_URL } from "../monitors/findbolig.js";
import { formatTimestamp } from "../time.js";
import type { NotificationChannel, NotificationPayload } from "./types.js";

export interface TestNotificationRequest {
  type?: string;
  housingFund?: string;
}

export function notificationTokenMatches(expected: string, provided: string): boolean {
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}

export function buildSimulatedOpenPayload(
  config: AppConfig,
  housingFund: string,
  detectedAt = new Date()
): NotificationPayload {
  return {
    eventType: "OPENED",
    monitorName: FINDBOLIG_MONITOR_NAME,
    targetUrl: FINDBOLIG_URL,
    housingFund,
    previousStatus: "Lukket",
    currentStatus: "Åben",
    detectedAtFormatted: formatTimestamp(detectedAt, config.TIMEZONE) ?? detectedAt.toISOString(),
    detectedAt,
    simulated: true
  };
}

export async function sendTestNotifications(
  config: AppConfig,
  channels: NotificationChannel[],
  request: TestNotificationRequest = {}
): Promise<{ telegram: "sent" | "failed"; email: "sent" | "failed" }> {
  const type = request.type?.trim().toLowerCase() || "delivery";
  if (type !== "open" && type !== "delivery" && type !== "test") {
    throw new Error("Invalid type");
  }
  const payload: NotificationPayload =
    type === "open"
      ? buildSimulatedOpenPayload(config, (request.housingFund ?? "Fuglevænget").trim() || "Fuglevænget")
      : {
          eventType: "TEST",
          monitorName: "monitor",
          targetUrl: FINDBOLIG_URL,
          detectedAtFormatted: formatTimestamp(new Date(), config.TIMEZONE) ?? new Date().toISOString(),
          detectedAt: new Date(),
          extraLines: ["This is a delivery test. Findbolig state was not changed."],
          simulated: true
        };

  const result: { telegram: "sent" | "failed"; email: "sent" | "failed" } = {
    telegram: "failed",
    email: "failed"
  };
  await Promise.all(
    channels.map(async (channel) => {
      if (!channel.enabled) {
        return;
      }
      try {
        await channel.send(payload);
        result[channel.name] = "sent";
      } catch {
        result[channel.name] = "failed";
      }
    })
  );
  return result;
}
