# Generic monitoring platform

Production-ready website monitoring service. Monitors are independent modules under `src/monitors`. The first monitor is **Findbolig**.

## What it does

- Checks [Findbolig udlejere](https://www.findbolig.nu/da-dk/udlejere) every **30 seconds** by default (`CHECK_INTERVAL_SECONDS`)
- Extracts every row from **Status for eksterne ventelister** (not generic HTML diffs)
- Automatically picks up new housing funds when Findbolig adds rows
- Persists state in PostgreSQL so Railway restarts do not send duplicate alerts
- Alerts on real status transitions only (after a stored baseline exists)
- On Lukket → open/non-closed, sends **Telegram and Email immediately** in the same check (does not wait for the next cycle)
- Sends **Telegram** (primary) and **Email** (secondary) independently, with per-channel retry
- Never overlaps checks: if a run exceeds 30 seconds, the next run starts only after it finishes
- Exposes `GET /health` and `GET /status`

Normal waiting-list status is usually `Lukket`. A critical event is any change from closed to another value (`Åben`, `Åbent`, `Open`, `Tilmelding åben`, or any other non-closed value). When a list later returns to `Lukket`, one CLOSED Telegram message and one CLOSED email are sent.

## Architecture

```text
src/
  monitors/findbolig.ts    # site-specific extractor
  notifications/           # telegram.ts, email.ts
  database/                # PostgreSQL + repeatable migrations
  engine/                  # comparison, runner, operational alerts
  scheduler/               # 30s cadence, overlap lock, graceful stop
  server/                  # /health and /status
```

Add another website later by creating `src/monitors/<name>.ts` and registering it in `src/monitors/registry.ts`.

## First-run behavior

On the first successful check for a monitor, current rows are stored as the baseline. No OPENED/CLOSED notifications are sent just because the database was empty. Alerts start only after a later observed transition.

If a waiting list is already open during that baseline, the process logs a warning. Check `/status` after the first deploy.

## Local development

```bash
cp .env.example .env
# fill DATABASE_URL and notification settings in .env — never commit .env
npm ci
npm run typecheck
npm run lint
npm test
npm run build
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/monitor npm start
```

`npm test` expects PostgreSQL at `postgres://monitor:monitor@127.0.0.1:5432/monitor_test` or `TEST_DATABASE_URL`.

Live extractor (read-only, does not register or click anything):

```bash
npm run live:extract
```

## Environment variables

Copy names from `.env.example`. Do not put real secrets in git.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (Railway sets this automatically) |
| `DATABASE_URL` | PostgreSQL connection string |
| `CHECK_INTERVAL_SECONDS` | Default `30` (production) |
| `TIMEZONE` | Default `Europe/Copenhagen` |
| `MONITOR_FAILURE_ALERT_THRESHOLD` | Default `3` consecutive failures before an operational alert |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Primary alerts |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_TLS_SERVERNAME` `SMTP_USER` `SMTP_PASSWORD` `EMAIL_FROM` `ALERT_EMAIL` | Email. `SMTP_HOST` must be a bare hostname (no quotes, spaces, `smtp://`, or `:465`). |
| `TEST_NOTIFICATION_TOKEN` | Protects `POST /test-notifications`. Body `{ "type": "open", "housingFund": "Fuglevænget" }` sends a simulated OPEN using the production formatter (no DB writes). Omit `type` for a generic operational ping. |
| `PLAYWRIGHT_FALLBACK` | Default `true`. Used when HTTP/Cheerio extraction fails |
| `TLS_REJECT_UNAUTHORIZED` | Default `true`. Do not disable in production |

Secrets (`TELEGRAM_BOT_TOKEN`, `SMTP_PASSWORD`, database credentials) are never printed by `/health`, `/status`, or structured logs.

## Railway (Pro) deployment

1. Create a Railway project from `https://github.com/Fayyad2016/monitor.git` (`main`).
2. Add a **PostgreSQL** plugin/service. Railway will inject `DATABASE_URL`.
3. Deploy this repo as a web service using the included `Dockerfile` / `railway.json`.
4. In the service **Variables**, set:

   - `CHECK_INTERVAL_SECONDS=30`
   - `TIMEZONE=Europe/Copenhagen`
   - `MONITOR_FAILURE_ALERT_THRESHOLD=3`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `SMTP_HOST` (bare hostname only, for example `server324-2.web-hosting.com`)
   - `SMTP_PORT=465`
   - `SMTP_SECURE=true`
   - `SMTP_TLS_SERVERNAME` (optional; defaults to sanitized `SMTP_HOST`)
   - `SMTP_USER`
   - `SMTP_PASSWORD`
   - `EMAIL_FROM`
   - `ALERT_EMAIL`
   - `TEST_NOTIFICATION_TOKEN`
   - `PLAYWRIGHT_FALLBACK=true`
   - `TLS_REJECT_UNAUTHORIZED=true`

   Railway provides `PORT` and `DATABASE_URL`. Do not hard-code them.

5. Confirm the service stays running (not a one-shot job).
6. Verify:

   - `GET https://<service>/health` → HTTP 200
   - `GET https://<service>/status` → monitor name, URL, fund statuses, last check, next check
   - Telegram/Email: `POST /test-notifications` with `Authorization: Bearer <TEST_NOTIFICATION_TOKEN>`
     returns `{ "telegram": "sent"|"failed", "email": "sent"|"failed" }` without changing monitor state

Migrations run on every boot and are idempotent (`CREATE TABLE IF NOT EXISTS` / `ON CONFLICT`).

## Reliability

- HTTP/Cheerio first, with the public RapidSSL intermediate added to the trust store so Findbolig’s incomplete chain still verifies
- Playwright/Chromium fallback when HTTP retrieval or parsing fails (`PLAYWRIGHT_FALLBACK`, default true)
- Parse/fetch failures never rewrite stored statuses
- Operational warning after repeated failures, then a single recovery notice
- Evidence HTML is stored on each recorded transition

## License

Private / as used by the repository owner.
