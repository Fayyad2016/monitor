import type { AppConfig } from "../config.js";
import type { DbPool } from "../database/client.js";
import { runMonitor, type RunResult } from "../engine/runner.js";
import { logger } from "../logger.js";
import type { MonitorDefinition } from "../monitors/types.js";
import type { NotificationChannel } from "../notifications/types.js";

export function delayUntilNextCheckMs(elapsedMs: number, intervalSeconds: number): number {
  return Math.max(0, intervalSeconds * 1000 - elapsedMs);
}

export class MonitorScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;
  private inFlight: Promise<unknown> | undefined;
  private wakeSleep: (() => void) | undefined;

  constructor(
    private readonly pool: DbPool,
    private readonly config: AppConfig,
    private readonly monitors: MonitorDefinition[],
    private readonly channels: NotificationChannel[]
  ) {}

  start(options: { runImmediately?: boolean } = { runImmediately: true }): void {
    this.stopping = false;
    const loop = async () => {
      while (!this.stopping) {
        const started = Date.now();
        await this.runCycle();
        const waitMs = delayUntilNextCheckMs(Date.now() - started, this.config.CHECK_INTERVAL_SECONDS);
        if (this.stopping) {
          break;
        }
        if (waitMs === 0) {
          logger.warn(
            { intervalSeconds: this.config.CHECK_INTERVAL_SECONDS },
            "Previous check exceeded the interval; starting the next check immediately without overlap"
          );
        }
        await this.sleep(waitMs);
      }
    };
    if (options.runImmediately) {
      this.inFlight = loop();
    } else {
      this.timer = setTimeout(() => {
        this.inFlight = loop();
      }, this.config.CHECK_INTERVAL_SECONDS * 1000);
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
    this.wakeSleep?.();
    if (this.inFlight) {
      await this.inFlight;
    }
  }

  private sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.wakeSleep = () => {
        if (this.timer) {
          clearTimeout(this.timer);
        }
        this.wakeSleep = undefined;
        resolve();
      };
      this.timer = setTimeout(() => {
        this.wakeSleep = undefined;
        resolve();
      }, ms);
    });
  }
}
