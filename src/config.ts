import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", ""].includes(normalized)) {
    return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().int().positive().default(3000),
  CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  TIMEZONE: z.string().default("Europe/Copenhagen"),
  DATABASE_URL: z.string().min(1),
  MONITOR_FAILURE_ALERT_THRESHOLD: z.coerce.number().int().positive().default(3),
  MONITOR_SEND_RECOVERY_ALERT: booleanFromEnv.default(true),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  REQUEST_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  HEALTH_MAX_CHECK_AGE_SECONDS: z.coerce.number().int().positive().default(180),
  GIT_COMMIT_SHA: z.string().optional(),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromEnv.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  ALERT_EMAIL: z.string().optional(),
  TLS_REJECT_UNAUTHORIZED: booleanFromEnv.default(true),
  PLAYWRIGHT_FALLBACK: booleanFromEnv.default(false)
});

export type AppConfig = z.infer<typeof envSchema> & {
  commitSha: string;
  telegramEnabled: boolean;
  emailEnabled: boolean;
};

let cached: AppConfig | undefined;

export function loadConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  const parsed = envSchema.parse({ ...process.env, ...overrides });
  const telegramEnabled = Boolean(parsed.TELEGRAM_BOT_TOKEN && parsed.TELEGRAM_CHAT_ID);
  const emailEnabled = Boolean(
    parsed.SMTP_HOST && parsed.EMAIL_FROM && parsed.ALERT_EMAIL
  );
  return {
    ...parsed,
    commitSha:
      parsed.GIT_COMMIT_SHA ||
      parsed.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      "unknown",
    telegramEnabled,
    emailEnabled
  };
}

export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

export function resetConfigCache(): void {
  cached = undefined;
}

export const APP_VERSION = "1.0.0";
