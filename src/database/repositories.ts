import type { DbClient, DbPool } from "./client.js";

export interface HousingFundState {
  id: number;
  monitor_name: string;
  target_url: string;
  housing_fund: string;
  housing_fund_key: string;
  previous_status: string | null;
  current_status: string;
  first_seen_at: Date;
  last_checked_at: Date;
  last_changed_at: Date | null;
  telegram_notified_at: Date | null;
  email_notified_at: Date | null;
}

export interface PendingNotification {
  id: number;
  monitor_name: string;
  target_url: string;
  housing_fund: string;
  housing_fund_key: string;
  event_type: string;
  previous_status: string | null;
  current_status: string | null;
  detected_at: Date;
  evidence_html: string | null;
  telegram_sent_at: Date | null;
  email_sent_at: Date | null;
  last_attempt_at: Date | null;
  last_error: string | null;
}

export interface MonitorRun {
  monitor_name: string;
  target_url: string;
  last_success_at: Date | null;
  last_failure_at: Date | null;
  last_error: string | null;
  consecutive_failures: number;
  last_parser_method: string | null;
  operational_alert_active: boolean;
  operational_alert_telegram_at: Date | null;
  operational_alert_email_at: Date | null;
  recovery_telegram_at: Date | null;
  recovery_email_at: Date | null;
  next_check_at: Date | null;
  updated_at: Date;
}

export async function listStates(client: DbPool | DbClient, monitorName: string): Promise<HousingFundState[]> {
  const result = await client.query<HousingFundState>(
    `SELECT * FROM housing_fund_states WHERE monitor_name = $1 ORDER BY housing_fund`,
    [monitorName]
  );
  return result.rows;
}

export async function listAllStates(client: DbPool | DbClient): Promise<HousingFundState[]> {
  const result = await client.query<HousingFundState>(
    `SELECT * FROM housing_fund_states ORDER BY monitor_name, housing_fund`
  );
  return result.rows;
}

