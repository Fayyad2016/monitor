import type { DbPool } from "./client.js";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS housing_fund_states (
  id BIGSERIAL PRIMARY KEY,
  monitor_name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  housing_fund TEXT NOT NULL,
  housing_fund_key TEXT NOT NULL,
  previous_status TEXT,
  current_status TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL,
  last_changed_at TIMESTAMPTZ,
  telegram_notified_at TIMESTAMPTZ,
  email_notified_at TIMESTAMPTZ,
  UNIQUE (monitor_name, housing_fund_key)
);

CREATE TABLE IF NOT EXISTS housing_fund_history (
  id BIGSERIAL PRIMARY KEY,
  monitor_name TEXT NOT NULL,
  housing_fund TEXT NOT NULL,
  housing_fund_key TEXT NOT NULL,
  previous_status TEXT,
  current_status TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  evidence_html TEXT,
  screenshot_path TEXT,
  parser_method TEXT
);

CREATE TABLE IF NOT EXISTS pending_notifications (
  id BIGSERIAL PRIMARY KEY,
  monitor_name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  housing_fund TEXT NOT NULL,
  housing_fund_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  current_status TEXT,
  detected_at TIMESTAMPTZ NOT NULL,
  evidence_html TEXT,
  telegram_sent_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  UNIQUE (monitor_name, housing_fund_key, event_type, detected_at)
);

CREATE TABLE IF NOT EXISTS monitor_runs (
  monitor_name TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_parser_method TEXT,
  operational_alert_active BOOLEAN NOT NULL DEFAULT FALSE,
  operational_alert_telegram_at TIMESTAMPTZ,
  operational_alert_email_at TIMESTAMPTZ,
  recovery_telegram_at TIMESTAMPTZ,
  recovery_email_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_notifications_unsent_idx
  ON pending_notifications ((telegram_sent_at IS NULL), (email_sent_at IS NULL));
`;

export async function runMigrations(pool: DbPool): Promise<void> {
  await pool.query(MIGRATION_SQL);
  await pool.query(
    `INSERT INTO schema_migrations (id) VALUES ('001_init') ON CONFLICT (id) DO NOTHING`
  );
}
