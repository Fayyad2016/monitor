import { lookup } from "node:dns/promises";
import { sanitizeHostname } from "./hostname.js";

export async function resolveHostname(raw: string | undefined): Promise<{
  host: string;
  warnings: string[];
  addresses: Array<{ address: string; family: number }>;
}> {
  const { host, warnings } = sanitizeHostname(raw);
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`DNS lookup returned no addresses for ${host}`);
  }
  return { host, warnings, addresses };
}
