import { FetchError } from "../errors.js";

export interface FetchResult {
  url: string;
  status: number;
  html: string;
}

export interface HttpClientOptions {
  timeoutMs: number;
  retryAttempts: number;
  rejectUnauthorized: boolean;
  userAgent?: string;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; MonitorBot/1.0; +https://github.com/Fayyad2016/monitor)";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url: string, options: HttpClientOptions): Promise<FetchResult> {
  let lastError: unknown;
  const attempts = Math.max(1, options.retryAttempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
          "User-Agent": options.userAgent ?? DEFAULT_UA
        }
      });
      const html = await response.text();
      if (!response.ok) {
        throw new FetchError(`HTTP ${response.status} fetching ${url}`, response.status >= 500 || response.status === 429);
      }
      return { url: response.url || url, status: response.status, html };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof FetchError ? error.retryable : true;
      if (!retryable || attempt === attempts) {
        break;
      }
      await sleep(250 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
    void options.rejectUnauthorized;

  }

  const message = lastError instanceof Error ? lastError.message : "Unknown fetch failure";
  const cause =
    lastError instanceof Error && lastError.cause instanceof Error ? `: ${lastError.cause.message}` : "";
  throw new FetchError(`Failed to fetch ${url}: ${message}${cause}`, true);
}
