import ICAL from "ical.js";
import { type Component, getProp, getProps } from "./ics";

// Window checks treat every local time as UTC. The window spans PAST_DAYS days, so being
// off by a few hours at its edge is harmless and saves resolving timezones.

const DAY = 86_400_000;
const MAX_ITERATIONS = 50_000;

/** Parses DATE / DATE-TIME values ("20261015", "20261015T100000", "20261015T100000Z") to ms. */
export function parseIcsDate(value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value.trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

/** Parses a DURATION value ("PT1H", "P1D", "-P1W", "P1DT2H30M") to ms. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const ms = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 24 * 3600 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === "-" ? -ms : ms;
}

/** True if any event of a series (master plus overrides sharing a UID) touches the window. */
export function seriesInWindow(events: Component[], windowStart: number): boolean {
  return events.some((event) => eventInWindow(event, windowStart));
}

function eventInWindow(event: Component, windowStart: number): boolean {
  const dtstart = getProp(event, "DTSTART");
  const start = dtstart && parseIcsDate(dtstart.value);
  if (start == null) return true; // Can't tell: keep it rather than lose it.
  const duration = eventDuration(event, start, dtstart!.value.length === 8);
  if (start + duration >= windowStart) return true;

  for (const rdate of getProps(event, "RDATE")) {
    for (const value of rdate.value.split(",")) {
      const at = parseIcsDate(value.split("/")[0]);
      if (at != null && at + duration >= windowStart) return true;
    }
  }

  const rrule = getProp(event, "RRULE");
  return rrule ? ruleReachesWindow(rrule.value, start, dtstart!.value.length === 8, duration, windowStart) : false;
}

function eventDuration(event: Component, start: number, allDay: boolean): number {
  const dtend = getProp(event, "DTEND");
  const end = dtend && parseIcsDate(dtend.value);
  if (end != null) return Math.max(0, end - start);
  const duration = getProp(event, "DURATION");
  const ms = duration && parseDuration(duration.value);
  if (ms != null) return Math.max(0, ms);
  return allDay ? DAY : 0;
}

function ruleReachesWindow(rule: string, start: number, allDay: boolean, duration: number, windowStart: number): boolean {
  const parts = Object.fromEntries(
    rule.split(";").map((part) => {
      const [key, value = ""] = part.split("=");
      return [key.toUpperCase(), value];
    }),
  );
  // Without UNTIL or COUNT the series never ends, and the window has no end either.
  if (!parts.UNTIL && !parts.COUNT) return true;
  if (parts.UNTIL) {
    const until = parseIcsDate(parts.UNTIL);
    if (until != null && until + duration < windowStart) return false;
  }

  try {
    const recur = ICAL.Recur.fromString(rule);
    const d = new Date(start);
    const dtstart = ICAL.Time.fromData(
      {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
        isDate: allDay,
      },
      ICAL.Timezone.utcTimezone,
    );
    const iterator = recur.iterator(dtstart);
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const next = iterator.next();
      if (!next) return false;
      if (next.toUnixTime() * 1000 + duration >= windowStart) return true;
    }
  } catch {
    // Unparseable rule: keep the event.
  }
  return true;
}
