// Calendar fixtures used by the tests. "Now" in the tests is 2026-10-06T12:00:00Z,
// so with PAST_DAYS=90 the window starts on 2026-07-08T12:00:00Z.
export const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n";

const VTIMEZONE_ROME = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Rome",
  "BEGIN:STANDARD",
  "DTSTART:19701025T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700329T020000",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

/** Source A: a CalDAV-like calendar with private details, recurrences and exceptions. */
export const SOURCE_A = crlf([
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Source A//EN",
  ...VTIMEZONE_ROME,
  // Future one-off meeting with lots of private data.
  "BEGIN:VEVENT",
  "UID:meeting-1@example.com",
  "DTSTAMP:20261001T080000Z",
  "DTSTART;TZID=Europe/Rome:20261010T100000",
  "DTEND;TZID=Europe/Rome:20261010T110000",
  "SUMMARY:Secret project kickoff",
  "DESCRIPTION:Discuss the acquisition of ACME. Very confidential",
  "  and folded over two lines.",
  "LOCATION:Board room",
  "URL:https://meet.example.com/abc",
  "ORGANIZER;CN=Boss:mailto:boss@example.com",
  "ATTENDEE;CN=Me;PARTSTAT=ACCEPTED:mailto:me@example.com",
  "ATTACH:https://files.example.com/plan.pdf",
  "CATEGORIES:Work",
  "CLASS:PRIVATE",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Reminder",
  "TRIGGER:-PT15M",
  "END:VALARM",
  "END:VEVENT",
  // Weekly recurring event started long ago, still going on, with an exception and an EXDATE.
  "BEGIN:VEVENT",
  "UID:weekly@example.com",
  "DTSTAMP:20250101T080000Z",
  "DTSTART;TZID=Europe/Rome:20250106T090000",
  "DTEND;TZID=Europe/Rome:20250106T093000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO",
  "EXDATE;TZID=Europe/Rome:20261012T090000",
  "SUMMARY:Weekly standup",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly@example.com",
  "DTSTAMP:20250101T080000Z",
  "RECURRENCE-ID;TZID=Europe/Rome:20261019T090000",
  "DTSTART;TZID=Europe/Rome:20261019T100000",
  "DTEND;TZID=Europe/Rome:20261019T103000",
  "SUMMARY:Weekly standup (moved)",
  "END:VEVENT",
  // A cancelled occurrence of the weekly event.
  "BEGIN:VEVENT",
  "UID:weekly@example.com",
  "DTSTAMP:20250101T080000Z",
  "RECURRENCE-ID;TZID=Europe/Rome:20261026T090000",
  "DTSTART;TZID=Europe/Rome:20261026T090000",
  "DTEND;TZID=Europe/Rome:20261026T093000",
  "STATUS:CANCELLED",
  "SUMMARY:Weekly standup",
  "END:VEVENT",
  // Transparent (free) event: in the full feed, not in the busy feed.
  "BEGIN:VEVENT",
  "UID:free@example.com",
  "DTSTAMP:20261001T080000Z",
  "DTSTART;VALUE=DATE:20261015",
  "DTEND;VALUE=DATE:20261016",
  "TRANSP:TRANSPARENT",
  "SUMMARY:Public holiday",
  "END:VEVENT",
  // Cancelled event.
  "BEGIN:VEVENT",
  "UID:cancelled@example.com",
  "DTSTAMP:20261001T080000Z",
  "DTSTART:20261020T140000Z",
  "DTEND:20261020T150000Z",
  "STATUS:CANCELLED",
  "SUMMARY:Cancelled call",
  "END:VEVENT",
  // Invitation the owner declined (quoted params on purpose).
  "BEGIN:VEVENT",
  "UID:declined@example.com",
  "DTSTAMP:20261001T080000Z",
  "DTSTART:20261021T140000Z",
  "DTEND:20261021T150000Z",
  'ATTENDEE;CN="Me, myself";PARTSTAT=DECLINED:mailto:ME@example.com',
  "ATTENDEE;PARTSTAT=ACCEPTED:mailto:other@example.com",
  "SUMMARY:Declined invite",
  "END:VEVENT",
  "END:VCALENDAR",
]);

