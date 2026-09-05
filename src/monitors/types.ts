export interface ExtractedEntity {
  key: string;
  displayName: string;
  status: string;
}

export interface MonitorSnapshot {
  monitorName: string;
  targetUrl: string;
  fetchedAt: Date;
  entities: ExtractedEntity[];
  evidenceHtml: string;
  parserMethod: "http" | "playwright";
  screenshotPath?: string;
}

export interface MonitorDefinition {
  name: string;
  targetUrl: string;
  isClosedStatus(status: string): boolean;
  extract(): Promise<MonitorSnapshot>;
}

export function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value: string): string {
  return normalizeText(value).toLocaleLowerCase("da-DK");
}

export function normalizeStatus(value: string): string {
  return normalizeText(value);
}

const CLOSED_STATUSES = new Set(["lukket", "closed", "stengt", "geschlossen"]);

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(normalizeStatus(status).toLocaleLowerCase("da-DK"));
}
