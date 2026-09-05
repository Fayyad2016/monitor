import { DateTime } from "luxon";

export const DEFAULT_TIMEZONE = "Europe/Copenhagen";

export function nowInZone(timezone = DEFAULT_TIMEZONE): DateTime {
  return DateTime.now().setZone(timezone);
}

export function toDate(timezone = DEFAULT_TIMEZONE): Date {
  return nowInZone(timezone).toUTC().toJSDate();
}

function toZoned(date: Date | string, timezone: string): DateTime | null {
  const dt = typeof date === "string" ? DateTime.fromISO(date, { zone: "utc" }) : DateTime.fromJSDate(date, { zone: "utc" });
  const zoned = dt.setZone(timezone);
  return zoned.isValid ? zoned : null;
}

export function formatTimestamp(date: Date | string | null | undefined, timezone = DEFAULT_TIMEZONE): string | null {
  if (!date) {
    return null;
  }
  const zoned = toZoned(date, timezone);
  if (!zoned) {
    return null;
  }
  return `${zoned.toFormat("dd-MM-yyyy HH:mm:ss")} ${timezone}`;
}

export function formatEmailTimestamp(date: Date | string, timezone = DEFAULT_TIMEZONE): string | null {
  const zoned = toZoned(date, timezone)?.setLocale("en-GB");
  if (!zoned) {
    return null;
  }
  return zoned.toFormat("d MMM yyyy, HH:mm ZZZ");
}

export function toIso(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).toISO() ?? date.toISOString();
}
