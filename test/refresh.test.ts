import { describe, expect, it } from "vitest";
import { contentHash } from "../src/refresh";

const event = (uid: string, summary: string, stamp: string) =>
  ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, "DTSTART:20261010T100000Z", `SUMMARY:${summary}`, "END:VEVENT"].join("\r\n");
const calendar = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR", ""].join("\r\n");

describe("calendar content hash", () => {
  it("ignores the order of events and DTSTAMP, which Google changes on every download", async () => {
    const first = calendar(event("a", "Lunch", "20261006T220000Z"), event("b", "Call", "20261006T220000Z"));
    const second = calendar(event("b", "Call", "20261006T224600Z"), event("a", "Lunch", "20261006T224600Z"));
    expect(await contentHash([first])).toBe(await contentHash([second]));
  });

  it("changes when an event changes", async () => {
    const before = calendar(event("a", "Lunch", "20261006T220000Z"));
    const after = calendar(event("a", "Late lunch", "20261006T220000Z"));
    expect(await contentHash([before])).not.toBe(await contentHash([after]));
  });
});
