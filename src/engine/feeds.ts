import { type Component, type Property, escapeText, getParam, getProp, getProps, parseIcs, prop, serialize } from "./ics";
import { seriesInWindow } from "./window";

export interface FeedOptions {
  now: number;
  pastDays: number;
  calendarName: string;
  busyTitle: string;
  /** Lower-cased addresses of the calendar owner, used to spot declined invitations. */
  ownerEmails: string[];
  /** Mixed into the hashed UIDs of the busy feed, so two people's feeds can't be matched up. */
  uidSalt?: string;
}

export interface Feeds {
  full: string;
  busy: string;
  /** Number of events (series count once) in the full feed. */
  eventCount: number;
}

/** Properties kept in the busy feed: timing, recurrence and identity only. */
const BUSY_PROPS = new Set(["UID", "DTSTAMP", "DTSTART", "DTEND", "DURATION", "RRULE", "RDATE", "EXDATE", "RECURRENCE-ID", "SEQUENCE"]);

/** Merges the calendars of every source and builds the full and busy feeds. */
export async function buildFeeds(sources: string[], options: FeedOptions): Promise<Feeds> {
  const timezones = new Map<string, Component>();
  // Events grouped by UID; within a group, keyed by RECURRENCE-ID ("" for the master).
  const series = new Map<string, Map<string, Component>>();
  let anonymous = 0;

  for (const text of sources) {
    for (const calendar of parseIcs(text)) {
      if (calendar.name !== "VCALENDAR") continue;
      for (const child of calendar.children) {
        if (child.name === "VTIMEZONE") {
          const tzid = getProp(child, "TZID")?.value;
          if (tzid && !timezones.has(tzid)) timezones.set(tzid, child);
        } else if (child.name === "VEVENT") {
          const uid = getProp(child, "UID")?.value ?? `no-uid-${anonymous++}`;
          const recurrenceId = getProp(child, "RECURRENCE-ID")?.value ?? "";
          const group = series.get(uid) ?? new Map<string, Component>();
          // The same event can show up in more than one source: keep the first copy.
          if (!group.has(recurrenceId)) group.set(recurrenceId, child);
          series.set(uid, group);
        }
      }
    }
  }

  const windowStart = options.now - options.pastDays * 86_400_000;
  const kept = [...series.entries()]
    .map(([uid, group]) => ({ uid, events: [...group.values()] }))
    .filter(({ events }) => seriesInWindow(events, windowStart));

  const fullEvents = kept.flatMap(({ events }) => events);
  const busyEvents: Component[] = [];
  for (const { uid, events } of kept) busyEvents.push(...(await busySeries(uid, events, options)));

  // The busy feed only carries the timezones its events use.
  const busyTzids = new Set(busyEvents.flatMap((e) => e.props.map((p) => getParam(p, "TZID")).filter((tz): tz is string => !!tz)));
  return {
    full: calendar(options.calendarName, [...timezones.values()], fullEvents),
    busy: calendar(options.calendarName, [...timezones.entries()].filter(([tzid]) => busyTzids.has(tzid)).map(([, tz]) => tz), busyEvents),
    eventCount: kept.length,
  };
}

function calendar(name: string, timezones: Component[], events: Component[]): string {
  return serialize([
    {
      name: "VCALENDAR",
      props: [
        prop("VERSION", "2.0"),
        prop("PRODID", "-//caldav-to-ics//EN"),
        prop("CALSCALE", "GREGORIAN"),
        prop("METHOD", "PUBLISH"),
        prop("X-WR-CALNAME", escapeText(name)),
      ],
      children: [...timezones, ...events],
    },
  ]);
}

async function busySeries(uid: string, events: Component[], options: FeedOptions): Promise<Component[]> {
  const salt = options.uidSalt ?? "";
  const hashedUid = `${await sha256(`${salt}\n${uid}`)}@calendario`;
  const master = events.find((e) => !getProp(e, "RECURRENCE-ID"));
  const masterBusy = master && isBusy(master, options.ownerEmails);
  const result: Component[] = [];
  const exdates: Property[] = [];

  for (const event of events) {
    const recurrenceId = getProp(event, "RECURRENCE-ID");
    if (event === master) continue;
    if (isBusy(event, options.ownerEmails) && masterBusy) {
      result.push(sanitize(event, hashedUid, options.busyTitle));
    } else if (isBusy(event, options.ownerEmails)) {
      // Its series isn't published: without it, calendar apps would drop the occurrence.
      const ownUid = `${await sha256(`${salt}\n${uid}\n${recurrenceId?.value ?? ""}`)}@calendario`;
      const standalone = sanitize(event, ownUid, options.busyTitle);
      standalone.props = standalone.props.filter((p) => p.name !== "RECURRENCE-ID");
      result.push(standalone);
    } else if (masterBusy && recurrenceId) {
      // A skipped occurrence of a busy series: remove it from the series instead.
      const params = ["TZID", "VALUE"]
        .map((name) => [name, getParam(recurrenceId, name)])
        .filter(([, value]) => value)
        .map(([name, value]) => `${name}=${value}`)
        .join(";");
      exdates.push(prop("EXDATE", recurrenceId.value, params));
    }
  }

  if (masterBusy) {
    const sanitized = sanitize(master, hashedUid, options.busyTitle);
    sanitized.props.push(...exdates);
    result.unshift(sanitized);
  }
  return result;
}

function isBusy(event: Component, ownerEmails: string[]): boolean {
  if (getProp(event, "TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT") return false;
  if (getProp(event, "STATUS")?.value.trim().toUpperCase() === "CANCELLED") return false;
  return !getProps(event, "ATTENDEE").some(
    (attendee) =>
      getParam(attendee, "PARTSTAT")?.toUpperCase() === "DECLINED" &&
      ownerEmails.includes(attendee.value.trim().replace(/^mailto:/i, "").toLowerCase()),
  );
}

function sanitize(event: Component, uid: string, title: string): Component {
  const props: Property[] = [prop("UID", uid), prop("SUMMARY", escapeText(title))];
  for (const p of event.props) if (BUSY_PROPS.has(p.name) && p.name !== "UID") props.push(p);
  return { name: "VEVENT", props, children: [] };
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
