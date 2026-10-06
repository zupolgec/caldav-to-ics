import type { Source } from "./config";

/** Downloads a source and returns its calendar data as one or more iCalendar documents. */
export async function fetchSource(source: Source, windowStart: number): Promise<string[]> {
  return source.type === "caldav" ? fetchCaldav(source, windowStart) : [await fetchIcs(source)];
}

async function fetchIcs(source: Extract<Source, { type: "ics" }>): Promise<string> {
  const headers = new Headers(source.headers);
  if (source.username !== undefined) headers.set("Authorization", basicAuth(source.username, source.password ?? ""));
  const response = await fetch(source.url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("the response is not an iCalendar document");
  return text;
}

type CaldavSource = Extract<Source, { type: "caldav" }>;

async function fetchCaldav(source: CaldavSource, windowStart: number): Promise<string[]> {
  const first = await calendarQuery(source, source.url, windowStart);
  if (first && first.length > 0) return first;
  // Nothing came back: the URL may point to the account rather than to a calendar.
  const calendars = await discoverCalendars(source, source.url, 0);
  if (calendars.length === 0) {
    if (first) return first; // A calendar that is simply empty.
    throw new Error("no calendars found at the configured URL");
  }
  const results = await Promise.all(calendars.map((url) => calendarQuery(source, url, windowStart)));
  return results.flatMap((texts) => texts ?? []);
}

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

async function dav(source: CaldavSource, method: string, url: string, depth: string, body: string): Promise<Response> {
  return fetch(url, {
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
  if (response.status === 401 || response.status === 403) throw new Error(`HTTP ${response.status} (check username and password)`);
  if (response.status !== 207) return null;
  const xml = await response.text();
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
  if (response.status !== 207) throw new Error(`HTTP ${response.status} while looking for calendars`);
  const xml = await response.text();

  const calendars: string[] = [];
  let next: string | undefined;
  for (const res of elements(xml, "response")) {
    const href = elements(res, "href")[0];
    if (!href) continue;
    const resourcetype = elements(res, "resourcetype")[0] ?? "";
    const components = elements(res, "supported-calendar-component-set")[0];
    if (/<(?:[\w-]+:)?calendar[\s/>]/.test(resourcetype) && (!components || /name=["']VEVENT["']/i.test(components))) {
      calendars.push(new URL(xmlText(href).trim(), url).href);
    }
    const link = elements(res, "calendar-home-set")[0] ?? elements(res, "current-user-principal")[0];
    const linkHref = link && elements(link, "href")[0];
    if (linkHref && !next) next = new URL(xmlText(linkHref).trim(), url).href;
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
