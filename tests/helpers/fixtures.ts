import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

export function loadFixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), "utf8");
}
