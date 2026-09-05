import { Agent, fetch as undiciFetch } from "undici";
import { FetchError } from "../errors.js";
import { trustedCertificateAuthorities } from "../tls/extraCas.js";
import { describeError, formatError } from "../tls/errorInfo.js";
import { logger } from "../logger.js";

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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createDispatcher(rejectUnauthorized: boolean): Agent {
  return new Agent({
    connect: {
      rejectUnauthorized,
      ca: trustedCertificateAuthorities()
    }
  });
}

export async function fetchHtml(url: string, options: HttpClientOptions): Promise<FetchResult> {
  let lastError: unknown;
  const attempts = Math.max(1, options.retryAttempts);
  const dispatcher = createDispatcher(options.rejectUnauthorized);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await undiciFetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        dispatcher,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
          "User-Agent": options.userAgent ?? DEFAULT_UA
        }
      });
      const html = await response.text();
      if (!response.ok) {
        const details = { httpStatus: response.status, attempt };
        logger.warn({ ...details, url }, "Findbolig HTTP response was not OK");
        throw new FetchError(
          `HTTP ${response.status} fetching ${url}`,
          response.status >= 500 || response.status === 429
        );
      }
      return { url: response.url || url, status: response.status, html };
    } catch (error) {
      lastError = error;
      logger.warn(
        {
          url,
          attempt,
          tlsVerify: options.rejectUnauthorized,
          err: describeError(error)
        },
        "HTTP fetch attempt failed"
      );
      const retryable = error instanceof FetchError ? error.retryable : true;
      if (!retryable || attempt === attempts) {
        break;
      }
      await sleep(250 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new FetchError(`Failed to fetch ${url}: ${formatError(lastError)}`, true);
}
