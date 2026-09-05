import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AddressInfo } from "node:net";
import { createHttpServer } from "../src/server/http.js";
import { runMonitor } from "../src/engine/runner.js";
import { isClosedStatus, type MonitorSnapshot } from "../src/monitors/types.js";
import { buildEmailBody, buildEmailSubject, buildTelegramMessage } from "../src/notifications/types.js";
import { buildSimulatedOpenPayload, sendTestNotifications } from "../src/notifications/testSend.js";
import { createTestPool, recordingChannels, testConfig } from "./helpers/testDb.js";

const pool = await createTestPool();

async function snapshotTables() {
  const [states, history, pending, runs] = await Promise.all([
    pool.query("SELECT * FROM housing_fund_states ORDER BY id"),
    pool.query("SELECT * FROM housing_fund_history ORDER BY id"),
    pool.query("SELECT * FROM pending_notifications ORDER BY id"),
    pool.query("SELECT * FROM monitor_runs ORDER BY monitor_name")
  ]);
  return JSON.stringify({
    states: states.rows,
    history: history.rows,
    pending: pending.rows,
    runs: runs.rows
  });
}

beforeEach(async () => {
  await pool.query(
    "TRUNCATE pending_notifications, housing_fund_history, housing_fund_states, monitor_runs RESTART IDENTITY CASCADE"
  );
});

afterAll(async () => {
  await pool.end();
});

describe("simulated OPEN notifications", () => {
  it("renders the production OPEN fields with TEST banners", () => {
    const payload = buildSimulatedOpenPayload(
      testConfig(),
      "Fuglevænget",
      new Date("2026-09-05T04:50:12.000Z")
    );
    expect(payload.eventType).toBe("OPENED");
    expect(payload.simulated).toBe(true);
    const telegram = buildTelegramMessage(payload);
    expect(telegram).toContain("🧪 TEST — NOT A REAL OPENING");
    expect(telegram).toContain("🚨 FINDBOLIG WAITING LIST OPEN");
    expect(telegram).toContain("Housing fund: Fuglevænget");
    expect(telegram).toContain("Previous: Lukket");
    expect(telegram).toContain("Current: Åben");
    expect(telegram).toContain("Europe/Copenhagen");
    expect(telegram).toContain("https://www.findbolig.nu/da-dk/udlejere");
    expect(telegram).toContain("⚠️ TEST ONLY — Findbolig did not actually change.");
    expect(buildEmailSubject(payload)).toBe("🧪 TEST — Findbolig OPEN — Fuglevænget");
    const email = buildEmailBody(payload);
    expect(email).toContain("Housing fund: Fuglevænget");
    expect(email).toContain("Previous status: Lukket");
    expect(email).toContain("New status: Åben");
    expect(email).toContain("simulation");
  });

  it("does not mutate housing fund state, history, pending alerts, or monitor runs", async () => {
    const { sent, channels } = recordingChannels();
    await runMonitor(
      pool,
      testConfig(),
      {
        name: "findbolig",
        targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
        isClosedStatus,
        async extract(): Promise<MonitorSnapshot> {
          return {
            monitorName: "findbolig",
            targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
            fetchedAt: new Date(),
            entities: [{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }],
            evidenceHtml: "<table></table>",
            parserMethod: "http"
          };
        }
      },
      channels,
      new Date(Date.now() + 30_000)
    );
    sent.length = 0;
    const before = await snapshotTables();

    const config = testConfig();
    const server = createHttpServer(pool, config, channels);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/test-notifications`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-notify-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ type: "open", housingFund: "Fuglevænget" })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ telegram: "sent", email: "sent" });
    server.close();

    expect(await snapshotTables()).toBe(before);
    const pending = await pool.query("SELECT count(*)::int AS n FROM pending_notifications");
    expect(pending.rows[0]?.n).toBe(0);
    const history = await pool.query("SELECT count(*)::int AS n FROM housing_fund_history");
    expect(history.rows[0]?.n).toBe(0);
    const state = await pool.query(
      "SELECT current_status, last_changed_at, telegram_notified_at, email_notified_at FROM housing_fund_states WHERE housing_fund = $1",
      ["Fuglevænget"]
    );
    expect(state.rows[0]?.current_status).toBe("Lukket");
    expect(state.rows[0]?.last_changed_at).toBeNull();
    expect(state.rows[0]?.telegram_notified_at).toBeNull();
    expect(state.rows[0]?.email_notified_at).toBeNull();
    expect(sent).toHaveLength(2);
    expect(sent.every((item) => item.payload.simulated === true && item.payload.eventType === "OPENED")).toBe(true);
  });

  it("sendTestNotifications never needs a database pool", async () => {
    const { sent, channels } = recordingChannels();
    const result = await sendTestNotifications(testConfig(), channels, {
      type: "open",
      housingFund: "Fuglevænget"
    });
    expect(result).toEqual({ telegram: "sent", email: "sent" });
    expect(sent.map((item) => item.channel).sort()).toEqual(["email", "telegram"]);
  });

  it("rejects unknown test types without sending", async () => {
    const { sent, channels } = recordingChannels();
    await expect(
      sendTestNotifications(testConfig(), channels, { type: "mutate-state" })
    ).rejects.toThrow("Invalid type");
    expect(sent).toHaveLength(0);
  });
});
