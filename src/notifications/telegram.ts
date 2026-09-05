import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import { describeError } from "../tls/errorInfo.js";
import { buildTelegramMessage, type NotificationChannel, type NotificationPayload } from "./types.js";

export function createTelegramChannel(config: AppConfig): NotificationChannel {
  return {
    name: "telegram",
    enabled: config.telegramEnabled,
    async send(payload: NotificationPayload): Promise<void> {
      if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
        throw new Error("Telegram is not configured");
      }
      const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: config.TELEGRAM_CHAT_ID,
            text: buildTelegramMessage(payload),
            disable_web_page_preview: true
          })
        });
        if (!response.ok) {
          logger.error({ status: response.status }, "Telegram API rejected message");
          throw new Error(`Telegram API HTTP ${response.status}`);
        }
      } catch (error) {
        logger.error({ channel: "telegram", err: describeError(error) }, "Telegram send failed");
        throw error;
      }
    }
  };
}

