import { AddressInfo } from "node:net";
import { extractFindboligWaitingList } from "../src/monitors/findbolig.js";
import { isClosedStatus, type MonitorSnapshot } from "../src/monitors/types.js";
import { createPool } from "../src/database/client.js";
import { runMigrations } from "../src/database/migrate.js";
import { runMonitor } from "../src/engine/runner.js";
import { createHttpServer } from "../src/server/http.js";
import { loadFixture } from "../tests/helpers/fixtures.js";
import { recordingChannels, testConfig } from "../tests/helpers/testDb.js";

const html = loadFixture("findbolig-live-snapshot.html");
const parsed = extractFindboligWaitingList(html);

async function main(): Promise<void> {
  const config = testConfig({ PORT: 0, LOG_LEVEL: "info" });
  const pool = createPool(config);
  await runMigrations(pool);
  await pool.query("TRUNCATE pending_notifications, housing_fund_history, housing_fund_states, monitor_runs RESTART IDENTITY CASCADE");
  const { channels, sent } = recordingChannels();
  const result = await runMonitor(
    pool,
    config,
    {
      name: "findbolig",
      targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
      isClosedStatus,
      async extract(): Promise<MonitorSnapshot> {
        return {
          monitorName: "findbolig",
          targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
          fetchedAt: new Date(),
          entities: parsed.entities,
          evidenceHtml: parsed.evidenceHtml,
          parserMethod: "http"
        };
      }
    },
    channels,
    new Date(Date.now() + 30_000)
  );

  const server = createHttpServer(pool, config);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  const status = await fetch(`http://127.0.0.1:${port}/status`);
  const healthBody = await health.json();
  const statusBody = await status.json();
  console.log(
    JSON.stringify(
      {
        baseline: result,
        notificationsSent: sent.length,
        healthStatus: health.status,
        healthBody,
        statusHttp: status.status,
        funds: parsed.entities,
        statusMonitor: statusBody
      },
      null,
      2
    )
  );
  server.close();
  await pool.end();
  if (health.status !== 200 || sent.length !== 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
