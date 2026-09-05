import type { AppConfig } from "../config.js";
import { createFindboligMonitor } from "./findbolig.js";
import type { MonitorDefinition } from "./types.js";

export function loadMonitors(config: AppConfig): MonitorDefinition[] {
  return [createFindboligMonitor(config)];
}
