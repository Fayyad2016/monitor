import { describe, expect, it } from "vitest";
import { extractFindboligWaitingList } from "../src/monitors/findbolig.js";
import { ParseError } from "../src/errors.js";
import { loadFixture } from "./helpers/fixtures.js";

describe("Findbolig waiting-list extractor", () => {
  it("extracts every housing fund row and normalizes statuses", () => {
    const html = loadFixture("findbolig-closed.html");
    const { entities } = extractFindboligWaitingList(html);
    expect(entities.map((row) => [row.displayName, row.status])).toEqual([
      ["Arendal", "Lukket"],
      ["Enghaven", "Lukket"],
      ["Frederiksberg Boligfond", "Lukket"],
      ["Fuglevænget", "Lukket"],
      ["Hvidkildegård", "Lukket"],
      ["Østergården", "Lukket"],
      ["Søndergården", "Lukket"],
      ["Solgården", "Lukket"],
      ["Vestergården", "Lukket"],
      ["Vibehusene", "Lukket"]
    ]);
  });

  it("automatically includes newly added housing fund rows", () => {
    const html = loadFixture("findbolig-closed.html").replace(
      "</tbody>",
      "<tr><td>Ny Fond</td><td>Åben</td></tr></tbody>"
    );
    const { entities } = extractFindboligWaitingList(html);
    expect(entities.some((row) => row.displayName === "Ny Fond" && row.status === "Åben")).toBe(true);
  });

  it("does not treat generic page HTML without the section as a status change source", () => {
    expect(() => extractFindboligWaitingList("<html><body><p>hello</p></body></html>")).toThrow(ParseError);
  });

  it("parses the saved live Findbolig page snapshot", () => {
    const html = loadFixture("findbolig-live-snapshot.html");
    const { entities } = extractFindboligWaitingList(html);
    expect(entities.map((row) => row.displayName)).toEqual([
      "Arendal",
      "Enghaven",
      "Frederiksberg Boligfond",
      "Fuglevænget",
      "Hvidkildegård",
      "Østergården",
      "Søndergården",
      "Solgården",
      "Vestergården",
      "Vibehusene"
    ]);
    expect(entities.every((row) => row.status === "Lukket")).toBe(true);
  });
});
