import { describe, expect, it } from "vitest";
import { sanitizeHostname } from "../src/net/hostname.js";

describe("SMTP hostname sanitization", () => {
  it("accepts a valid cPanel hostname", () => {
    expect(sanitizeHostname("server324-2.web-hosting.com")).toEqual({
      host: "server324-2.web-hosting.com",
      warnings: []
    });
  });

  it("strips quotes, whitespace, and port suffixes that cause queryA EBADNAME", () => {
    expect(sanitizeHostname('"server324-2.web-hosting.com"').host).toBe("server324-2.web-hosting.com");
    expect(sanitizeHostname(" server324-2.web-hosting.com ").host).toBe("server324-2.web-hosting.com");
    expect(sanitizeHostname("server324-2.web-hosting.com:465").host).toBe("server324-2.web-hosting.com");
    expect(sanitizeHostname("smtp://server324-2.web-hosting.com").host).toBe("server324-2.web-hosting.com");
  });

  it("rejects leftover invalid characters", () => {
    expect(() => sanitizeHostname("server324-2.web-hosting.com SMTP_PORT=465")).toThrow(/EBADNAME/);
  });
});
