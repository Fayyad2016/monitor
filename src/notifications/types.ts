export type AlertEventType =
  | "OPENED"
  | "CLOSED"
  | "CHANGED"
  | "OPERATIONAL_FAILURE"
  | "OPERATIONAL_RECOVERY"
  | "TEST";

export interface NotificationPayload {
  eventType: AlertEventType;
  monitorName: string;
  targetUrl: string;
  housingFund?: string;
  previousStatus?: string | null;
  currentStatus?: string | null;
  detectedAtFormatted: string;
  detectedAt?: Date;
  extraLines?: string[];
  simulated?: boolean;
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
  if (payload.eventType === "TEST") {
    return [
      "✅ MONITOR NOTIFICATION TEST",
      "",
      `Monitor: ${payload.monitorName}`,
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

  const production = [
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

  if (payload.simulated && payload.eventType === "OPENED") {
    return [
      "🧪 TEST — NOT A REAL OPENING",
      "",
      "🚨 FINDBOLIG WAITING LIST OPEN",
      "",
      `Housing fund: ${payload.housingFund ?? ""}`,
      `Previous: ${payload.previousStatus && payload.previousStatus.length > 0 ? payload.previousStatus : "(none)"}`,
      `Current: ${payload.currentStatus ?? ""}`,
      `Detected: ${payload.detectedAtFormatted}`,
      "",
      payload.targetUrl,
      "",
      "⚠️ TEST ONLY — Findbolig did not actually change."
    ].join("\n");
  }

  return production;
}
