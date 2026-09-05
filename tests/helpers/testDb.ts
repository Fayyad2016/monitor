import pg from "pg";
import type { AppConfig } from "../../src/config.js";
import { runMigrations } from "../../src/database/migrate.js";
import type { NotificationChannel, NotificationPayload } from "../../src/notifications/types.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://monitor:monitor@127.0.0.1:5432/monitor_test";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: "test",
    PORT: 3456,
    CHECK_INTERVAL_SECONDS: 60,
    TIMEZONE: "Europe/Copenhagen",
    DATABASE_URL: TEST_DATABASE_URL,
    MONITOR_FAILURE_ALERT_THRESHOLD: 3,
    MONITOR_SEND_RECOVERY_ALERT: true,
    REQUEST_TIMEOUT_MS: 5000,
    REQUEST_RETRY_ATTEMPTS: 2,
    HEALTH_MAX_CHECK_AGE_SECONDS: 180,
    GIT_COMMIT_SHA: "testsha",
    LOG_LEVEL: "silent",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    TLS_REJECT_UNAUTHORIZED: true,
    PLAYWRIGHT_FALLBACK: false,
    commitSha: "testsha",
    telegramEnabled: true,
    emailEnabled: true,
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "123",
    SMTP_HOST: "smtp.test",
    SMTP_USER: "user",
    SMTP_PASSWORD: "pass",
    EMAIL_FROM: "from@example.com",
    ALERT_EMAIL: "alert@example.com",
    ...overrides
  };
}

export async function createTestPool(): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await runMigrations(pool);
  await pool.query("TRUNCATE pending_notifications, housing_fund_history, housing_fund_states, monitor_runs RESTART IDENTITY CASCADE");
  return pool;
}

export function recordingChannels() {
  const sent: Array<{ channel: "telegram" | "email"; payload: NotificationPayload }> = [];
  const fail = new Set<"telegram" | "email">();
  const channels: NotificationChannel[] = [
    {
      name: "telegram",
      enabled: true,
      async send(payload) {
        if (fail.has("telegram")) {
          throw new Error("telegram down");
        }
        sent.push({ channel: "telegram", payload });
      }
    },
    {
      name: "email",
      enabled: true,
      async send(payload) {
        if (fail.has("email")) {
          throw new Error("email down");
        }
        sent.push({ channel: "email", payload });
      }
    }
  ];
  return { sent, fail, channels };
}
