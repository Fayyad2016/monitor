import type { AppConfig } from "../config.js";
import type { DbPool } from "../database/client.js";
import {
  applyStatusChange,
  listStates,
  recordMonitorFailure,
  recordMonitorSuccess,
  touchChecked,
  upsertBaselineState
} from "../database/repositories.js";
import { logger } from "../logger.js";
import type { MonitorDefinition } from "../monitors/types.js";
import { dispatchPendingNotifications } from "../notifications/dispatcher.js";
import type { NotificationChannel } from "../notifications/types.js";
import { planChanges } from "./compare.js";
import { handleOperationalState, loadOperationalContext } from "./operational.js";

export interface RunResult {
  monitorName: string;
  ok: boolean;
  isFirstRun: boolean;
  openAtBaseline: string[];
  transitions: Array<{ fund: string; eventType: string; previous: string | null; current: string }>;
  error?: string;
  parserMethod?: string;
  entityCount?: number;
}

export async function runMonitor(
  pool: DbPool,
  config: AppConfig,
  monitor: MonitorDefinition,
  channels: NotificationChannel[],
  nextCheckAt: Date
): Promise<RunResult> {
  const existing = await listStates(pool, monitor.name);
  const isFirstRun = existing.length === 0;
  const operational = await loadOperationalContext(pool, monitor.name);

  try {
    const snapshot = await monitor.extract();
    if (snapshot.entities.length === 0) {
      throw new Error("Extractor returned zero rows");
    }

    const planned = planChanges(monitor, snapshot, existing, isFirstRun);
    const client = await pool.connect();
    const transitions: RunResult["transitions"] = [];
    const openAtBaseline: string[] = [];
    try {
      await client.query("BEGIN");
      for (const change of planned) {
        if (change.eventType === "BASELINE" || change.eventType === "NEW_CLOSED" || change.eventType === "UNCHANGED") {
          if (change.eventType === "UNCHANGED") {
            await touchChecked(client, monitor.name, change.housingFundKey, snapshot.fetchedAt);
          } else {
            await upsertBaselineState(client, {
              monitorName: monitor.name,
              targetUrl: snapshot.targetUrl,
              housingFund: change.housingFund,
              housingFundKey: change.housingFundKey,
              status: change.currentStatus,
              now: snapshot.fetchedAt
            });
          }
          if (change.eventType === "BASELINE" && !monitor.isClosedStatus(change.currentStatus)) {
            openAtBaseline.push(`${change.housingFund}=${change.currentStatus}`);
          }
          continue;
        }

        await applyStatusChange(client, {
          monitorName: monitor.name,
          targetUrl: snapshot.targetUrl,
          housingFund: change.housingFund,
          housingFundKey: change.housingFundKey,
          previousStatus: change.previousStatus,
          currentStatus: change.currentStatus,
          now: snapshot.fetchedAt,
          eventType: change.eventType,
          evidenceHtml: snapshot.evidenceHtml,
          parserMethod: snapshot.parserMethod,
          screenshotPath: snapshot.screenshotPath
        });
        transitions.push({
          fund: change.housingFund,
          eventType: change.eventType,
          previous: change.previousStatus,
          current: change.currentStatus
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const run = await recordMonitorSuccess(pool, {
      monitorName: monitor.name,
      targetUrl: monitor.targetUrl,
      now: snapshot.fetchedAt,
      nextCheckAt,
      parserMethod: snapshot.parserMethod
    });

    await handleOperationalState(pool, config, channels, {
      monitorName: monitor.name,
      targetUrl: monitor.targetUrl,
      consecutiveFailures: 0,
      operationalAlertActive: operational.operationalAlertActive,
      operationalTelegramAt: operational.operationalTelegramAt,
      operationalEmailAt: operational.operationalEmailAt,
      recovered: operational.operationalAlertActive
    });

    await dispatchPendingNotifications(pool, config, channels);

    if (openAtBaseline.length > 0) {
      logger.warn(
        { monitor: monitor.name, openAtBaseline },
        "Baseline captured while one or more waiting lists were already non-closed"
      );
    }

    logger.info(
      {
        monitor: monitor.name,
        parserMethod: snapshot.parserMethod,
        funds: snapshot.entities.length,
        isFirstRun,
        transitions: transitions.length,
        consecutiveFailures: run.consecutive_failures
      },
      "Monitor check completed"
    );

    return {
      monitorName: monitor.name,
      ok: true,
      isFirstRun,
      openAtBaseline,
      transitions,
      parserMethod: snapshot.parserMethod,
      entityCount: snapshot.entities.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown monitor error";
    logger.error({ monitor: monitor.name, err: message }, "Monitor check failed; statuses were not changed");
    const run = await recordMonitorFailure(pool, {
      monitorName: monitor.name,
      targetUrl: monitor.targetUrl,
      now: new Date(),
      nextCheckAt,
      error: message
    });
    await handleOperationalState(pool, config, channels, {
      monitorName: monitor.name,
      targetUrl: monitor.targetUrl,
      consecutiveFailures: run.consecutive_failures,
      operationalAlertActive: run.operational_alert_active,
      operationalTelegramAt: run.operational_alert_telegram_at,
      operationalEmailAt: run.operational_alert_email_at,
      recovered: false
    });
    await dispatchPendingNotifications(pool, config, channels);
    return {
      monitorName: monitor.name,
      ok: false,
      isFirstRun,
      openAtBaseline: [],
      transitions: [],
      error: message
    };
  }
}
