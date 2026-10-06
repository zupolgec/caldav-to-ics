import { type SourceRow, type SourceSecret, feedKey, getFeed, listSources, sourceKey } from "./db";
import { buildFeeds } from "./engine/feeds";
import { SourceError, fetchSource } from "./engine/sources";
import { decryptJson, sha256Hex } from "./lib/crypto";

const DAY = 86_400_000;

export function refreshInterval(env: Env): number {
  const minutes = Number.parseInt(env.REFRESH_MINUTES ?? "", 10);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60_000;
}

export interface RefreshMessage {
  userId: string;
}

/** Queues a refresh for every feed that is due and has at least one calendar. */
export async function enqueueDueFeeds(env: Env, now: number): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT user_id FROM feeds f
     WHERE next_refresh_at <= ? AND EXISTS (SELECT 1 FROM sources s WHERE s.user_id = f.user_id)
     ORDER BY next_refresh_at LIMIT 1000`,
  )
    .bind(now)
    .all<{ user_id: string }>();
  if (results.length === 0) return 0;
  // Push the next run forward now, so a slow queue doesn't get the same feed twice.
  const next = now + refreshInterval(env);
  await env.DB.batch(results.map((r) => env.DB.prepare("UPDATE feeds SET next_refresh_at = ? WHERE user_id = ?").bind(next, r.user_id)));
  for (let i = 0; i < results.length; i += 100) {
    await env.REFRESH_QUEUE.sendBatch(results.slice(i, i + 100).map((r) => ({ body: { userId: r.user_id } satisfies RefreshMessage })));
  }
  return results.length;
}

interface LoadedSource {
  texts: string[];
  hash: string;
}

/**
 * Reads every calendar of a user and stores fresh feeds. A calendar that fails is replaced
 * by its last good copy, so a temporary outage never empties the feeds.
 */
export async function refreshUser(env: Env, userId: string, now: number, { force = false } = {}): Promise<void> {
  const feed = await getFeed(env.DB, userId);
  const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first<{ email: string }>();
  if (!feed || !user) return;
  const sources = await listSources(env.DB, userId);
  const windowStart = now - feed.past_days * DAY;
  const loaded = await Promise.all(sources.map((source) => loadSource(env, source, windowStart, now)));

  const secrets = await Promise.all(sources.map((s) => decryptJson<SourceSecret>(env.ENCRYPTION_KEY, s.secret)));
  const ownerEmails = ownerAddresses(user.email, feed.extra_emails, sources, secrets);
  const settings = [feed.calendar_name, feed.busy_title, feed.past_days, ownerEmails];
  const day = new Date(now).toISOString().slice(0, 10); // the window moves once a day
  const inputHash = await sha256Hex(JSON.stringify([loaded.map((l) => l.hash), settings, day]));

  const next = now + refreshInterval(env);
  if (!force && inputHash === feed.input_hash && feed.full_etag) {
    await env.DB.prepare("UPDATE feeds SET last_attempt_at = ?1, last_success_at = ?1, next_refresh_at = ?2 WHERE user_id = ?3")
      .bind(now, next, userId)
      .run();
    return;
  }

  const feeds = await buildFeeds(
    loaded.flatMap((l) => l.texts),
    { now, pastDays: feed.past_days, calendarName: feed.calendar_name, busyTitle: feed.busy_title, ownerEmails },
  );
  const fullEtag = `"${(await sha256Hex(feeds.full)).slice(0, 32)}"`;
  const busyEtag = `"${(await sha256Hex(feeds.busy)).slice(0, 32)}"`;
  const writes: Promise<void>[] = [];
  if (fullEtag !== feed.full_etag) writes.push(env.FEEDS.put(feedKey(userId, "full"), feeds.full));
  if (busyEtag !== feed.busy_etag) writes.push(env.FEEDS.put(feedKey(userId, "busy"), feeds.busy));
  await Promise.all(writes);
  const modified = writes.length > 0 || !feed.modified_at ? now : feed.modified_at;

  await env.DB.prepare(
    `UPDATE feeds SET input_hash = ?, full_etag = ?, busy_etag = ?, modified_at = ?, event_count = ?,
       last_attempt_at = ?, last_success_at = ?, next_refresh_at = ? WHERE user_id = ?`,
  )
    .bind(inputHash, fullEtag, busyEtag, modified, feeds.eventCount, now, now, next, userId)
    .run();
}

async function loadSource(env: Env, source: SourceRow, windowStart: number, now: number): Promise<LoadedSource> {
  try {
    const secret = await decryptJson<SourceSecret>(env.ENCRYPTION_KEY, source.secret);
    const texts = await fetchSource({ type: source.kind, url: secret.url, username: secret.username ?? "", password: secret.password ?? "" }, windowStart);
    const hash = await contentHash(texts);
    if (hash !== source.content_hash) await env.FEEDS.put(sourceKey(source.id), JSON.stringify(texts));
    await env.DB.prepare("UPDATE sources SET last_fetched_at = ?, last_error = NULL, content_hash = ?, event_count = ? WHERE id = ?")
      .bind(now, hash, countEvents(texts), source.id)
      .run();
    return { texts, hash };
  } catch (error) {
    const code = error instanceof SourceError ? error.code : "network";
    console.error(`Calendar ${source.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    await env.DB.prepare("UPDATE sources SET last_error = ? WHERE id = ?").bind(code, source.id).run();
    const copy = await env.FEEDS.get<string[]>(sourceKey(source.id), "json");
    return { texts: copy ?? [], hash: source.content_hash ?? "missing" };
  }
}

/**
 * Hash of a calendar's content that only changes when an event does. Google rewrites
 * DTSTAMP and shuffles the events on every download, so both are ignored.
 */
export async function contentHash(texts: string[]): Promise<string> {
  const outside: string[] = [];
  const events: string[] = [];
  let event: string[] | null = null;
  for (const line of texts.join("\n").replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
    if (/^DTSTAMP[:;]/.test(line)) continue;
    if (line === "BEGIN:VEVENT") event = [];
    if (event) event.push(line);
    else outside.push(line);
    if (line === "END:VEVENT" && event) {
      events.push(event.join("\n"));
      event = null;
    }
  }
  return sha256Hex([...outside, ...events.sort()].join("\n"));
}

export function countEvents(texts: string[]): number {
  return texts.reduce((n, text) => n + (text.match(/^BEGIN:VEVENT/gm)?.length ?? 0), 0);
}

/** Addresses that identify the user as an attendee, used to drop declined invitations. */
function ownerAddresses(email: string, extra: string, sources: SourceRow[], secrets: SourceSecret[]): string[] {
  const addresses = new Set([email, ...extra.split(",")].map((a) => a.trim().toLowerCase()).filter(Boolean));
  sources.forEach((source, i) => {
    const { url, username } = secrets[i];
    if (username?.includes("@")) addresses.add(username.toLowerCase());
    if (source.label.includes("@") && !source.label.includes(" ")) addresses.add(source.label.toLowerCase());
    // Google: https://calendar.google.com/calendar/ical/<address>/private-…/basic.ics
    const google = /\/calendar\/ical\/([^/]+)\/(?:private|public)/.exec(url);
    if (google) addresses.add(decodeURIComponent(google[1]).toLowerCase());
  });
  return [...addresses].sort();
}
