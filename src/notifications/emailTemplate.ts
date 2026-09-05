import { randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import { formatEmailTimestamp } from "../time.js";
import type { NotificationPayload } from "./types.js";

export interface EmailIdentity {
  fromName: string;
  fromAddress: string;
  replyTo: string;
  signatureName: string;
  signatureCompany: string;
  signatureDomain: string;
  timezone: string;
}

export function emailIdentityFromConfig(config: AppConfig): EmailIdentity {
  const fromAddress = config.EMAIL_FROM?.trim() ?? "";
  return {
    fromName: config.EMAIL_FROM_NAME.trim() || "Moderavia Monitoring",
    fromAddress,
    replyTo: (config.EMAIL_REPLY_TO ?? "").trim() || fromAddress,
    signatureName: config.EMAIL_SIGNATURE_NAME.trim(),
    signatureCompany: config.EMAIL_SIGNATURE_COMPANY.trim(),
    signatureDomain: config.EMAIL_SIGNATURE_DOMAIN.trim(),
    timezone: config.TIMEZONE
  };
}

export function formatFromHeader(identity: EmailIdentity): string {
  return `${identity.fromName} <${identity.fromAddress}>`;
}

export function messageIdDomain(identity: EmailIdentity): string {
  const fromDomain = identity.fromAddress.includes("@")
    ? identity.fromAddress.slice(identity.fromAddress.lastIndexOf("@") + 1).trim()
    : "";
  return identity.signatureDomain || fromDomain || "localhost";
}

export function generateMessageId(identity: EmailIdentity, now = new Date()): string {
  const token = randomBytes(8).toString("hex");
  return `<${now.getTime()}.${token}@${messageIdDomain(identity)}>`;
}

export function buildEmailSubject(payload: NotificationPayload): string {
  if (payload.simulated || payload.eventType === "TEST") {
    return "Moderavia Monitoring test — Findbolig status notification";
  }
  if (payload.eventType === "OPERATIONAL_FAILURE") {
    return "Moderavia Monitoring operational alert";
  }
  if (payload.eventType === "OPERATIONAL_RECOVERY") {
    return "Moderavia Monitoring recovery notice";
  }
  if (payload.eventType === "CLOSED") {
    return `Findbolig waiting-list closed — ${payload.housingFund ?? payload.monitorName}`;
  }
  if (payload.eventType === "CHANGED") {
    return `Findbolig waiting-list status change — ${payload.housingFund ?? payload.monitorName}`;
  }
  return `Findbolig availability alert — ${payload.housingFund ?? payload.monitorName}`;
}

function statusOrNone(value: string | null | undefined): string {
  return value && value.length > 0 ? value : "(none)";
}

function detectedLabel(payload: NotificationPayload, identity: EmailIdentity): string {
  if (payload.detectedAt) {
    return formatEmailTimestamp(payload.detectedAt, identity.timezone) ?? payload.detectedAtFormatted;
  }
  return payload.detectedAtFormatted;
}

function isTestPayload(payload: NotificationPayload): boolean {
  return Boolean(payload.simulated) || payload.eventType === "TEST";
}

function isOperationalPayload(payload: NotificationPayload): boolean {
  return payload.eventType === "OPERATIONAL_FAILURE" || payload.eventType === "OPERATIONAL_RECOVERY";
}

function heading(payload: NotificationPayload): string {
  if (isTestPayload(payload)) {
    return "Findbolig status notification test";
  }
  if (payload.eventType === "OPERATIONAL_FAILURE") {
    return "Monitoring service operational alert";
  }
  if (payload.eventType === "OPERATIONAL_RECOVERY") {
    return "Monitoring service recovered";
  }
  return "Findbolig waiting-list status change";
}

function intro(payload: NotificationPayload): string {
  if (isTestPayload(payload)) {
    return "This is a system test. No actual Findbolig status change occurred.";
  }
  if (payload.eventType === "OPERATIONAL_FAILURE") {
    return "The monitoring service could not complete a scheduled check.";
  }
  if (payload.eventType === "OPERATIONAL_RECOVERY") {
    return "The monitoring service has recovered after previous check failures.";
  }
  return "A change has been detected on the Findbolig external waiting-list page.";
}

function generationNote(payload: NotificationPayload): string {
  if (isTestPayload(payload)) {
    return "This notification was generated automatically by the Moderavia Monitoring Service as a delivery test.";
  }
  if (isOperationalPayload(payload)) {
    return "This notification was generated automatically by the Moderavia Monitoring Service because of an operational condition.";
  }
  return "This notification was generated automatically by the Moderavia Monitoring Service because a monitored status changed.";
}

function signatureLines(identity: EmailIdentity): string[] {
  const lines: string[] = [];
  if (identity.signatureName) {
    lines.push(identity.signatureName);
  }
  if (identity.signatureCompany) {
    lines.push(identity.signatureCompany);
  }
  lines.push("Automated Monitoring Service");
  if (identity.signatureDomain) {
    lines.push(identity.signatureDomain);
  }
  return lines;
}

function detailLines(payload: NotificationPayload, identity: EmailIdentity): string[] {
  const detected = detectedLabel(payload, identity);
  if (isOperationalPayload(payload) || (payload.eventType === "TEST" && !payload.housingFund)) {
    return [
      `Monitor: ${payload.monitorName}`,
      `Detected: ${detected}`,
      `Source: ${payload.targetUrl}`,
      ...(payload.extraLines ?? [])
    ];
  }
  return [
    `Housing fund: ${payload.housingFund ?? ""}`,
    `Previous status: ${statusOrNone(payload.previousStatus)}`,
    `Current status: ${payload.currentStatus ?? ""}`,
    `Detected: ${detected}`,
    `Source: ${payload.targetUrl}`,
    ...(payload.extraLines ?? [])
  ];
}

export function buildEmailText(payload: NotificationPayload, identity: EmailIdentity): string {
  return [
    identity.fromName,
    "",
    heading(payload),
    "",
    intro(payload),
    "",
    ...detailLines(payload, identity),
    "",
    generationNote(payload),
    "",
    "---",
    ...signatureLines(identity),
    "",
    "Sent by:",
    identity.fromAddress
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlParagraph(text: string): string {
  return `<p style="margin:0 0 16px 0;line-height:1.5;">${escapeHtml(text)}</p>`;
}

function htmlLink(url: string): string {
  const safe = escapeHtml(url);
  const href = /^(https?:)\/\//i.test(url) ? safe : "";
  if (!href) {
    return `<span>${safe}</span>`;
  }
  return `<a href="${href}" style="color:#1d4ed8;text-decoration:underline;">${safe}</a>`;
}

export function buildEmailHtml(payload: NotificationPayload, identity: EmailIdentity): string {
  const detected = detectedLabel(payload, identity);
  const rows: Array<[string, string, "text" | "url"]> = [];
  if (isOperationalPayload(payload) || (payload.eventType === "TEST" && !payload.housingFund)) {
    rows.push(["Monitor", payload.monitorName, "text"]);
    rows.push(["Detected", detected, "text"]);
    rows.push(["Source", payload.targetUrl, "url"]);
  } else {
    rows.push(["Housing fund", payload.housingFund ?? "", "text"]);
    rows.push(["Previous status", statusOrNone(payload.previousStatus), "text"]);
    rows.push(["Current status", payload.currentStatus ?? "", "text"]);
    rows.push(["Detected", detected, "text"]);
    rows.push(["Source", payload.targetUrl, "url"]);
  }

  const extra = (payload.extraLines ?? [])
    .map((line) => htmlParagraph(line))
    .join("");

  const tableRows = rows
    .map(([label, value, kind]) => {
      const rendered = kind === "url" ? htmlLink(value) : escapeHtml(value);
      return `<tr>
        <td style="padding:6px 16px 6px 0;vertical-align:top;color:#52525b;white-space:nowrap;">${escapeHtml(label)}</td>
        <td style="padding:6px 0;vertical-align:top;color:#18181b;">${rendered}</td>
      </tr>`;
    })
    .join("");

  const signature = signatureLines(identity)
    .map((line) => escapeHtml(line))
    .join("<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(buildEmailSubject(payload))}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;color:#18181b;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
    <p style="margin:0 0 8px 0;font-size:13px;letter-spacing:0.02em;color:#3f3f46;">${escapeHtml(identity.fromName)}</p>
    <h1 style="margin:0 0 20px 0;font-size:22px;font-weight:normal;color:#18181b;">${escapeHtml(heading(payload))}</h1>
    ${htmlParagraph(intro(payload))}
    <table role="presentation" style="border-collapse:collapse;margin:0 0 20px 0;font-size:16px;">
      ${tableRows}
    </table>
    ${extra}
    ${htmlParagraph(generationNote(payload))}
    <hr style="border:none;border-top:1px solid #d4d4d8;margin:24px 0;">
    <p style="margin:0 0 16px 0;line-height:1.5;color:#3f3f46;">${signature}</p>
    <p style="margin:0;line-height:1.5;color:#3f3f46;">Sent by:<br>${escapeHtml(identity.fromAddress)}</p>
  </div>
</body>
</html>`;
}
