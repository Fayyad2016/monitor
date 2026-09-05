import { describe, expect, it, vi } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "test" });

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail })
  }
}));

import { createEmailChannel } from "../src/notifications/email.js";
import { testConfig } from "./helpers/testDb.js";

describe("email channel", () => {
  it("sends subject and body through SMTP without using production credentials", async () => {
    const channel = createEmailChannel(testConfig());
    await channel.send({
      eventType: "CLOSED",
      monitorName: "findbolig",
      targetUrl: "https://www.findbolig.nu/da-dk/udlejere",
      housingFund: "Fuglevænget",
      previousStatus: "Åben",
      currentStatus: "Lukket",
      detectedAtFormatted: "05-09-2026 07:00:00 Europe/Copenhagen"
    });
    expect(sendMail).toHaveBeenCalledOnce();
    const args = sendMail.mock.calls[0]?.[0] as {
      subject: string;
      text: string;
      to: string;
      from: string;
    };
    expect(args.subject).toBe("Findbolig waiting list CLOSED — Fuglevænget");
    expect(args.text).toContain("Housing fund: Fuglevænget");
    expect(args.to).toBe("alert@example.com");
  });
});
