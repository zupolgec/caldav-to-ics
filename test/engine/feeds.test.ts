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
      "free@example.com",
      "meeting-1@example.com",
      "moved-into-window@example.org",
      "recent@example.org",
      "weekly@example.com",
    ]);
    expect(eventCount).toBe(7); // the declined invitation isn't published
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

const invitations = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  ...[
    ["accepted", "ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com"],
    ["tentative", "ATTENDEE;PARTSTAT=TENTATIVE:mailto:me@example.com"],
    ["unanswered", "ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:me@example.com"],
    ["no-answer-field", "ATTENDEE:mailto:me@example.com"],
    ["declined", "ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com"],
    ["delegated", "ATTENDEE;PARTSTAT=DELEGATED:mailto:me@example.com"],
    ["own-event", ""],
    ["organizer", "ORGANIZER:mailto:me@example.com\r\nATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:guest@example.com"],
    ["someone-elses", "ATTENDEE;PARTSTAT=ACCEPTED:mailto:guest@example.com"],
    ["answered-twice", "ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:me@example.com\r\nATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com"],
  ].map(([uid, extra], i) =>
    ["BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20261001T080000Z", `DTSTART:202610${12 + i}T090000Z`, `DTEND:202610${12 + i}T100000Z`, `SUMMARY:${uid}`, extra, "END:VEVENT"]
      .filter(Boolean)
      .join("\r\n"),
  ),
  // A weekly meeting: accepted, but one occurrence unanswered and one declined.
  "BEGIN:VEVENT",
  "UID:weekly-accepted",
  "DTSTAMP:20261001T080000Z",
  "DTSTART:20261012T150000Z",
  "DTEND:20261012T160000Z",
  "RRULE:FREQ=WEEKLY;COUNT=4",
  "SUMMARY:Weekly accepted",
  "ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly-accepted",
  "DTSTAMP:20261001T080000Z",
  "RECURRENCE-ID:20261019T150000Z",
  "DTSTART:20261019T150000Z",
  "DTEND:20261019T160000Z",
  "SUMMARY:Weekly accepted",
  "ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:me@example.com",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly-accepted",
  "DTSTAMP:20261001T080000Z",
  "RECURRENCE-ID:20261026T150000Z",
  "DTSTART:20261026T150000Z",
  "DTEND:20261026T160000Z",
  "SUMMARY:Weekly accepted",
  "ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com",
  "END:VEVENT",
  // A weekly meeting: declined, but one occurrence accepted.
  "BEGIN:VEVENT",
  "UID:weekly-declined",
  "DTSTAMP:20261001T080000Z",
  "DTSTART:20261013T150000Z",
  "DTEND:20261013T160000Z",
  "RRULE:FREQ=WEEKLY;COUNT=4",
  "SUMMARY:Weekly declined",
  "ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly-declined",
  "DTSTAMP:20261001T080000Z",
  "RECURRENCE-ID:20261020T150000Z",
  "DTSTART:20261020T150000Z",
  "DTEND:20261020T160000Z",
  "SUMMARY:Weekly declined",
  "ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

