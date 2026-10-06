import { getProp, parseIcs } from "./engine/ics";
import { SourceError, fetchSource } from "./engine/sources";

export interface CalendarInput {
  url: string;
  username?: string;
  password?: string;
}

export interface ProbedCalendar {
  kind: "ics" | "caldav";
  url: string;
  label: string;
  texts: string[];
}

/** Accepts https://, http:// and webcal:// links; returns the URL to fetch or null. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim().replace(/^webcals?:\/\//i, "https://");
  if (!URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url.href;
}

/**
 * Downloads a calendar to check that it works before saving it. With a username and
 * password, a link that isn't an .ics file is tried as a CalDAV server.
 */
export async function probeCalendar(input: CalendarInput, windowStart: number): Promise<ProbedCalendar> {
  const url = normalizeUrl(input.url);
  if (!url) throw new SourceError("invalid_url");
  const username = input.username?.trim() || undefined;
  const password = input.password || undefined;

  try {
    const texts = await fetchSource({ type: "ics", url, username, password }, windowStart);
    return { kind: "ics", url, label: calendarName(texts) ?? new URL(url).hostname, texts };
  } catch (error) {
    if (!(username && error instanceof SourceError && ["not_ics", "http", "not_found"].includes(error.code))) throw error;
  }
  const texts = await fetchSource({ type: "caldav", url, username, password: password ?? "" }, windowStart);
  return { kind: "caldav", url, label: calendarName(texts) ?? username, texts };
}

function calendarName(texts: string[]): string | null {
  for (const text of texts) {
    const calendar = parseIcs(text.slice(0, 4096) + "\r\nEND:VCALENDAR\r\n").find((c) => c.name === "VCALENDAR");
    const name = calendar && getProp(calendar, "X-WR-CALNAME")?.value.trim();
    if (name) return name.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ").slice(0, 80);
  }
  return null;
}

/** A version of the link safe to display: no query string, long secret-looking parts shortened. */
export function maskUrl(href: string): string {
  const url = new URL(href);
  const path = url.pathname
    .split("/")
    .map((segment) => (looksSecret(segment) ? `${segment.slice(0, 12)}…` : segment))
    .join("/");
  return `${url.host}${path}`.replace(/\/$/, "");
}

function looksSecret(segment: string): boolean {
  return /[0-9a-f]{12,}/i.test(segment) || (/^[\w-]{16,}$/.test(segment) && /\d/.test(segment) && /[a-z]/i.test(segment));
}
