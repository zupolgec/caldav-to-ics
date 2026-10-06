export type Source =
  | { type: "caldav"; url: string; username: string; password: string }
  | { type: "ics"; url: string; username?: string; password?: string };

export type SourceErrorCode = "invalid_url" | "unauthorized" | "not_found" | "http" | "not_ics" | "too_large" | "timeout" | "network" | "no_calendars";

/** A failure the interface can explain to the user. */
export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    readonly status?: number,
  ) {
    super(status ? `${code} (HTTP ${status})` : code);
  }
}

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 20 * 1024 * 1024;

/** Downloads a source and returns its calendar data as one or more iCalendar documents. */
export async function fetchSource(source: Source, windowStart: number): Promise<string[]> {
  const texts = source.type === "caldav" ? await fetchCaldav(source, windowStart) : [await fetchIcs(source)];
  if (texts.reduce((n, text) => n + text.length, 0) > MAX_BYTES) throw new SourceError("too_large");
  return texts;
}

async function fetchIcs(source: Extract<Source, { type: "ics" }>): Promise<string> {
  const headers = new Headers({ Accept: "text/calendar, */*" });
  if (source.username) headers.set("Authorization", basicAuth(source.username, source.password ?? ""));
  const response = await send(source.url, { headers });
  checkStatus(response);
  const text = await readText(response);
  if (!text.includes("BEGIN:VCALENDAR")) throw new SourceError("not_ics");
  return text;
}

/**
 * Fetches with a timeout. Requests carrying a password follow redirects only on the same
 * server, so credentials never reach another host.
 */
async function send(url: string, init: RequestInit, hops = 0): Promise<Response> {
  const withCredentials = new Headers(init.headers).has("Authorization");
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: withCredentials ? "manual" : "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new SourceError(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
  }
  const location = response.headers.get("Location");
  if (withCredentials && response.status >= 300 && response.status < 400 && location) {
    const next = new URL(location, url);
    if (next.origin !== new URL(url).origin || hops >= 5) throw new SourceError("http", response.status);
    return send(next.href, init, hops + 1);
  }
  return response;
}

function checkStatus(response: Response): void {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) throw new SourceError("unauthorized", response.status);
  if (response.status === 404 || response.status === 410) throw new SourceError("not_found", response.status);
  throw new SourceError("http", response.status);
}

/** Reads a response body, giving up as soon as it grows past MAX_BYTES. */
async function readText(response: Response): Promise<string> {
  if (Number(response.headers.get("Content-Length") ?? 0) > MAX_BYTES) throw new SourceError("too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new SourceError("too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

type CaldavSource = Extract<Source, { type: "caldav" }>;

async function fetchCaldav(source: CaldavSource, windowStart: number): Promise<string[]> {
  const first = await calendarQuery(source, source.url, windowStart);
  if (first && first.length > 0) return first;
  // Nothing came back: the URL may point to the account rather than to a calendar.
  const calendars = await discoverCalendars(source, source.url, 0);
  if (calendars.length === 0) {
    if (first) return first; // A calendar that is simply empty.
    throw new SourceError("no_calendars");
  }
  const results = await Promise.all(calendars.map((url) => calendarQuery(source, url, windowStart)));
  return results.flatMap((texts) => texts ?? []);
}

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

async function dav(source: CaldavSource, method: string, url: string, depth: string, body: string): Promise<Response> {
  return send(url, {
    method,
    headers: {
      Authorization: basicAuth(source.username, source.password),
      Depth: depth,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  });
}

/** REPORT calendar-query for events from windowStart onwards; null if the URL isn't a calendar. */
async function calendarQuery(source: CaldavSource, url: string, windowStart: number): Promise<string[] | null> {
  const start = new Date(windowStart).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
  const response = await dav(source, "REPORT", url, "1", body);
  if (response.status === 401 || response.status === 403) throw new SourceError("unauthorized", response.status);
  if (response.status !== 207) return null;
  const xml = await readText(response);
  return elements(xml, "calendar-data").map(xmlText).filter((text) => text.includes("BEGIN:VCALENDAR"));
}

/** Finds the event calendars under a URL, following principal and calendar-home-set links. */
async function discoverCalendars(source: CaldavSource, url: string, hops: number): Promise<string[]> {
  if (hops > 3) return [];
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype/>
    <d:current-user-principal/>
    <c:calendar-home-set/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`;
  const response = await dav(source, "PROPFIND", url, "1", body);
  if (response.status !== 207) checkStatus(response);
  if (response.status !== 207) throw new SourceError("no_calendars");
  const xml = await readText(response);

  // Links to other servers are ignored: the password must only ever go to this one.
  const origin = new URL(url).origin;
  const sameServer = (href: string) => {
    const target = new URL(xmlText(href).trim(), url);
    return target.origin === origin ? target.href : undefined;
  };
  const calendars: string[] = [];
  let next: string | undefined;
  for (const res of elements(xml, "response")) {
    const href = elements(res, "href")[0];
    if (!href) continue;
    const resourcetype = elements(res, "resourcetype")[0] ?? "";
    const components = elements(res, "supported-calendar-component-set")[0];
    if (/<(?:[\w-]+:)?calendar[\s/>]/.test(resourcetype) && (!components || /name=["']VEVENT["']/i.test(components))) {
      const calendar = sameServer(href);
      if (calendar) calendars.push(calendar);
    }
    const link = elements(res, "calendar-home-set")[0] ?? elements(res, "current-user-principal")[0];
    const linkHref = link && elements(link, "href")[0];
    if (linkHref && !next) next = sameServer(linkHref);
  }
  if (calendars.length > 0) return calendars;
  return next && next !== url ? discoverCalendars(source, next, hops + 1) : [];
}

/** Inner contents of every element with the given local name, whatever its namespace prefix. */
function elements(xml: string, localName: string): string[] {
  const re = new RegExp(`<((?:[\\w-]+:)?${localName})(?:\\s[^>]*)?>([\\s\\S]*?)</\\1\\s*>`, "g");
  return [...xml.matchAll(re)].map((m) => m[2]);
}

function xmlText(content: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(content);
  if (cdata) return cdata[1];
  return content.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    if (entity[0] !== "#") return named[entity.toLowerCase()];
    return String.fromCodePoint(entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
  });
}
