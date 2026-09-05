import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { APP_VERSION, type AppConfig } from "../config.js";
import { checkDatabase, type DbPool } from "../database/client.js";
import { listAllStates, listMonitorRuns, listUnsentNotifications } from "../database/repositories.js";
import { logger } from "../logger.js";
import { describeError } from "../tls/errorInfo.js";
import { formatTimestamp } from "../time.js";
import type { NotificationChannel } from "../notifications/types.js";
import { notificationTokenMatches, sendTestNotifications } from "../notifications/testSend.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

export function isHealthFresh(lastSuccessAt: Date | null, maxAgeSeconds: number, now = new Date()): boolean {
  if (!lastSuccessAt) {
    return false;
  }
  return now.getTime() - lastSuccessAt.getTime() <= maxAgeSeconds * 1000;
}

export async function buildHealthPayload(pool: DbPool, config: AppConfig) {
  const dbOk = await checkDatabase(pool);
  const runs = await listMonitorRuns(pool);
  const recentOk = runs.length > 0 && runs.every((run) => isHealthFresh(run.last_success_at, config.HEALTH_MAX_CHECK_AGE_SECONDS));
  const healthy = dbOk && recentOk;
  return {
    status: healthy ? "ok" : "degraded",
    running: true,
    postgres: dbOk,
    recentCheck: recentOk,
    timezone: config.TIMEZONE,
    version: APP_VERSION,
    commit: config.commitSha
  };
}

export async function buildStatusPayload(pool: DbPool, config: AppConfig) {
  const runs = await listMonitorRuns(pool);
  const states = await listAllStates(pool);
  const pending = await listUnsentNotifications(pool);
  return {
    version: APP_VERSION,
    commit: config.commitSha,
    timezone: config.TIMEZONE,
    intervalSeconds: config.CHECK_INTERVAL_SECONDS,
    telegramConfigured: config.telegramEnabled,
    emailConfigured: config.emailEnabled,
    monitors: runs.map((run) => ({
      name: run.monitor_name,
      targetUrl: run.target_url,
      lastSuccessfulCheck: formatTimestamp(run.last_success_at, config.TIMEZONE),
      lastFailedCheck: formatTimestamp(run.last_failure_at, config.TIMEZONE),
      lastError: run.last_error,
      consecutiveFailures: run.consecutive_failures,
      parserMethod: run.last_parser_method,
      nextScheduledCheck: formatTimestamp(run.next_check_at, config.TIMEZONE),
      operationalAlertActive: run.operational_alert_active,
      notificationStatus: {
        operationalTelegramAt: formatTimestamp(run.operational_alert_telegram_at, config.TIMEZONE),
        operationalEmailAt: formatTimestamp(run.operational_alert_email_at, config.TIMEZONE)
      },
      currentHousingFundStatuses: states
        .filter((state) => state.monitor_name === run.monitor_name)
        .map((state) => ({
          housingFund: state.housing_fund,
          previousStatus: state.previous_status,
          currentStatus: state.current_status,
          firstSeen: formatTimestamp(state.first_seen_at, config.TIMEZONE),
          lastChecked: formatTimestamp(state.last_checked_at, config.TIMEZONE),
          lastChanged: formatTimestamp(state.last_changed_at, config.TIMEZONE),
          telegramNotifiedAt: formatTimestamp(state.telegram_notified_at, config.TIMEZONE),
          emailNotifiedAt: formatTimestamp(state.email_notified_at, config.TIMEZONE)
        }))
    })),
    pendingNotifications: pending.map((row) => ({
      monitor: row.monitor_name,
      housingFund: row.housing_fund,
      eventType: row.event_type,
      telegramSent: Boolean(row.telegram_sent_at),
      emailSent: Boolean(row.email_sent_at),
      lastError: row.last_error
    }))
  };
}

function readTestToken(req: IncomingMessage, url: URL): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const custom = req.headers["x-test-notification-token"];
  if (typeof custom === "string") {
    return custom;
  }
  const query = url.searchParams.get("token");
  return query ?? undefined;
}

export function createHttpServer(
  pool: DbPool,
  config: AppConfig,
  channels: NotificationChannel[] = []
): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        if (req.method === "GET" && url.pathname === "/health") {
          const payload = await buildHealthPayload(pool, config);
          json(res, payload.status === "ok" ? 200 : 503, payload);
          return;
        }
        if (req.method === "GET" && url.pathname === "/status") {
          json(res, 200, await buildStatusPayload(pool, config));
          return;
        }
        if (req.method === "POST" && url.pathname === "/test-notifications") {
          if (!config.TEST_NOTIFICATION_TOKEN) {
            json(res, 404, { error: "not_found" });
            return;
          }
          const provided = readTestToken(req, url);
          if (!provided || !notificationTokenMatches(config.TEST_NOTIFICATION_TOKEN, provided)) {
            json(res, 401, { error: "unauthorized" });
            return;
          }
          const result = await sendTestNotifications(config, channels);
          json(res, 200, result);
          return;
        }
        json(res, 404, { error: "not_found" });
      } catch (error) {
        logger.error({ err: describeError(error) }, "HTTP handler failed");
        json(res, 500, { error: "internal_error" });
      }
    })();
  });
}
