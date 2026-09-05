import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runMonitor } from "../src/engine/runner.js";
import { listStates, listUnsentNotifications } from "../src/database/repositories.js";
import { isClosedStatus, type MonitorDefinition, type MonitorSnapshot } from "../src/monitors/types.js";
import { createTestPool, recordingChannels, testConfig } from "./helpers/testDb.js";

const pool = await createTestPool();

function fakeMonitor(entities: MonitorSnapshot["entities"], failTimes = { left: 0 }): MonitorDefinition {
  return {
    name: "findbolig",
    targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
    isClosedStatus,
    async extract(): Promise<MonitorSnapshot> {
      if (failTimes.left > 0) {
        failTimes.left -= 1;
        throw new Error("transient scrape failure");
      }
      return {
        monitorName: "findbolig",
        targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
        fetchedAt: new Date(),
        entities,
        evidenceHtml: "<table data-evidence=\"true\"><tr><td>Fuglevænget</td></tr></table>",
        parserMethod: "http"
      };
    }
  };
}

const nextCheck = () => new Date(Date.now() + 30_000);

beforeEach(async () => {
  await pool.query("TRUNCATE pending_notifications, housing_fund_history, housing_fund_states, monitor_runs RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await pool.end();
});

describe("monitor runner", () => {
  it("stores a baseline on the first successful run without sending alerts", async () => {
    const { sent, channels } = recordingChannels();
    const result = await runMonitor(
      pool,
      testConfig(),
      fakeMonitor([
        { key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" },
        { key: "arendal", displayName: "Arendal", status: "Åben" }
      ]),
      channels,
      nextCheck()
    );
    expect(result.isFirstRun).toBe(true);
    expect(result.openAtBaseline).toEqual(["Arendal=Åben"]);
    expect(sent).toHaveLength(0);
    const pending = await listUnsentNotifications(pool);
    expect(pending).toHaveLength(0);
    const states = await listStates(pool, "findbolig");
    expect(states).toHaveLength(2);
  });

  it("alerts once on Lukket -> Åben and not while the open state remains", async () => {
    const { sent, channels } = recordingChannels();
    const closed = fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }]);
    await runMonitor(pool, testConfig(), closed, channels, nextCheck());
    const opened = fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }]);
    await runMonitor(pool, testConfig(), opened, channels, nextCheck());
    await runMonitor(pool, testConfig(), opened, channels, nextCheck());
    const openEvents = sent.filter((item) => item.payload.eventType === "OPENED");
    expect(openEvents).toHaveLength(2);
    expect(openEvents.map((item) => item.channel).sort()).toEqual(["email", "telegram"]);
    expect(sent.some((item) => item.payload.eventType === "OPENED" && item.channel === "telegram")).toBe(true);
    expect(sent.some((item) => item.payload.eventType === "OPENED" && item.channel === "email")).toBe(true);
  });

  it("sends Telegram and Email in the same check as the Lukket to open transition", async () => {
    const { sent, channels } = recordingChannels();
    await runMonitor(
      pool,
      testConfig(),
      fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }]),
      channels,
      nextCheck()
    );
    const result = await runMonitor(
      pool,
      testConfig(),
      fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }]),
      channels,
      nextCheck()
    );
    expect(result.ok).toBe(true);
    expect(result.transitions).toEqual([
      expect.objectContaining({ eventType: "OPENED", fund: "Fuglevænget", previous: "Lukket", current: "Åben" })
    ]);
    expect(sent.filter((item) => item.payload.eventType === "OPENED").map((item) => item.channel).sort()).toEqual([
      "email",
      "telegram"
    ]);
  });

  it("stores CLOSED history and notifies once when a list closes again", async () => {
    const { sent, channels } = recordingChannels();
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }]), channels, nextCheck());
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }]), channels, nextCheck());
    sent.length = 0;
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }]), channels, nextCheck());
    const closed = sent.filter((item) => item.payload.eventType === "CLOSED");
    expect(closed).toHaveLength(2);
    const history = await pool.query(`SELECT * FROM housing_fund_history WHERE event_type = 'CLOSED'`);
    expect(history.rowCount).toBe(1);
    expect(history.rows[0]?.evidence_html).toContain("data-evidence");
  });

  it("retries only the failed notification channel", async () => {
    const { sent, fail, channels } = recordingChannels();
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }]), channels, nextCheck());
    fail.add("email");
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }]), channels, nextCheck());
    expect(sent.filter((item) => item.channel === "telegram")).toHaveLength(1);
    expect(sent.filter((item) => item.channel === "email")).toHaveLength(0);
    const pending = await listUnsentNotifications(pool);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.telegram_sent_at).not.toBeNull();
    expect(pending[0]?.email_sent_at).toBeNull();
    fail.delete("email");
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }]), channels, nextCheck());
    expect(sent.filter((item) => item.channel === "email")).toHaveLength(1);
    expect(sent.filter((item) => item.channel === "telegram")).toHaveLength(1);
  });

  it("does not treat a parse/fetch failure as a status change", async () => {
    const { sent, channels } = recordingChannels();
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }]), channels, nextCheck());
    const failing = fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }], { left: 1 });
    const failed = await runMonitor(pool, testConfig(), failing, channels, nextCheck());
    expect(failed.ok).toBe(false);
    const states = await listStates(pool, "findbolig");
    expect(states[0]?.current_status).toBe("Lukket");
    expect(sent).toHaveLength(0);
  });

  it("does not emit duplicate alerts after a restart that reloads persisted state", async () => {
    const { sent, channels } = recordingChannels();
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }]), channels, nextCheck());
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }]), channels, nextCheck());
    const afterOpen = sent.length;
    const restarted = recordingChannels();
    await runMonitor(
      pool,
      testConfig(),
      fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }]),
      restarted.channels,
      nextCheck()
    );
    expect(restarted.sent).toHaveLength(0);
    expect(afterOpen).toBe(2);
  });

  it("sends an operational warning only after the failure threshold and one recovery notice", async () => {
    const { sent, channels } = recordingChannels();
    const failTimes = { left: 3 };
    const monitor = fakeMonitor([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Lukket" }], failTimes);
    await runMonitor(pool, testConfig({ MONITOR_FAILURE_ALERT_THRESHOLD: 3 }), monitor, channels, nextCheck());
    await runMonitor(pool, testConfig({ MONITOR_FAILURE_ALERT_THRESHOLD: 3 }), monitor, channels, nextCheck());
    expect(sent.some((item) => item.payload.eventType === "OPERATIONAL_FAILURE")).toBe(false);
    await runMonitor(pool, testConfig({ MONITOR_FAILURE_ALERT_THRESHOLD: 3 }), monitor, channels, nextCheck());
    expect(sent.filter((item) => item.payload.eventType === "OPERATIONAL_FAILURE")).toHaveLength(2);
    sent.length = 0;
    await runMonitor(pool, testConfig({ MONITOR_FAILURE_ALERT_THRESHOLD: 3 }), monitor, channels, nextCheck());
    expect(sent.some((item) => item.payload.eventType === "OPERATIONAL_FAILURE")).toBe(false);
    expect(sent.filter((item) => item.payload.eventType === "OPERATIONAL_RECOVERY")).toHaveLength(2);
  });

  it("detects a newly added housing fund after baseline exists", async () => {
    const { sent, channels } = recordingChannels();
    await runMonitor(pool, testConfig(), fakeMonitor([{ key: "arendal", displayName: "Arendal", status: "Lukket" }]), channels, nextCheck());
    await runMonitor(
      pool,
      testConfig(),
      fakeMonitor([
        { key: "arendal", displayName: "Arendal", status: "Lukket" },
        { key: "ny fond", displayName: "Ny Fond", status: "Åben" }
      ]),
      channels,
      nextCheck()
    );
    expect(sent.some((item) => item.payload.housingFund === "Ny Fond" && item.payload.eventType === "OPENED")).toBe(true);
  });
});
