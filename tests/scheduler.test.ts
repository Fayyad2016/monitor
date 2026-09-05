import { describe, expect, it } from "vitest";
import { delayUntilNextCheckMs, MonitorScheduler } from "../src/scheduler/scheduler.js";
import { isClosedStatus, type MonitorSnapshot } from "../src/monitors/types.js";
import { createTestPool, recordingChannels, testConfig } from "./helpers/testDb.js";

describe("scheduler cadence", () => {
  it("waits the remaining interval after a fast check", () => {
    expect(delayUntilNextCheckMs(5_000, 30)).toBe(25_000);
    expect(delayUntilNextCheckMs(0, 30)).toBe(30_000);
  });

  it("starts the next check immediately when the previous check overruns the interval", () => {
    expect(delayUntilNextCheckMs(30_000, 30)).toBe(0);
    expect(delayUntilNextCheckMs(45_000, 30)).toBe(0);
  });

  it("never runs two checks at the same time", async () => {
    const pool = await createTestPool();
    let concurrent = 0;
    let maxConcurrent = 0;
    let runs = 0;
    const { channels } = recordingChannels();
    const scheduler = new MonitorScheduler(
      pool,
      testConfig({ CHECK_INTERVAL_SECONDS: 30 }),
      [
        {
          name: "findbolig",
          targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
          isClosedStatus,
          async extract(): Promise<MonitorSnapshot> {
            runs += 1;
            concurrent += 1;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            await new Promise((resolve) => setTimeout(resolve, 75));
            concurrent -= 1;
            return {
              monitorName: "findbolig",
              targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
              fetchedAt: new Date(),
              entities: [{ key: "arendal", displayName: "Arendal", status: "Lukket" }],
              evidenceHtml: "<table></table>",
              parserMethod: "http"
            };
          }
        }
      ],
      channels
    );

    const first = scheduler.runCycle();
    const skipped = await scheduler.runCycle();
    await first;
    expect(skipped).toEqual([]);
    expect(maxConcurrent).toBe(1);
    expect(runs).toBe(1);
    await pool.end();
  });
});
