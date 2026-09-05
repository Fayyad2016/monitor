import type { MonitorDefinition, MonitorSnapshot } from "../monitors/types.js";
import { normalizeStatus } from "../monitors/types.js";
import type { HousingFundState } from "../database/repositories.js";

export type TransitionEventType = "OPENED" | "CLOSED" | "CHANGED" | "BASELINE" | "UNCHANGED" | "NEW_CLOSED";

export interface PlannedChange {
  eventType: TransitionEventType;
  housingFund: string;
  housingFundKey: string;
  previousStatus: string | null;
  currentStatus: string;
}

export function classifyTransition(
  previousStatus: string | null,
  currentStatus: string,
  isClosed: (status: string) => boolean
): TransitionEventType {
  if (previousStatus === null) {
    return isClosed(currentStatus) ? "NEW_CLOSED" : "OPENED";
  }
  if (normalizeStatus(previousStatus) === normalizeStatus(currentStatus)) {
    return "UNCHANGED";
  }
  const wasClosed = isClosed(previousStatus);
  const nowClosed = isClosed(currentStatus);
  if (wasClosed && !nowClosed) {
    return "OPENED";
  }
  if (!wasClosed && nowClosed) {
    return "CLOSED";
  }
  return "CHANGED";
}

export function planChanges(
  monitor: MonitorDefinition,
  snapshot: MonitorSnapshot,
  existing: HousingFundState[],
  isFirstRun: boolean
): PlannedChange[] {
  const existingByKey = new Map(existing.map((row) => [row.housing_fund_key, row]));
  const planned: PlannedChange[] = [];

  for (const entity of snapshot.entities) {
    const previous = existingByKey.get(entity.key);
    if (!previous) {
      if (isFirstRun) {
        planned.push({
          eventType: "BASELINE",
          housingFund: entity.displayName,
          housingFundKey: entity.key,
          previousStatus: null,
          currentStatus: entity.status
        });
        continue;
      }
      const eventType = classifyTransition(null, entity.status, monitor.isClosedStatus);
      planned.push({
        eventType,
        housingFund: entity.displayName,
        housingFundKey: entity.key,
        previousStatus: null,
        currentStatus: entity.status
      });
      continue;
    }

    const eventType = classifyTransition(
      previous.current_status,
      entity.status,
      monitor.isClosedStatus
    );
    planned.push({
      eventType,
      housingFund: entity.displayName,
      housingFundKey: entity.key,
      previousStatus: previous.current_status,
      currentStatus: entity.status
    });
  }

  return planned;
}
