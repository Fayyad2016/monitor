import type { AppConfig } from "../config.js";
import type { DbPool } from "../database/client.js";
import { runMonitor, type RunResult } from "../engine/runner.js";
import { logger } from "../logger.js";
import type { MonitorDefinition } from "../monitors/types.js";
import type { NotificationChannel } from "../notifications/types.js";

export class MonitorScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;
  private inFlight: Promise<unknown> | undefined;

  constructor(
    private readonly pool: DbPool,
    private readonly config: AppConfig,
    private readonly monitors: MonitorDefinition[],
    private readonly channels: NotificationChannel[]
  ) {}

  start(options: { runImmediately?: boolean } = { runImmediately: true }): void {
    this.stopping = false;
    const delayMs = this.config.CHECK_INTERVAL_SECONDS * 1000;
    const scheduleNext = () => {
      if (!this.stopping) {
        this.timer = setTimeout(() => {
          this.inFlight = this.runCycle().finally(scheduleNext);
        }, delayMs);
      }
    };
    if (options.runImmediately) {
      this.inFlight = this.runCycle().finally(scheduleNext);
    } else {
      scheduleNext();
    }
  }

  async runCycle(): Promise<RunResult[]> {
    if (this.running) {
      logger.warn("Skipping monitor cycle because a previous run is still in progress");
      return [];
    }
    this.running = true;
    const results: RunResult[] = [];
    try {
      const nextCheckAt = new Date(Date.now() + this.config.CHECK_INTERVAL_SECONDS * 1000);
      for (const monitor of this.monitors) {
        results.push(await runMonitor(this.pool, this.config, monitor, this.channels, nextCheckAt));
      }
      return results;
    } finally {
      this.running = false;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (this.inFlight) {
      await this.inFlight;
    }
  }
}
