import { describe, expect, it } from "vitest";
import { fetchHtml } from "../src/fetch/httpClient.js";
import { extractFindboligWaitingList } from "../src/monitors/findbolig.js";

describe("Findbolig HTTP with completed TLS chain", () => {
  it("fetches and parses the live waiting-list table with TLS verification enabled", async () => {
    const fetched = await fetchHtml("https://www.findbolig.nu/da-dk/udlejere", {
      timeoutMs: 20_000,
      retryAttempts: 2,
      rejectUnauthorized: true
    });
    expect(fetched.status).toBe(200);
    const parsed = extractFindboligWaitingList(fetched.html);
    expect(parsed.entities.length).toBeGreaterThanOrEqual(1);
    expect(parsed.entities.every((row) => row.displayName && row.status)).toBe(true);
  });
});
