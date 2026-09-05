export type AlertEventType = "OPENED" | "CLOSED" | "CHANGED" | "OPERATIONAL_FAILURE" | "OPERATIONAL_RECOVERY";

export interface NotificationPayload {
  eventType: AlertEventType;
  monitorName: string;
  targetUrl: string;
  housingFund?: string;
  previousStatus?: string | null;
  currentStatus?: string | null;
  detectedAtFormatted: string;
  extraLines?: string[];
}

export interface NotificationChannel {
  name: "telegram" | "email";
  enabled: boolean;
  send(payload: NotificationPayload): Promise<void>;
}

export function buildTelegramMessage(payload: NotificationPayload): string {
  if (payload.eventType === "OPERATIONAL_FAILURE") {
    return [
      "⚠️ MONITOR OPERATIONAL ALERT",
      "",
      `Monitor: ${payload.monitorName}`,
      `Target: ${payload.targetUrl}`,
      `Detected: ${payload.detectedAtFormatted}`,
      ...(payload.extraLines ?? [])
    ].join("\n");
  }
  if (payload.eventType === "OPERATIONAL_RECOVERY") {
    return [
      "✅ MONITOR RECOVERED",
      "",
      `Monitor: ${payload.monitorName}`,
      `Target: ${payload.targetUrl}`,
      `Detected: ${payload.detectedAtFormatted}`,
      ...(payload.extraLines ?? [])
    ].join("\n");
  }

  const headline =
    payload.eventType === "CLOSED"
      ? "Waiting list CLOSED"
      : payload.eventType === "CHANGED"
        ? "Waiting list STATUS CHANGED"
        : "Waiting list OPENED";

  return [
    `🚨 ${payload.monitorName.toUpperCase()} ALERT`,
    "",
    headline,
    "",
    "Housing fund:",
    payload.housingFund ?? "",
    "",
    "Previous:",
    payload.previousStatus && payload.previousStatus.length > 0 ? payload.previousStatus : "(none)",
    "",
    "Current:",
    payload.currentStatus ?? "",
    "",
    "Detected:",
    payload.detectedAtFormatted,
    "",
    payload.targetUrl
  ].join("\n");
}

export function buildEmailSubject(payload: NotificationPayload): string {
  if (payload.eventType === "OPERATIONAL_FAILURE") {
    return `⚠️ Monitor operational warning — ${payload.monitorName}`;
  }
  if (payload.eventType === "OPERATIONAL_RECOVERY") {
    return `✅ Monitor recovered — ${payload.monitorName}`;
  }
  if (payload.eventType === "CLOSED") {
    return `Findbolig waiting list CLOSED — ${payload.housingFund}`;
  }
  if (payload.eventType === "CHANGED") {
    return `Findbolig waiting list CHANGED — ${payload.housingFund}`;
  }
  return `🚨 Findbolig waiting list OPEN — ${payload.housingFund}`;
}

export function buildEmailBody(payload: NotificationPayload): string {
  if (payload.eventType === "OPERATIONAL_FAILURE" || payload.eventType === "OPERATIONAL_RECOVERY") {
    return [
      `Monitor: ${payload.monitorName}`,
      `Target URL: ${payload.targetUrl}`,
      `Detected: ${payload.detectedAtFormatted}`,
      ...(payload.extraLines ?? [])
    ].join("\n");
  }
  return [
    `Housing fund: ${payload.housingFund ?? ""}`,
    `Previous status: ${payload.previousStatus && payload.previousStatus.length > 0 ? payload.previousStatus : "(none)"}`,
    `New status: ${payload.currentStatus ?? ""}`,
    `Exact detection time: ${payload.detectedAtFormatted}`,
    `Findbolig URL: ${payload.targetUrl}`
  ].join("\n");
}
