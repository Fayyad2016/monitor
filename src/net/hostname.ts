export interface SanitizedHostname {
  host: string;
  warnings: string[];
}

export function sanitizeHostname(raw: string | undefined): SanitizedHostname {
  if (raw === undefined || raw.length === 0) {
    throw new Error("Hostname is empty");
  }
  const warnings: string[] = [];
  let host = raw.trim();
  if (host !== raw) {
    warnings.push("trimmed_whitespace");
  }
  if (
    (host.startsWith('"') && host.endsWith('"') && host.length >= 2) ||
    (host.startsWith("'") && host.endsWith("'") && host.length >= 2)
  ) {
    host = host.slice(1, -1).trim();
    warnings.push("stripped_quotes");
  }
  if (/^(smtps?|smtp):\/\//i.test(host)) {
    host = host.replace(/^(smtps?|smtp):\/\//i, "");
    warnings.push("stripped_protocol");
  }
  const slash = host.indexOf("/");
  if (slash >= 0) {
    host = host.slice(0, slash);
    warnings.push("stripped_path");
  }
  const colon = host.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(host.slice(colon + 1))) {
    host = host.slice(0, colon);
    warnings.push("stripped_port");
  }
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$/.test(host) && !/^[A-Za-z0-9]+$/.test(host)) {
    throw new Error(`Hostname contains invalid characters for DNS (queryA EBADNAME): ${JSON.stringify(host)}`);
  }
  return { host, warnings };
}
