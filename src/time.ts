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
  const zoned = toZoned(date, timezone);
  if (!zoned) {
    return null;
  }
  const clock = zoned.setLocale("en-US").toFormat("d MMM yyyy, HH:mm");
  return `${clock} ${emailZoneAbbreviation(zoned)}`;
}

function emailZoneAbbreviation(zoned: DateTime): string {
  const named = zoned.offsetNameShort;
  if (named && /^[A-Z]{2,5}$/.test(named)) {
    return named;
  }
  if (zoned.zoneName === "Europe/Copenhagen") {
    return zoned.isInDST ? "CEST" : "CET";
  }
  const offset = zoned.toFormat("ZZ");
  return offset;
}

export function toIso(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).toISO() ?? date.toISOString();
}
