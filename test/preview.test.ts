import { describe, expect, it } from "vitest";
import { buildFeeds } from "../src/engine/feeds";
import { previewWeek, startOfWeek } from "../src/preview";
import { NOW, SOURCE_A, SOURCE_B } from "./engine/fixtures";

const options = { now: NOW, pastDays: 90, calendarName: "Test", busyTitle: "Busy", ownerEmails: ["me@example.com"] };
const titles = (days: ReturnType<typeof previewWeek>, date: string) => days.find((d) => d.date === date)!.events.map((e) => e.title);

describe("week preview", () => {
  it("starts weeks on Monday in the viewer's timezone", () => {
    expect(startOfWeek(Date.UTC(2026, 9, 7, 12), "Europe/Rome")).toBe("2026-10-05");
    // Sunday 23:30 in New York is already Monday in UTC.
    expect(startOfWeek(Date.UTC(2026, 9, 12, 3, 30), "America/New_York")).toBe("2026-10-05");
    expect(startOfWeek(Date.UTC(2026, 9, 12, 3, 30), "UTC")).toBe("2026-10-12");
  });

  it("expands repeating events with their moved, cancelled and skipped occurrences", async () => {
    const { full } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    const days = previewWeek(full, "2026-10-12", "Europe/Rome");
    expect(days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(titles(days, "2026-10-12")).toEqual([]); // EXDATE
    expect(titles(days, "2026-10-15")).toEqual(["Public holiday"]);
    const holiday = days.find((d) => d.date === "2026-10-15")!.events[0];
    expect(holiday).toMatchObject({ allDay: true, free: true });

    const next = previewWeek(full, "2026-10-19", "Europe/Rome");
    const moved = next.find((d) => d.date === "2026-10-19")!.events;
    expect(moved).toMatchObject([{ title: "Weekly standup (moved)", time: "10:00–10:30", allDay: false }]);
    expect(next.find((d) => d.date === "2026-10-20")!.events[0]).toMatchObject({ title: "Cancelled call", time: "16:00–17:00", cancelled: true });

    const later = previewWeek(full, "2026-10-26", "Europe/Rome");
    expect(later.find((d) => d.date === "2026-10-26")!.events[0]).toMatchObject({ title: "Weekly standup", cancelled: true });
  });

  it("shows times in the viewer's timezone", async () => {
    const { full } = await buildFeeds([SOURCE_A], options);
    const days = previewWeek(full, "2026-10-19", "America/New_York");
    expect(days.find((d) => d.date === "2026-10-19")!.events[0].time).toBe("4:00–4:30");
  });

  it("shows the busy feed as subscribers see it", async () => {
    const { busy } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    const days = previewWeek(busy, "2026-10-19", "Europe/Rome");
    expect(days.flatMap((d) => d.events).map((e) => [e.title, e.time])).toEqual([["Busy", "10:00–10:30"]]);
    const later = previewWeek(busy, "2026-10-26", "Europe/Rome");
    expect(titles(later, "2026-10-26")).toEqual([]); // cancelled occurrence
  });

  it("colours events by the calendar they come from", async () => {
    const { full } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    const days = previewWeek(full, "2026-08-31", "Europe/Rome", (uid) => (uid.endsWith("example.org") ? 1 : 0));
    const dentist = days.find((d) => d.date === "2026-09-01")!.events.find((e) => e.title === "Dentist")!;
    // The fixture's New York timezone only defines standard time (UTC-5): 10:00 there is 17:00 in Rome.
    expect(dentist).toMatchObject({ color: 1, time: "17:00–18:00" });
  });
});
