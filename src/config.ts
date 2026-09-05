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
  CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  TIMEZONE: z.string().default("Europe/Copenhagen"),
  DATABASE_URL: z.string().min(1),
  MONITOR_FAILURE_ALERT_THRESHOLD: z.coerce.number().int().positive().default(3),
  MONITOR_SEND_RECOVERY_ALERT: booleanFromEnv.default(true),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  REQUEST_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  HEALTH_MAX_CHECK_AGE_SECONDS: z.coerce.number().int().positive().default(90),
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
  EMAIL_FROM_NAME: z.string().default("Moderavia Monitoring"),
  EMAIL_REPLY_TO: z.string().optional(),
  EMAIL_SIGNATURE_NAME: z.string().default("Fayyad Mahmoud"),
  EMAIL_SIGNATURE_COMPANY: z.string().default("Moderavia"),
  EMAIL_SIGNATURE_DOMAIN: z.string().default("moderavia.com"),
  ALERT_EMAIL: z.string().optional(),
  SMTP_TLS_SERVERNAME: z.string().optional(),
  TEST_NOTIFICATION_TOKEN: z.string().optional(),
  TLS_REJECT_UNAUTHORIZED: booleanFromEnv.default(true),
  PLAYWRIGHT_FALLBACK: booleanFromEnv.default(true)
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
  const emailFrom = parsed.EMAIL_FROM?.trim();
  const emailEnabled = Boolean(parsed.SMTP_HOST && emailFrom && parsed.ALERT_EMAIL);
  return {
    ...parsed,
    EMAIL_FROM: emailFrom,
    EMAIL_FROM_NAME: parsed.EMAIL_FROM_NAME.trim() || "Moderavia Monitoring",
    EMAIL_REPLY_TO: parsed.EMAIL_REPLY_TO?.trim() || emailFrom,
    EMAIL_SIGNATURE_NAME: parsed.EMAIL_SIGNATURE_NAME.trim(),
    EMAIL_SIGNATURE_COMPANY: parsed.EMAIL_SIGNATURE_COMPANY.trim(),
    EMAIL_SIGNATURE_DOMAIN: parsed.EMAIL_SIGNATURE_DOMAIN.trim() || "moderavia.com",
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
