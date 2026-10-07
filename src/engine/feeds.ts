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

  const fullEvents: Component[] = [];
  const busyEvents: Component[] = [];
  let eventCount = 0;
  for (const { uid, events } of kept) {
    const full = fullSeries(uid, selectSeries(events, (e) => isAttending(e, options.ownerEmails)));
    if (full.length > 0) eventCount++;
    fullEvents.push(...full);
    busyEvents.push(...(await busySeries(uid, selectSeries(events, (e) => isBusy(e, options.ownerEmails)), options)));
  }

  // The busy feed only carries the timezones its events use.
  const busyTzids = new Set(busyEvents.flatMap((e) => e.props.map((p) => getParam(p, "TZID")).filter((tz): tz is string => !!tz)));
  return {
    full: calendar(options.calendarName, [...timezones.values()], fullEvents),
    busy: calendar(options.calendarName, [...timezones.entries()].filter(([tzid]) => busyTzids.has(tzid)).map(([, tz]) => tz), busyEvents),
    eventCount,
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

/** The events of one series (a master and its exceptions, sharing a UID) that a feed publishes. */
interface Selection {
  /** The master, when published, plus EXDATEs for its occurrences that are left out. */
  master?: Component;
  exdates: Property[];
  /** Published exceptions of a published master. */
  exceptions: Component[];
  /** Published exceptions whose master is left out: they become events of their own. */
  standalone: Component[];
}

function selectSeries(events: Component[], include: (event: Component) => boolean): Selection {
  const master = events.find((e) => !getProp(e, "RECURRENCE-ID"));
  const keepMaster = !!master && include(master);
  const selection: Selection = { master: keepMaster ? master : undefined, exdates: [], exceptions: [], standalone: [] };
  for (const event of events) {
    if (event === master) continue;
    const recurrenceId = getProp(event, "RECURRENCE-ID")!;
    if (include(event)) (keepMaster ? selection.exceptions : selection.standalone).push(event);
    else if (keepMaster) selection.exdates.push(exdateFor(recurrenceId));
  }
  return selection;
}

function exdateFor(recurrenceId: Property): Property {
  const params = ["TZID", "VALUE"]
    .map((name) => [name, getParam(recurrenceId, name)])
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join(";");
  return prop("EXDATE", recurrenceId.value, params);
}

/** An exception turned into an event of its own: no RECURRENCE-ID, and a UID of its own. */
function detach(event: Component, uid: string): Component {
  return { ...event, props: [prop("UID", uid), ...event.props.filter((p) => p.name !== "UID" && p.name !== "RECURRENCE-ID")] };
}

function fullSeries(uid: string, selection: Selection): Component[] {
  const result: Component[] = [];
  if (selection.master) result.push({ ...selection.master, props: [...selection.master.props, ...selection.exdates] });
  result.push(...selection.exceptions);
  for (const event of selection.standalone) result.push(detach(event, `${uid}-${getProp(event, "RECURRENCE-ID")!.value}`));
  return result;
}

async function busySeries(uid: string, selection: Selection, options: FeedOptions): Promise<Component[]> {
  const salt = options.uidSalt ?? "";
  const hashedUid = `${await sha256(`${salt}\n${uid}`)}@calendario`;
  const result: Component[] = [];
  if (selection.master) {
    const master = sanitize(selection.master, hashedUid, options.busyTitle);
    master.props.push(...selection.exdates);
    result.push(master);
  }
  for (const event of selection.exceptions) result.push(sanitize(event, hashedUid, options.busyTitle));
  for (const event of selection.standalone) {
    const ownUid = `${await sha256(`${salt}\n${uid}\n${getProp(event, "RECURRENCE-ID")!.value}`)}@calendario`;
    result.push(detach(sanitize(event, ownUid, options.busyTitle), ownUid));
  }
  return result;
}

/**
 * Whether the owner takes part: events they're not invited to (their own, or where they
 * organize) always count; invitations only if accepted or answered "maybe".
 */
function isAttending(event: Component, ownerEmails: string[]): boolean {
  const mine = getProps(event, "ATTENDEE").filter((attendee) => ownerEmails.includes(attendee.value.trim().replace(/^mailto:/i, "").toLowerCase()));
  if (mine.length === 0) return true;
  return mine.some((attendee) => ["ACCEPTED", "TENTATIVE"].includes(getParam(attendee, "PARTSTAT")?.toUpperCase() ?? "NEEDS-ACTION"));
}

function isBusy(event: Component, ownerEmails: string[]): boolean {
  if (getProp(event, "TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT") return false;
  if (getProp(event, "STATUS")?.value.trim().toUpperCase() === "CANCELLED") return false;
  return isAttending(event, ownerEmails);
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
