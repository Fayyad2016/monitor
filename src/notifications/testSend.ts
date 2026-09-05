import { createHash, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../config.js";
import { formatTimestamp } from "../time.js";
import type { NotificationChannel } from "./types.js";

export function notificationTokenMatches(expected: string, provided: string): boolean {
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}

export async function sendTestNotifications(
  config: AppConfig,
  channels: NotificationChannel[]
): Promise<{ telegram: "sent" | "failed"; email: "sent" | "failed" }> {
  const payload = {
    eventType: "TEST" as const,
    monitorName: "monitor",
    targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
    detectedAtFormatted: formatTimestamp(new Date(), config.TIMEZONE) ?? new Date().toISOString(),
    extraLines: ["This is a delivery test. Findbolig state was not changed."]
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
