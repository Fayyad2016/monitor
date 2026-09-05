import { getConfig } from "./config.js";
import { createPool } from "./database/client.js";
import { runMigrations } from "./database/migrate.js";
import { logger } from "./logger.js";
import { loadMonitors } from "./monitors/registry.js";
import { createNotificationChannels } from "./notifications/dispatcher.js";
import { MonitorScheduler } from "./scheduler/scheduler.js";
import { createHttpServer } from "./server/http.js";

async function main(): Promise<void> {
  const config = getConfig();
  if (!config.TLS_REJECT_UNAUTHORIZED) {
    logger.warn("TLS_REJECT_UNAUTHORIZED=false is enabled; use only for local diagnostics");
  }
  process.env.TZ = config.TIMEZONE;

  const pool = createPool(config);
  await runMigrations(pool);
  logger.info(
    { timezone: config.TIMEZONE, checkIntervalSeconds: config.CHECK_INTERVAL_SECONDS },
    "Database migrations applied"
  );

  const monitors = loadMonitors(config);
  const channels = createNotificationChannels(config);
  const scheduler = new MonitorScheduler(pool, config, monitors, channels);
  const server = createHttpServer(pool, config);

  await scheduler.runCycle();

  await new Promise<void>((resolve) => {
    server.listen(config.PORT, "0.0.0.0", () => {
      logger.info({ port: config.PORT, monitors: monitors.map((m) => m.name) }, "Monitor service listening");
      resolve();
    });
  });

  scheduler.start({ runImmediately: false });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Graceful shutdown started");
    server.close();
    await scheduler.stop();
    await pool.end();
    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((error: unknown) => {
  logger.error({ err: error instanceof Error ? error.message : error }, "Fatal startup error");
  process.exit(1);
});
