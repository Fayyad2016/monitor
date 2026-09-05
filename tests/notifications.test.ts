import { describe, expect, it, vi } from "vitest";
import { createTelegramChannel } from "../src/notifications/telegram.js";
import {
  buildEmailHtml,
  buildEmailSubject,
  buildEmailText,
  emailIdentityFromConfig
} from "../src/notifications/emailTemplate.js";
import { buildTelegramMessage } from "../src/notifications/types.js";
import { testConfig } from "./helpers/testDb.js";

describe("notification templates and telegram sender", () => {
  const identity = emailIdentityFromConfig(testConfig());
  const opened = {
    eventType: "OPENED" as const,
    monitorName: "findbolig",
    targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
    housingFund: "Fuglevænget",
    previousStatus: "Lukket",
    currentStatus: "Åben",
    detectedAtFormatted: "05-09-2026 06:50:12 Europe/Copenhagen",
    detectedAt: new Date("2026-09-05T06:20:00.000Z")
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

  it("builds a professional OPEN email subject and bodies", () => {
    expect(buildEmailSubject(opened)).toBe("Findbolig availability alert — Fuglevænget");
    const text = buildEmailText(opened, identity);
    expect(text).toContain("Moderavia Monitoring");
    expect(text).toContain("Findbolig waiting-list status change");
    expect(text).toContain("A change has been detected on the Findbolig external waiting-list page.");
    expect(text).toContain("Housing fund: Fuglevænget");
    expect(text).toContain("Previous status: Lukket");
    expect(text).toContain("Current status: Åben");
    expect(text).toContain("5 Sep 2026, 08:20 CEST");
    expect(text).toContain("https://www.findbolig.nu/da-dk/udlejere");
    expect(text).toContain("Fayyad Mahmoud");
    expect(text).toContain("Moderavia");
    expect(text).toContain("moderavia.com");
    expect(text).toContain("Sent by:");
    expect(text).toContain("alerts@moderavia.com");
    expect(text).not.toMatch(/🚨|🧪/);
    const html = buildEmailHtml(opened, identity);
    expect(html).toContain("Findbolig waiting-list status change");
    expect(html).toContain("Fuglevænget");
    expect(html).toContain("Lukket");
    expect(html).toContain("Åben");
    expect(html).toContain("5 Sep 2026, 08:20 CEST");
    expect(html).toContain("https://www.findbolig.nu/da-dk/udlejere");
    expect(html).toContain("Fayyad Mahmoud");
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/display:\s*none/i);
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

  it("keeps Telegram TEST banners and uses a non-spammy test email", () => {
    const simulated = { ...opened, simulated: true as const };
    const text = buildTelegramMessage(simulated);
    expect(text.startsWith("🧪 TEST — NOT A REAL OPENING")).toBe(true);
    expect(text).toContain("🚨 FINDBOLIG WAITING LIST OPEN");
    expect(buildEmailSubject(simulated)).toBe("Moderavia Monitoring test — Findbolig status notification");
    const email = buildEmailText(simulated, identity);
    expect(email).toContain("This is a system test. No actual Findbolig status change occurred.");
    expect(email).toContain("Housing fund: Fuglevænget");
    expect(email).not.toContain("TEST — Findbolig OPEN");
  });
});
