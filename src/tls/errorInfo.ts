const SECRET_KEY_PATTERN = /token|password|authorization|secret|database|smtp_pass/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export interface SafeErrorInfo {
  name?: string;
  message: string;
  code?: string;
  errno?: string | number;
  syscall?: string;
  address?: string;
  port?: number;
  httpStatus?: number;
  opensslError?: string;
  reason?: string;
  timeout?: boolean;
  cause?: SafeErrorInfo;
}

export function describeError(error: unknown, depth = 0): SafeErrorInfo {
  if (typeof error === "string") {
    return { message: error };
  }
  if (!isRecord(error) && !(error instanceof Error)) {
    return { message: "Unknown error" };
  }
  const record = error as Record<string, unknown>;
  const name = readString(record.name);
  const code = readString(record.code);
  const reason = readString(record.reason);
  const openssl =
    readString(record.opensslErrorStack) ||
    (Array.isArray(record.opensslErrorStack) ? record.opensslErrorStack.map(String).join("; ") : undefined);
  const message = error instanceof Error ? error.message : readString(record.message) ?? "Unknown error";
  const info: SafeErrorInfo = {
    name,
    message: redactSecrets(message),
    code,
    errno: (readString(record.errno) ?? readNumber(record.errno)) as string | number | undefined,
    syscall: readString(record.syscall),
    address: readString(record.address),
    port: readNumber(record.port),
    httpStatus: readNumber(record.status) ?? readNumber(record.statusCode),
    opensslError: openssl ? redactSecrets(openssl) : undefined,
    reason: reason ? redactSecrets(reason) : undefined,
    timeout: name === "AbortError" || code === "ABORT_ERR" || /timeout/i.test(message)
  };
  if (depth < 3 && record.cause) {
    info.cause = describeError(record.cause, depth + 1);
  }
  return info;
}

export function formatError(error: unknown): string {
  const info = describeError(error);
  const parts = [info.message];
  if (info.name && info.name !== "Error") {
    parts.push(`name=${info.name}`);
  }
  if (info.code) {
    parts.push(`code=${info.code}`);
  }
  if (info.opensslError) {
    parts.push(`openssl=${info.opensslError}`);
  }
  if (info.httpStatus) {
    parts.push(`httpStatus=${info.httpStatus}`);
  }
  if (info.timeout) {
    parts.push("timeout=true");
  }
  if (info.cause) {
    parts.push(`cause=${formatErrorChain(info.cause)}`);
  }
  return parts.join("; ");
}

function formatErrorChain(info: SafeErrorInfo): string {
  const bits = [info.message];
  if (info.code) {
    bits.push(info.code);
  }
  if (info.cause) {
    bits.push(formatErrorChain(info.cause));
  }
  return bits.join(" > ");
}

export function redactSecrets(value: string): string {
  return value
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]")
    .replace(/(postgres(?:ql)?:\/\/)([^:@/]+):([^@]+)@/gi, "$1[redacted]:[redacted]@")
    .replace(new RegExp(`(${SECRET_KEY_PATTERN.source})["']?\\s*[:=]\\s*["']?[^\\s&"']+`, "gi"), "$1=[redacted]");
}
