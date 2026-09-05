import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractFindboligWaitingList, FINDBOLIG_URL } from "../src/monitors/findbolig.js";
import { fetchHtml } from "../src/fetch/httpClient.js";

const execFileAsync = promisify(execFile);

async function loadLiveHtml(): Promise<{ html: string; method: string; status?: number; note?: string }> {
  try {
    const fetched = await fetchHtml(FINDBOLIG_URL, {
      timeoutMs: 20_000,
      retryAttempts: 3,
      rejectUnauthorized: true
    });
    return { html: fetched.html, method: "http-fetch", status: fetched.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    const combined = `${message} ${cause}`;
    const { stdout } = await execFileAsync(
      "curl",
      ["-skS", "-L", "--max-time", "30", "-A", "MonitorBot/1.0", FINDBOLIG_URL],
      { maxBuffer: 5_000_000 }
    );
    return {
      html: stdout,
      method: /certificate|UNABLE_TO_VERIFY|CERT|fetch failed/i.test(combined)
        ? "curl-sandbox-fallback"
        : "curl-fallback",
      note: combined.trim()
    };
  }
}

async function main(): Promise<void> {
  const live = await loadLiveHtml();
  const parsed = extractFindboligWaitingList(live.html);
  console.log(
    JSON.stringify(
      {
        url: FINDBOLIG_URL,
        fetchMethod: live.method,
        httpStatus: live.status ?? null,
        parserMethod: "http",
        fetchNote: "note" in live ? live.note : undefined,
        count: parsed.entities.length,
        funds: parsed.entities.map((row) => ({ name: row.displayName, status: row.status }))
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
