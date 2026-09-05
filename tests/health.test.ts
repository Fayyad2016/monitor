import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AddressInfo } from "node:net";
import { buildHealthPayload, buildStatusPayload, createHttpServer, isHealthFresh } from "../src/server/http.js";
import { runMonitor } from "../src/engine/runner.js";
import { isClosedStatus, type MonitorSnapshot } from "../src/monitors/types.js";
import { createTestPool, recordingChannels, testConfig } from "./helpers/testDb.js";

const pool = await createTestPool();

beforeEach(async () => {
  await pool.query("TRUNCATE pending_notifications, housing_fund_history, housing_fund_states, monitor_runs RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await pool.end();
});

describe("health and status endpoints", () => {
  it("requires a recent successful check for /health 200", () => {
    expect(isHealthFresh(null, 90)).toBe(false);
    expect(isHealthFresh(new Date(), 90)).toBe(true);
    expect(isHealthFresh(new Date(Date.now() - 91_000), 90)).toBe(false);
  });

  it("serves /health and /status after a successful monitor run", async () => {
    const { channels } = recordingChannels();
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
            entities: [{ key: "arendal", displayName: "Arendal", status: "Lukket" }],
            evidenceHtml: "<table></table>",
            parserMethod: "http"
          };
        }
      },
      channels,
      new Date(Date.now() + 30_000)
    );

    const config = testConfig();
    const health = await buildHealthPayload(pool, config);
    expect(health.status).toBe("ok");
    expect(health.postgres).toBe(true);
    const status = await buildStatusPayload(pool, config);
    expect(status.intervalSeconds).toBe(30);
    expect(status.monitors[0]?.name).toBe("findbolig");
    expect(status.monitors[0]?.currentHousingFundStatuses[0]?.housingFund).toBe("Arendal");
    expect(JSON.stringify(status)).not.toContain("test-token");
    expect(JSON.stringify(status)).not.toContain("pass");

    const server = createHttpServer(pool, config, recordingChannels().channels);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    const statusRes = await fetch(`http://127.0.0.1:${port}/status`);
    expect(healthRes.status).toBe(200);
    expect(statusRes.status).toBe(200);
    const healthBody = (await healthRes.json()) as { postgres: boolean };
    expect(healthBody.postgres).toBe(true);

    const unauthorized = await fetch(`http://127.0.0.1:${port}/test-notifications`, { method: "POST" });
    expect(unauthorized.status).toBe(401);
    const testRes = await fetch(`http://127.0.0.1:${port}/test-notifications`, {
      method: "POST",
      headers: { Authorization: "Bearer test-notify-token" }
    });
    expect(testRes.status).toBe(200);
    const testBody = (await testRes.json()) as { telegram: string; email: string };
    expect(testBody).toEqual({ telegram: "sent", email: "sent" });
    expect(JSON.stringify(testBody)).not.toContain("test-notify-token");
    server.close();
  });
});
