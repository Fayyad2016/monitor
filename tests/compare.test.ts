import { describe, expect, it } from "vitest";
import { classifyTransition, planChanges } from "../src/engine/compare.js";
import { isClosedStatus } from "../src/monitors/types.js";
import type { MonitorDefinition, MonitorSnapshot } from "../src/monitors/types.js";

const monitor: MonitorDefinition = {
  name: "findbolig",
  targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
  isClosedStatus,
  extract: async () => {
    throw new Error("not used");
  }
};

function snapshot(entities: Array<{ key: string; displayName: string; status: string }>): MonitorSnapshot {
  return {
    monitorName: "findbolig",
    targetUrl: monitor.targetUrl,
    fetchedAt: new Date(),
    entities,
    evidenceHtml: "<table></table>",
    parserMethod: "http"
  };
}

describe("transition classification", () => {
  it("treats Lukket as closed and Åben/Open variants as open", () => {
    expect(isClosedStatus("Lukket")).toBe(true);
    expect(isClosedStatus("Lukket ")).toBe(true);
    expect(isClosedStatus("Åben")).toBe(false);
    expect(isClosedStatus("Åbent")).toBe(false);
    expect(isClosedStatus("Open")).toBe(false);
    expect(isClosedStatus("Tilmelding åben")).toBe(false);
    expect(classifyTransition("Lukket", "Åben", isClosedStatus)).toBe("OPENED");
    expect(classifyTransition("Åben", "Lukket", isClosedStatus)).toBe("CLOSED");
    expect(classifyTransition("Åben", "Åbent", isClosedStatus)).toBe("CHANGED");
  });

  it("does not emit OPENED/CLOSED on the first baseline run", () => {
    const planned = planChanges(
      monitor,
      snapshot([{ key: "fuglevænget", displayName: "Fuglevænget", status: "Åben" }]),
      [],
      true
    );
    expect(planned).toEqual([
      expect.objectContaining({ eventType: "BASELINE", housingFund: "Fuglevænget", currentStatus: "Åben" })
    ]);
  });
});
