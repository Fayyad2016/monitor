import * as cheerio from "cheerio";
import type { AppConfig } from "../config.js";
import { FetchError, ParseError } from "../errors.js";
import { fetchHtml } from "../fetch/httpClient.js";
import { logger } from "../logger.js";
import {
  isClosedStatus,
  normalizeKey,
  normalizeStatus,
  normalizeText,
  type MonitorDefinition,
  type MonitorSnapshot
} from "./types.js";

export const FINDBOLIG_MONITOR_NAME = "findbolig";
export const FINDBOLIG_URL = "https://www.findbolig.nu/da-dk/udlejere";
export const FINDBOLIG_SECTION_HEADING = "Status for eksterne ventelister";

export function extractFindboligWaitingList(html: string): {
  entities: MonitorSnapshot["entities"];
  evidenceHtml: string;
} {
  const $ = cheerio.load(html);
  const heading = $("label, h1, h2, h3, h4, h5, p, div, strong")
    .filter((_, el) => normalizeText($(el).text()).toLowerCase() === FINDBOLIG_SECTION_HEADING.toLowerCase())
    .first();

  let table = heading.length > 0 ? heading.closest(".c-content-pane").find("table").first() : $();
  if (!table.length) {
    table = heading.parent().find("table").first();
  }
  if (!table.length) {
    table = $("table")
      .filter((_, el) => {
        const text = normalizeText($(el).text()).toLowerCase();
        return text.includes("boligfond") && text.includes("ekstern venteliste");
      })
      .first();
  }

  if (!table.length) {
    throw new ParseError(`Could not find table for "${FINDBOLIG_SECTION_HEADING}"`);
  }

  const entities: MonitorSnapshot["entities"] = [];
  table.find("tr").each((_, row) => {
    const cells = $(row)
      .find("td, th")
      .toArray()
      .map((cell) => normalizeStatus($(cell).text()));
    if (cells.length < 2) {
      return;
    }
    const [rawName, rawStatus] = cells;
    if (!rawName || !rawStatus) {
      return;
    }
    const name = normalizeText(rawName);
    const status = normalizeStatus(rawStatus);
    if (!name || !status) {
      return;
    }
    if (name.toLowerCase() === "boligfond" || status.toLowerCase() === "ekstern venteliste") {
      return;
    }
    entities.push({
      key: normalizeKey(name),
      displayName: name,
      status
    });
  });

  const unique = new Map<string, (typeof entities)[number]>();
  for (const entity of entities) {
    unique.set(entity.key, entity);
  }
  const deduped = [...unique.values()];
  if (deduped.length === 0) {
    throw new ParseError("Waiting-list table was found but contained no housing fund rows");
  }

  return {
    entities: deduped,
    evidenceHtml: $.html(table)
  };
}

async function extractWithPlaywright(config: AppConfig): Promise<MonitorSnapshot> {
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new FetchError("Playwright fallback requested but playwright is not installed", false);
  }

  const browser = await playwright.chromium.launch({
    headless: true
  });
  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (compatible; MonitorBot/1.0)"
    });
    page.setDefaultTimeout(config.REQUEST_TIMEOUT_MS);
    await page.goto(FINDBOLIG_URL, { waitUntil: "domcontentloaded" });
    await page.getByText(FINDBOLIG_SECTION_HEADING, { exact: false }).first().waitFor({ timeout: config.REQUEST_TIMEOUT_MS });
    const html = await page.content();
    const parsed = extractFindboligWaitingList(html);
    return {
      monitorName: FINDBOLIG_MONITOR_NAME,
      targetUrl: FINDBOLIG_URL,
      fetchedAt: new Date(),
      entities: parsed.entities,
      evidenceHtml: parsed.evidenceHtml,
      parserMethod: "playwright"
    };
  } finally {
    await browser.close();
  }
}

export function createFindboligMonitor(config: AppConfig): MonitorDefinition {
  return {
    name: FINDBOLIG_MONITOR_NAME,
    targetUrl: FINDBOLIG_URL,
    isClosedStatus,
    async extract(): Promise<MonitorSnapshot> {
      try {
        const fetched = await fetchHtml(FINDBOLIG_URL, {
          timeoutMs: config.REQUEST_TIMEOUT_MS,
          retryAttempts: config.REQUEST_RETRY_ATTEMPTS,
          rejectUnauthorized: config.TLS_REJECT_UNAUTHORIZED
        });
        const parsed = extractFindboligWaitingList(fetched.html);
        logger.info(
          {
            monitor: FINDBOLIG_MONITOR_NAME,
            method: "http",
            funds: parsed.entities.length
          },
          "Extracted Findbolig waiting-list rows"
        );
        return {
          monitorName: FINDBOLIG_MONITOR_NAME,
          targetUrl: FINDBOLIG_URL,
          fetchedAt: new Date(),
          entities: parsed.entities,
          evidenceHtml: parsed.evidenceHtml,
          parserMethod: "http"
        };
      } catch (error) {
        if (config.PLAYWRIGHT_FALLBACK) {
          logger.warn({ err: error instanceof Error ? error.message : error }, "HTTP extract failed, trying Playwright fallback");
          return extractWithPlaywright(config);
        }
        throw error;
      }
    }
  };
}
