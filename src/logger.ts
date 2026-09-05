import pino from "pino";

const SECRET_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "SMTP_PASSWORD",
  "DATABASE_URL",
  "PGPASSWORD",
  "password",
  "token",
  "secret"
];

function redactValue(key: string, value: unknown): unknown {
  const lower = key.toLowerCase();
  if (
    SECRET_KEYS.some((secret) => lower.includes(secret.toLowerCase())) ||
    lower.includes("password") ||
    lower.includes("token") ||
    lower.includes("database")
  ) {
    return "[redacted]";
  }
  return value;
}

function redactObject(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(redactObject);
  }
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        redactValue(key, redactObject(value))
      ])
    );
  }
  return input;
}

export function createLogger(level = process.env.LOG_LEVEL ?? "info") {
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "TELEGRAM_BOT_TOKEN",
        "SMTP_PASSWORD",
        "DATABASE_URL",
        "password",
        "token",
        "*.TELEGRAM_BOT_TOKEN",
        "*.SMTP_PASSWORD",
        "*.DATABASE_URL"
      ],
      censor: "[redacted]"
    },
    formatters: {
      log(object) {
        return redactObject(object) as Record<string, unknown>;
      }
    }
  });
}

export const logger = createLogger();