/** Source B: an ICS feed sharing the Europe/Rome timezone, with old and edge-case events. */
export const SOURCE_B = crlf([
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Source B//EN",
  ...VTIMEZONE_ROME,
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:STANDARD",
  "DTSTART:19701101T020000",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
  // Recent past event inside the window.
  "BEGIN:VEVENT",
  "UID:recent@example.org",
  "DTSTAMP:20260901T080000Z",
  "DTSTART;TZID=America/New_York:20260901T100000",
  "DTEND;TZID=America/New_York:20260901T110000",
  "SUMMARY:Dentist",
  "END:VEVENT",
  // Old event outside the window.
  "BEGIN:VEVENT",
  "UID:old@example.org",
  "DTSTAMP:20250101T080000Z",
  "DTSTART:20250301T100000Z",
  "DTEND:20250301T110000Z",
  "SUMMARY:Old event",
  "END:VEVENT",
  // Old recurring event that ended (UNTIL) before the window.
  "BEGIN:VEVENT",
  "UID:ended-until@example.org",
  "DTSTAMP:20250101T080000Z",
  "DTSTART:20250101T100000Z",
  "DTEND:20250101T110000Z",
  "RRULE:FREQ=DAILY;UNTIL=20250201T100000Z",
  "SUMMARY:Ended daily",
  "END:VEVENT",
  // Old recurring event that ended (COUNT) before the window.
  "BEGIN:VEVENT",
  "UID:ended-count@example.org",
  "DTSTAMP:20250101T080000Z",
  "DTSTART:20250105T100000Z",
  "DURATION:PT1H",
  "RRULE:FREQ=WEEKLY;COUNT=10",
  "SUMMARY:Ended weekly",
  "END:VEVENT",
  // Recurring event whose last occurrences (COUNT) fall inside the window.
  "BEGIN:VEVENT",
  "UID:count-in-window@example.org",
  "DTSTAMP:20260101T080000Z",
  "DTSTART:20260601T100000Z",
  "DURATION:PT1H",
  "RRULE:FREQ=WEEKLY;COUNT=10",
  "SUMMARY:Course",
  "END:VEVENT",
  // Old one-off event whose only in-window part is a moved occurrence (override).
  "BEGIN:VEVENT",
  "UID:moved-into-window@example.org",
  "DTSTAMP:20250101T080000Z",
  "DTSTART:20250101T100000Z",
  "DTEND:20250101T110000Z",
  "RRULE:FREQ=MONTHLY;COUNT=3",
  "SUMMARY:Rescheduled review",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:moved-into-window@example.org",
  "DTSTAMP:20250101T080000Z",
  "RECURRENCE-ID:20250301T100000Z",
  "DTSTART:20261101T100000Z",
  "DTEND:20261101T110000Z",
  "SUMMARY:Rescheduled review",
  "END:VEVENT",
  // A to-do: not part of the feeds.
  "BEGIN:VTODO",
  "UID:todo@example.org",
  "DTSTAMP:20261001T080000Z",
  "SUMMARY:Buy milk",
  "END:VTODO",
  "END:VCALENDAR",
]);

/** A CalDAV multistatus body wrapping calendar data, as returned by REPORT calendar-query. */
export function multistatus(...calendars: string[]): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const responses = calendars
    .map(
      (cal, i) => `
  <d:response>
    <d:href>/dav/me/calendar/event-${i}.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-${i}"</d:getetag>
        <cal:calendar-data>${escape(cal)}</cal:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">${responses}
</d:multistatus>`;
}

/** Splits a calendar into one VCALENDAR per UID, the way CalDAV servers store resources. */
export function splitPerResource(ics: string): string[] {
  const lines = ics.split("\r\n");
  const header = lines.slice(0, 3);
  const timezones: string[] = [];
  const byUid = new Map<string, string[]>();
  let current: string[] | null = null;
  let inTz = false;
  for (const line of lines) {
    if (line === "BEGIN:VTIMEZONE") inTz = true;
    if (inTz) timezones.push(line);
    if (line === "END:VTIMEZONE") inTz = false;
    if (line === "BEGIN:VEVENT") current = [];
    if (current) current.push(line);
    if (line === "END:VEVENT" && current) {
      const uid = current.find((l) => l.startsWith("UID:"))!.slice(4);
      byUid.set(uid, [...(byUid.get(uid) ?? []), ...current]);
      current = null;
    }
  }
  return [...byUid.values()].map((events) => crlf([...header, ...timezones, ...events, "END:VCALENDAR"]));
}
