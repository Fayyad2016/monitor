import { describe, expect, it, vi } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "test" });

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail })
  }
}));

vi.mock("../src/net/dns.js", () => ({
  resolveHostname: async () => ({
    host: "smtp.test",
    warnings: [],
    addresses: [{ address: "127.0.0.1", family: 4 }]
  })
}));

import { createEmailChannel } from "../src/notifications/email.js";
import {
  buildEmailHtml,
  buildEmailSubject,
  buildEmailText,
  emailIdentityFromConfig,
  formatFromHeader
} from "../src/notifications/emailTemplate.js";
import { testConfig } from "./helpers/testDb.js";

describe("email channel", () => {
  it("sends multipart mail with Moderavia identity headers", async () => {
    const channel = createEmailChannel(testConfig());
    await channel.send({
      eventType: "OPENED",
      monitorName: "findbolig",
      targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
      housingFund: "Fuglevænget",
      previousStatus: "Lukket",
      currentStatus: "Åben",
      detectedAtFormatted: "05-09-2026 08:20:00 Europe/Copenhagen",
      detectedAt: new Date("2026-09-05T06:20:00.000Z")
    });
    expect(sendMail).toHaveBeenCalledOnce();
    const args = sendMail.mock.calls[0]?.[0] as {
      subject: string;
      text: string;
      html: string;
      to: string;
      from: string;
      replyTo: string;
      messageId: string;
      date: Date;
      headers?: Record<string, string>;
    };
    expect(args.from).toBe("Moderavia Monitoring <alerts@moderavia.com>");
    expect(args.replyTo).toBe("alerts@moderavia.com");
    expect(args.to).toBe("alert@example.com");
    expect(args.subject).toBe("Findbolig availability alert — Fuglevænget");
    expect(args.date).toBeInstanceOf(Date);
    expect(args.messageId).toMatch(/^<[0-9]+\.[a-f0-9]+@moderavia\.com>$/);
    expect(args.text).toContain("Findbolig waiting-list status change");
    expect(args.text).toContain("Current status: Åben");
    expect(args.html).toContain("<!DOCTYPE html>");
    expect(args.html).toContain("Findbolig waiting-list status change");
    expect(JSON.stringify(args)).not.toMatch(/List-Unsubscribe|Precedence:\s*bulk|Authentication-Results|DKIM-Signature/i);
    expect(args.html).not.toMatch(/<img|<script|tracking/i);
  });

  it("uses configurable signature fields instead of hard-coded personal data", () => {
    const identity = emailIdentityFromConfig(
      testConfig({
        EMAIL_FROM_NAME: "Ops Desk",
        EMAIL_FROM: "ops@example.test",
        EMAIL_REPLY_TO: "noreply@example.test",
        EMAIL_SIGNATURE_NAME: "Ada Lovelace",
        EMAIL_SIGNATURE_COMPANY: "Analytical Engines",
        EMAIL_SIGNATURE_DOMAIN: "example.test"
      })
    );
    expect(formatFromHeader(identity)).toBe("Ops Desk <ops@example.test>");
    const text = buildEmailText(
      {
        eventType: "CLOSED",
        monitorName: "findbolig",
        targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
        housingFund: "Fuglevænget",
        previousStatus: "Åben",
        currentStatus: "Lukket",
        detectedAtFormatted: "05-09-2026 07:00:00 Europe/Copenhagen"
      },
      identity
    );
    expect(buildEmailSubject({
      eventType: "CLOSED",
      monitorName: "findbolig",
      targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
      housingFund: "Fuglevænget",
      detectedAtFormatted: "x"
    })).toBe("Findbolig waiting-list closed — Fuglevænget");
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Analytical Engines");
    expect(text).toContain("example.test");
    expect(text).not.toContain("Fayyad Mahmoud");
    expect(buildEmailHtml(
      {
        eventType: "OPERATIONAL_RECOVERY",
        monitorName: "findbolig",
        targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
        detectedAtFormatted: "05-09-2026 07:00:00 Europe/Copenhagen"
      },
      identity
    )).toContain("Monitoring service recovered");
  });
});
