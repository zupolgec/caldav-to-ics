import ICAL from "ical.js";

// Builds a week of a published feed, occurrence by occurrence, as a calendar app would show it.

export interface PreviewEvent {
  title: string;
  /** "9:30–10:00" in the viewer's timezone, or null for all-day events. */
  time: string | null;
  start: number;
  allDay: boolean;
  /** Index of the source calendar (for its colour), when known. */
  color: number | null;
  cancelled: boolean;
  /** Marked as free (TRANSP:TRANSPARENT). */
  free: boolean;
}

export interface PreviewDay {
  date: string;
  events: PreviewEvent[];
}

const DAY = 86_400_000;
const MAX_OCCURRENCES = 50_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function localParts(ms: number, tz: string) {
  let format = formatters.get(tz);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, format);
  }
  const p = Object.fromEntries(format.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: p.minute };
}

/** Today's date ("2026-10-07") in a timezone. */
export function localDate(ms: number, tz: string): string {
  return localParts(ms, tz).date;
}

export function isTimeZone(tz: string | undefined): tz is string {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

/** The instant a local date starts in a timezone. */
function startOfDay(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offset = (ms: number) => {
    const p = localParts(ms, tz);
    const [ly, lm, ld] = p.date.split("-").map(Number);
    return Date.UTC(ly, lm - 1, ld, p.hour, Number(p.minute)) - Math.floor(ms / 60_000) * 60_000;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

/** Monday of the week containing `ms`, as a local date in `tz`. */
export function startOfWeek(ms: number, tz: string): string {
  const date = localParts(ms, tz).date;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** The seven days from `weekStart` with every occurrence of the feed's events. */
export function previewWeek(ics: string, weekStart: string, tz: string, colorOf?: (uid: string) => number | null): PreviewDay[] {
  const days: PreviewDay[] = Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), events: [] }));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const rangeStart = startOfDay(weekStart, tz);
  const rangeEnd = startOfDay(addDays(weekStart, 7), tz);
  const hm = (ms: number) => {
    const p = localParts(ms, tz);
    return `${p.hour}:${p.minute}`;
  };

  const calendar = new ICAL.Component(ICAL.parse(ics));
  for (const vtimezone of calendar.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(vtimezone);

  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    const component = item.component;
    const base = {
      title: item.summary ?? "",
      color: colorOf?.(item.uid) ?? null,
      cancelled: String(component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED",
      free: String(component.getFirstPropertyValue("transp") ?? "").toUpperCase() === "TRANSPARENT",
    };
    if (start.isDate) {
      const first = start.toString().slice(0, 10);
      const last = end && end.compare(start) > 0 ? addDays(end.toString().slice(0, 10), -1) : first;
      for (let date = first; date <= last; date = addDays(date, 1)) {
        byDate.get(date)?.events.push({ ...base, time: null, start: rangeStart, allDay: true });
        if (date > days[6].date) break;
      }
      return;
    }
    const startMs = start.toJSDate().getTime();
    const endMs = Math.max(end ? end.toJSDate().getTime() : startMs, startMs);
    if (startMs >= rangeEnd || endMs <= rangeStart) return;
    const day = byDate.get(localParts(startMs, tz).date) ?? (startMs < rangeStart ? days[0] : undefined);
    day?.events.push({ ...base, time: endMs > startMs ? `${hm(startMs)}–${hm(endMs)}` : hm(startMs), start: startMs, allDay: false });
  };

  // Group masters with their exceptions, which share the UID.
  const series = new Map<string, { master?: ICAL.Component; exceptions: ICAL.Component[] }>();
  for (const vevent of calendar.getAllSubcomponents("vevent")) {
    const uid = String(vevent.getFirstPropertyValue("uid") ?? "");
    const entry = series.get(uid) ?? { exceptions: [] };
    if (vevent.hasProperty("recurrence-id")) entry.exceptions.push(vevent);
    else entry.master = vevent;
    series.set(uid, entry);
  }

  for (const { master, exceptions } of series.values()) {
    if (!master) {
      for (const exception of exceptions) {
        const event = new ICAL.Event(exception);
        add(event, event.startDate, event.endDate);
      }
      continue;
    }
    const event = new ICAL.Event(master, { exceptions });
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate);
      continue;
    }
    const iterator = event.iterator();
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const next = iterator.next();
      if (!next || next.toJSDate().getTime() >= rangeEnd + DAY) break;
      const details = event.getOccurrenceDetails(next);
      add(details.item, details.startDate, details.endDate);
    }
  }

  for (const day of days) day.events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title));
  return days;
}