describe("invitations", () => {
  it("publishes only invitations the owner accepted or answered maybe to, in both feeds", async () => {
    const { full, busy } = await buildFeeds([invitations], options);
    // The single invitations all start at 09:00; the weekly meetings at 15:00.
    const singles = (ics: string) => events(ics).filter((e) => e.getFirstPropertyValue("dtstart")!.toString().endsWith("T09:00:00Z"));
    expect(singles(full).map((e) => e.getFirstPropertyValue("uid")).sort()).toEqual(["accepted", "answered-twice", "organizer", "own-event", "someone-elses", "tentative"]);
    expect(singles(busy)).toHaveLength(6);
  });

  it("removes unanswered and declined occurrences from an accepted series", async () => {
    const { full, busy } = await buildFeeds([invitations], options);
    for (const ics of [full, busy]) {
      const series = events(ics).filter((e) => e.hasProperty("rrule") && e.getFirstPropertyValue("dtstart")!.toString() === "2026-10-12T15:00:00Z");
      expect(series).toHaveLength(1);
      expect(series[0].getAllProperties("exdate").map((p) => p.getFirstValue()!.toString()).sort()).toEqual(["2026-10-19T15:00:00Z", "2026-10-26T15:00:00Z"]);
    }
    expect(events(full).filter((e) => e.getFirstPropertyValue("uid") === "weekly-accepted")).toHaveLength(1);
  });

  it("keeps an accepted occurrence of a declined series as an event of its own", async () => {
    const { full, busy } = await buildFeeds([invitations], options);
    for (const ics of [full, busy]) {
      const declined = events(ics).filter((e) => ["2026-10-13T15:00:00Z", "2026-10-20T15:00:00Z"].includes(e.getFirstPropertyValue("dtstart")!.toString()));
      expect(declined.map((e) => e.getFirstPropertyValue("dtstart")!.toString())).toEqual(["2026-10-20T15:00:00Z"]);
      expect(declined[0].hasProperty("recurrence-id")).toBe(false);
      expect(declined[0].hasProperty("rrule")).toBe(false);
    }
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
    // 7 UIDs in the full feed (the declined one is never published) minus free and cancelled.
    expect(uids(full)).toHaveLength(7);
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

  it("publishes a busy occurrence of a skipped series as a standalone event", async () => {
    const declinedSeries = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:series@example.com",
      "DTSTAMP:20261001T080000Z",
      "DTSTART:20261012T090000Z",
      "DTEND:20261012T100000Z",
      "RRULE:FREQ=WEEKLY",
      "ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:series@example.com",
      "DTSTAMP:20261001T080000Z",
      "RECURRENCE-ID:20261019T090000Z",
      "DTSTART:20261019T090000Z",
      "DTEND:20261019T100000Z",
      "ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const { busy } = await buildFeeds([declinedSeries], options);
    const list = events(busy);
    expect(list).toHaveLength(1);
    expect(list[0].hasProperty("recurrence-id")).toBe(false);
    expect(list[0].getFirstPropertyValue("dtstart")!.toString()).toBe("2026-10-19T09:00:00Z");
  });

  it("hashes UIDs differently for every user", async () => {
    const a = await buildFeeds([SOURCE_A], { ...options, uidSalt: "user-a" });
    const b = await buildFeeds([SOURCE_A], { ...options, uidSalt: "user-b" });
    expect(uids(a.busy)).not.toEqual(uids(b.busy));
  });

  it("includes only the timezones its events use", async () => {
    const { busy, full } = await buildFeeds([SOURCE_A, SOURCE_B], options);
    const tzids = (ics: string) => new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents("vtimezone").map((tz) => tz.getFirstPropertyValue("tzid"));
    expect(tzids(full).sort()).toEqual(["America/New_York", "Europe/Rome"]);
    expect(tzids(busy).sort()).toEqual(["America/New_York", "Europe/Rome"]);
    const romeOnly = await buildFeeds([SOURCE_A], options);
    expect(tzids(romeOnly.busy)).toEqual(["Europe/Rome"]);
    const utcOnly = await buildFeeds([SOURCE_A.replace(/;TZID=Europe\/Rome:(\d{8}T\d{6})/g, ":$1Z")], options);
    expect(tzids(utcOnly.busy)).toEqual([]);
  });

  it("keeps line breaks in the busy title from creating new lines", async () => {
    const { busy } = await buildFeeds([SOURCE_A], { ...options, busyTitle: "Busy\rX-INJECTED:1" });
    expect(busy).not.toMatch(/^X-INJECTED/m);
  });

  it("keeps declined invitations when no owner address is configured", async () => {
    const { busy, full } = await buildFeeds([SOURCE_A, SOURCE_B], { ...options, ownerEmails: [] });
    expect(uids(busy)).toHaveLength(6);
    expect(uids(full)).toContain("declined@example.com");
  });
});
