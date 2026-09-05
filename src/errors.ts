export class MonitorError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = true
  ) {
    super(message);
    this.name = "MonitorError";
  }
}

export class ParseError extends MonitorError {
  constructor(message: string) {
    super(message, "PARSE_ERROR", false);
    this.name = "ParseError";
  }
}

export class FetchError extends MonitorError {
  constructor(message: string, retryable = true) {
    super(message, "FETCH_ERROR", retryable);
    this.name = "FetchError";
  }
}
