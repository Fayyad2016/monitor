import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { APP_VERSION, type AppConfig } from "../config.js";
import { checkDatabase, type DbPool } from "../database/client.js";
import { listAllStates, listMonitorRuns, listUnsentNotifications } from "../database/repositories.js";
import { logger } from "../logger.js";
import { formatTimestamp } from "../time.js";

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

export function createHttpServer(pool: DbPool, config: AppConfig): Server {
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
        json(res, 404, { error: "not_found" });
      } catch (error) {
        logger.error({ err: error instanceof Error ? error.message : error }, "HTTP handler failed");
        json(res, 500, { error: "internal_error" });
      }
    })();
  });
}
