import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "../src/config.js";

describe("config defaults", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("defaults the production check interval to 30 seconds", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://monitor:monitor@127.0.0.1:5432/monitor_test",
      CHECK_INTERVAL_SECONDS: undefined
    });
    expect(config.CHECK_INTERVAL_SECONDS).toBe(30);
  });
});
