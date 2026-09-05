import { describe, expect, it, vi } from "vitest";
import { createTelegramChannel } from "../src/notifications/telegram.js";
import { buildEmailBody, buildEmailSubject, buildTelegramMessage } from "../src/notifications/types.js";
import { testConfig } from "./helpers/testDb.js";

describe("notification templates and telegram sender", () => {
  const opened = {
    eventType: "OPENED" as const,
    monitorName: "findbolig",
    targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
    housingFund: "Fuglevænget",
    previousStatus: "Lukket",
    currentStatus: "Åben",
    detectedAtFormatted: "05-09-2026 06:50:12 Europe/Copenhagen"
  };

  it("builds the Telegram alert body", () => {
    const text = buildTelegramMessage(opened);
    expect(text).toContain("🚨 FINDBOLIG ALERT");
    expect(text).toContain("Waiting list OPENED");
    expect(text).toContain("Fuglevænget");
    expect(text).toContain("Previous:");
    expect(text).toContain("Lukket");
    expect(text).toContain("Åben");
    expect(text).toContain("05-09-2026 06:50:12 Europe/Copenhagen");
    expect(text).toContain("https://www.findbolig.nu/da-dk/udlejere");
  });

  it("builds the email subject and body", () => {
    expect(buildEmailSubject(opened)).toBe("🚨 Findbolig waiting list OPEN — Fuglevænget");
    const body = buildEmailBody(opened);
    expect(body).toContain("Housing fund: Fuglevænget");
    expect(body).toContain("Previous status: Lukket");
    expect(body).toContain("New status: Åben");
    expect(body).toContain("Exact detection time: 05-09-2026 06:50:12 Europe/Copenhagen");
    expect(body).toContain("Findbolig URL: https://www.findbolig.nu/da-dk/udlejere");
  });

  it("posts to Telegram without logging secrets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const channel = createTelegramChannel(testConfig());
    await channel.send(opened);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sendMessage");
    expect(url).not.toContain("\n");
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("123");
    expect(body.text).toContain("FINDBOLIG ALERT");
    vi.unstubAllGlobals();
  });
});
