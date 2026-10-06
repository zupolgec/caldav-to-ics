import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { buildFeeds, type FeedOptions } from "../../src/engine/feeds";
import { NOW, SOURCE_A, SOURCE_B } from "./fixtures";

const options: FeedOptions = {
  now: NOW,
  pastDays: 90,
  calendarName: "Team calendar",
  busyTitle: "Busy",
  ownerEmails: ["me@example.com"],
};

function events(ics: string) {
  const vcalendar = new ICAL.Component(ICAL.parse(ics));
  return vcalendar.getAllSubcomponents("vevent");
}

const uids = (ics: string) => [...new Set(events(ics).map((e) => e.getFirstPropertyValue("uid") as string))].sort();

describe("full feed", () => {
  it("merges every source into one valid calendar with its name", async () => {
    const { full } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    const vcalendar = new ICAL.Component(ICAL.parse(full));
    expect(vcalendar.getFirstPropertyValue("x-wr-calname")).toBe("Team calendar");
    expect(vcalendar.getFirstPropertyValue("version")).toBe("2.0");
    expect(full.endsWith("\r\n")).toBe(true);
    expect(full.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it("deduplicates VTIMEZONE components across sources", async () => {
    const { full } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    const tzids = new ICAL.Component(ICAL.parse(full))
      .getAllSubcomponents("vtimezone")
      .map((tz) => tz.getFirstPropertyValue("tzid"));
    expect(tzids.sort()).toEqual(["America/New_York", "Europe/Rome"]);
  });

  it("keeps only events with an occurrence in the time window, recurring ones included", async () => {
    const { full, eventCount } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    expect(uids(full)).toEqual([
      "cancelled@example.com",
      "count-in-window@example.org",
      "declined@example.com",
      "free@example.com",
      "meeting-1@example.com",
      "moved-into-window@example.org",
      "recent@example.org",
      "weekly@example.com",
    ]);
    expect(eventCount).toBe(8);
  });

  it("keeps all event data, recurrence rules and exceptions untouched", async () => {
    const { full } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    const meeting = events(full).find((e) => e.getFirstPropertyValue("uid") === "meeting-1@example.com")!;
    expect(meeting.getFirstPropertyValue("summary")).toBe("Secret project kickoff");
    expect(meeting.getFirstPropertyValue("description")).toBe(
      "Discuss the acquisition of ACME. Very confidential and folded over two lines.",
    );
    expect(meeting.getFirstPropertyValue("location")).toBe("Board room");
    expect(meeting.getAllSubcomponents("valarm")).toHaveLength(1);

    const weekly = events(full).filter((e) => e.getFirstPropertyValue("uid") === "weekly@example.com");
    expect(weekly).toHaveLength(3);
    const master = weekly.find((e) => !e.hasProperty("recurrence-id"))!;
    expect(master.getFirstPropertyValue("rrule")!.toString()).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(master.getFirstProperty("exdate")!.getParameter("tzid")).toBe("Europe/Rome");
    expect(master.getFirstProperty("dtstart")!.getParameter("tzid")).toBe("Europe/Rome");
  });

  it("drops non-event components such as to-dos", async () => {
    const { full } = await buildFeeds([SOURCE_B], options);
    expect(full).not.toContain("VTODO");
  });

  it("does not duplicate an event found in two sources", async () => {
    const { full } = await buildFeeds([SOURCE_A, SOURCE_A], options);
    expect(events(full).filter((e) => e.getFirstPropertyValue("uid") === "meeting-1@example.com")).toHaveLength(1);
  });
});

describe("busy feed", () => {
  it("contains only times, recurrences and a fixed title", async () => {
    const { busy } = await buildFeeds([SOURCE_A, SOURCE_B], { ...options, busyTitle: "Occupato" });
    for (const word of ["Secret", "ACME", "Board room", "meet.example.com", "boss@", "me@example.com", "plan.pdf", "Reminder", "Dentist", "Weekly standup", "PRIVATE", "Work"]) {
      expect(busy).not.toContain(word);
    }
    const allowed = new Set(["uid", "dtstamp", "dtstart", "dtend", "duration", "rrule", "rdate", "exdate", "recurrence-id", "summary", "sequence"]);
    for (const event of events(busy)) {
      expect(event.getFirstPropertyValue("summary")).toBe("Occupato");
      expect(event.getAllSubcomponents()).toHaveLength(0);
      for (const prop of event.getAllProperties()) expect(allowed).toContain(prop.name);
    }
  });

  it("hides the original UIDs but keeps overrides linked to their series", async () => {
    const { busy } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    expect(busy).not.toContain("example.com");
    expect(busy).not.toContain("example.org");
    const weekly = events(busy).filter((e) => e.hasProperty("rrule") && e.getFirstPropertyValue("rrule")!.toString() === "FREQ=WEEKLY;BYDAY=MO");
    expect(weekly).toHaveLength(1);
    const uid = weekly[0].getFirstPropertyValue("uid");
    expect(events(busy).filter((e) => e.getFirstPropertyValue("uid") === uid)).toHaveLength(2);
  });

  it("excludes transparent, cancelled and declined events", async () => {
    const { busy, full } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    // 8 UIDs in the full feed minus free, cancelled and declined.
    expect(uids(full)).toHaveLength(8);
    expect(uids(busy)).toHaveLength(5);
    const starts = events(busy).map((e) => e.getFirstPropertyValue("dtstart")!.toString());
    expect(starts).not.toContain("2026-10-15");
    expect(starts).not.toContain("2026-10-20T14:00:00Z");
    expect(starts).not.toContain("2026-10-21T14:00:00Z");
  });

  it("turns a cancelled occurrence of a series into an EXDATE", async () => {
    const { busy } = await buildFeeds([SOURCE_A], options);
    const master = events(busy).find((e) => e.hasProperty("rrule"))!;
    const exdates = master.getAllProperties("exdate").map((p) => p.getFirstValue()!.toString());
    expect(exdates.sort()).toEqual(["2026-10-12T09:00:00", "2026-10-26T09:00:00"]);
    expect(events(busy).filter((e) => e.hasProperty("recurrence-id"))).toHaveLength(1);
  });

  it("keeps declined invitations when no owner address is configured", async () => {
    const { busy } = await buildFeeds([SOURCE_A, SOURCE_B], { ...options, ownerEmails: [] });
    expect(uids(busy)).toHaveLength(6);
  });
});