export async function upsertBaselineState(
  client: DbClient,
  row: {
    monitorName: string;
    targetUrl: string;
    housingFund: string;
    housingFundKey: string;
    status: string;
    now: Date;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO housing_fund_states (
      monitor_name, target_url, housing_fund, housing_fund_key,
      previous_status, current_status, first_seen_at, last_checked_at, last_changed_at
    ) VALUES ($1,$2,$3,$4,NULL,$5,$6,$6,NULL)
    ON CONFLICT (monitor_name, housing_fund_key) DO UPDATE SET
      last_checked_at = EXCLUDED.last_checked_at,
      target_url = EXCLUDED.target_url,
      housing_fund = EXCLUDED.housing_fund`,
    [row.monitorName, row.targetUrl, row.housingFund, row.housingFundKey, row.status, row.now]
  );
}

export async function applyStatusChange(
  client: DbClient,
  row: {
    monitorName: string;
    targetUrl: string;
    housingFund: string;
    housingFundKey: string;
    previousStatus: string | null;
    currentStatus: string;
    now: Date;
    eventType: string;
    evidenceHtml: string;
    parserMethod: string;
    screenshotPath?: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO housing_fund_states (
      monitor_name, target_url, housing_fund, housing_fund_key,
      previous_status, current_status, first_seen_at, last_checked_at, last_changed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)
    ON CONFLICT (monitor_name, housing_fund_key) DO UPDATE SET
      previous_status = EXCLUDED.previous_status,
      current_status = EXCLUDED.current_status,
      last_checked_at = EXCLUDED.last_checked_at,
      last_changed_at = EXCLUDED.last_changed_at,
      target_url = EXCLUDED.target_url,
      housing_fund = EXCLUDED.housing_fund`,
    [
      row.monitorName,
      row.targetUrl,
      row.housingFund,
      row.housingFundKey,
      row.previousStatus,
      row.currentStatus,
      row.now
    ]
  );

  await client.query(
    `INSERT INTO housing_fund_history (
      monitor_name, housing_fund, housing_fund_key, previous_status, current_status,
      event_type, detected_at, evidence_html, screenshot_path, parser_method
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      row.monitorName,
      row.housingFund,
      row.housingFundKey,
      row.previousStatus,
      row.currentStatus,
      row.eventType,
      row.now,
      row.evidenceHtml,
      row.screenshotPath ?? null,
      row.parserMethod
    ]
  );

  if (row.eventType === "OPENED" || row.eventType === "CLOSED" || row.eventType === "CHANGED") {
    await client.query(
      `INSERT INTO pending_notifications (
        monitor_name, target_url, housing_fund, housing_fund_key, event_type,
        previous_status, current_status, detected_at, evidence_html
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (monitor_name, housing_fund_key, event_type, detected_at) DO NOTHING`,
      [
        row.monitorName,
        row.targetUrl,
        row.housingFund,
        row.housingFundKey,
        row.eventType,
        row.previousStatus,
        row.currentStatus,
        row.now,
        row.evidenceHtml
      ]
    );
  }
}

export async function touchChecked(
  client: DbClient,
  monitorName: string,
  housingFundKey: string,
  now: Date
): Promise<void> {
  await client.query(
    `UPDATE housing_fund_states SET last_checked_at = $3 WHERE monitor_name = $1 AND housing_fund_key = $2`,
    [monitorName, housingFundKey, now]
  );
}

export async function markChannelNotified(
  client: DbPool | DbClient,
  state: { monitorName: string; housingFundKey: string; channel: "telegram" | "email"; at: Date }
): Promise<void> {
  const column = state.channel === "telegram" ? "telegram_notified_at" : "email_notified_at";
  await client.query(
    `UPDATE housing_fund_states SET ${column} = $3 WHERE monitor_name = $1 AND housing_fund_key = $2`,
    [state.monitorName, state.housingFundKey, state.at]
  );
}

export async function listUnsentNotifications(client: DbPool | DbClient): Promise<PendingNotification[]> {
  const result = await client.query<PendingNotification>(
    `SELECT * FROM pending_notifications
     WHERE telegram_sent_at IS NULL OR email_sent_at IS NULL
     ORDER BY detected_at ASC, id ASC`
  );
  return result.rows;
}

export async function markNotificationChannelSent(
  client: DbPool | DbClient,
  id: number,
  channel: "telegram" | "email",
  at: Date
): Promise<void> {
  const column = channel === "telegram" ? "telegram_sent_at" : "email_sent_at";
  await client.query(
    `UPDATE pending_notifications SET ${column} = $2, last_attempt_at = $2, last_error = NULL WHERE id = $1`,
    [id, at]
  );
}

export async function markNotificationAttemptError(
  client: DbPool | DbClient,
  id: number,
  message: string,
  at: Date
): Promise<void> {
  await client.query(
    `UPDATE pending_notifications SET last_attempt_at = $2, last_error = $3 WHERE id = $1`,
    [id, at, message]
  );
}

export async function getMonitorRun(client: DbPool | DbClient, monitorName: string): Promise<MonitorRun | null> {
  const result = await client.query<MonitorRun>(`SELECT * FROM monitor_runs WHERE monitor_name = $1`, [monitorName]);
  return result.rows[0] ?? null;
}

export async function listMonitorRuns(client: DbPool | DbClient): Promise<MonitorRun[]> {
  const result = await client.query<MonitorRun>(`SELECT * FROM monitor_runs ORDER BY monitor_name`);
  return result.rows;
}

export async function recordMonitorSuccess(
  client: DbPool | DbClient,
  row: {
    monitorName: string;
    targetUrl: string;
    now: Date;
    nextCheckAt: Date;
    parserMethod: string;
  }
): Promise<MonitorRun> {
  const result = await client.query<MonitorRun>(
    `INSERT INTO monitor_runs (
      monitor_name, target_url, last_success_at, consecutive_failures, last_error,
      last_parser_method, next_check_at, updated_at
    ) VALUES ($1,$2,$3,0,NULL,$4,$5,$3)
    ON CONFLICT (monitor_name) DO UPDATE SET
      target_url = EXCLUDED.target_url,
      last_success_at = EXCLUDED.last_success_at,
      consecutive_failures = 0,
      last_error = NULL,
      last_parser_method = EXCLUDED.last_parser_method,
      next_check_at = EXCLUDED.next_check_at,
      updated_at = EXCLUDED.updated_at
    RETURNING *`,
    [row.monitorName, row.targetUrl, row.now, row.parserMethod, row.nextCheckAt]
  );
  return result.rows[0]!;
}

export async function recordMonitorFailure(
  client: DbPool | DbClient,
  row: {
    monitorName: string;
    targetUrl: string;
    now: Date;
    nextCheckAt: Date;
    error: string;
  }
): Promise<MonitorRun> {
  const result = await client.query<MonitorRun>(
    `INSERT INTO monitor_runs (
      monitor_name, target_url, last_failure_at, consecutive_failures, last_error, next_check_at, updated_at
    ) VALUES ($1,$2,$3,1,$4,$5,$3)
    ON CONFLICT (monitor_name) DO UPDATE SET
      target_url = EXCLUDED.target_url,
      last_failure_at = EXCLUDED.last_failure_at,
      consecutive_failures = monitor_runs.consecutive_failures + 1,
      last_error = EXCLUDED.last_error,
      next_check_at = EXCLUDED.next_check_at,
      updated_at = EXCLUDED.updated_at
    RETURNING *`,
    [row.monitorName, row.targetUrl, row.now, row.error, row.nextCheckAt]
  );
  return result.rows[0]!;
}

export async function setOperationalAlert(
  client: DbPool | DbClient,
  monitorName: string,
  active: boolean,
  channel: "telegram" | "email" | "both" | "none",
  at: Date
): Promise<void> {
  const telegram = channel === "telegram" || channel === "both" ? at : null;
  const email = channel === "email" || channel === "both" ? at : null;
  await client.query(
    `UPDATE monitor_runs SET
      operational_alert_active = $2,
      operational_alert_telegram_at = COALESCE($3, operational_alert_telegram_at),
      operational_alert_email_at = COALESCE($4, operational_alert_email_at),
      updated_at = $5
     WHERE monitor_name = $1`,
    [monitorName, active, telegram, email, at]
  );
}

export async function markRecoverySent(
  client: DbPool | DbClient,
  monitorName: string,
  channel: "telegram" | "email",
  at: Date
): Promise<void> {
  const column = channel === "telegram" ? "recovery_telegram_at" : "recovery_email_at";
  await client.query(
    `UPDATE monitor_runs SET ${column} = $2, operational_alert_active = FALSE, updated_at = $2 WHERE monitor_name = $1`,
    [monitorName, at]
  );
}

export async function clearOperationalAlert(client: DbPool | DbClient, monitorName: string, at: Date): Promise<void> {
  await client.query(
    `UPDATE monitor_runs SET operational_alert_active = FALSE, updated_at = $2 WHERE monitor_name = $1`,
    [monitorName, at]
  );
}
