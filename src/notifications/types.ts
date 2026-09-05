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

export function buildEmailSubject(payload: NotificationPayload): string {
  if (payload.simulated && payload.eventType === "OPENED") {
    return `🧪 TEST — Findbolig OPEN — ${payload.housingFund}`;
  }
  if (payload.eventType === "OPERATIONAL_FAILURE") {
    return `⚠️ Monitor operational warning — ${payload.monitorName}`;
  }
  if (payload.eventType === "TEST") {
    return `Monitor notification test — ${payload.monitorName}`;
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
  const productionOpen = [
    `Housing fund: ${payload.housingFund ?? ""}`,
    `Previous status: ${payload.previousStatus && payload.previousStatus.length > 0 ? payload.previousStatus : "(none)"}`,
    `New status: ${payload.currentStatus ?? ""}`,
    `Exact detection time: ${payload.detectedAtFormatted}`,
    `Findbolig URL: ${payload.targetUrl}`
  ].join("\n");

  if (payload.simulated && payload.eventType === "OPENED") {
    return [
      "🧪 TEST — NOT A REAL OPENING",
      "",
      productionOpen,
      "",
      "⚠️ TEST ONLY — This is a simulation. Findbolig did not actually change. No production monitor state was modified."
    ].join("\n");
  }

  if (
    payload.eventType === "OPERATIONAL_FAILURE" ||
    payload.eventType === "OPERATIONAL_RECOVERY" ||
    payload.eventType === "TEST"
  ) {
    return [
      `Monitor: ${payload.monitorName}`,
      `Target URL: ${payload.targetUrl}`,
      `Detected: ${payload.detectedAtFormatted}`,
      ...(payload.extraLines ?? [])
    ].join("\n");
  }
  return productionOpen;
}
