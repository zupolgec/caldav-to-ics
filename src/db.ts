import { type Locale, t } from "./lib/i18n";
import { randomToken } from "./lib/crypto";

export interface User {
  id: string;
  email: string;
  locale: Locale;
  created_at: number;
}

export interface Feed {
  user_id: string;
  full_token: string;
  busy_token: string;
  calendar_name: string;
  busy_title: string;
  past_days: number;
  extra_emails: string;
  input_hash: string | null;
  full_etag: string | null;
  busy_etag: string | null;
  modified_at: number | null;
  event_count: number;
  last_attempt_at: number | null;
  last_success_at: number | null;
  next_refresh_at: number;
}

export interface SourceRow {
  id: string;
  user_id: string;
  kind: "ics" | "caldav";
  label: string;
  url_hint: string;
  secret: string;
  color: number;
  created_at: number;
  last_fetched_at: number | null;
  last_error: string | null;
  content_hash: string | null;
  event_count: number | null;
}

/** What `sources.secret` decrypts to. */
export interface SourceSecret {
  url: string;
  username?: string;
  password?: string;
}

export const MAX_SOURCES = 20;
export const FEED_TOKEN_LENGTH = 24;

export function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>();
}

/** Creates a user with an empty feed and fresh secret links. */
export async function createUser(db: D1Database, email: string, locale: Locale, now: number): Promise<User> {
  const user: User = { id: crypto.randomUUID(), email, locale, created_at: now };
  const defaults = t(locale).defaults;
  await db.batch([
    db.prepare("INSERT INTO users (id, email, locale, created_at) VALUES (?, ?, ?, ?)").bind(user.id, email, locale, now),
    db
      .prepare("INSERT INTO feeds (user_id, full_token, busy_token, calendar_name, busy_title) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, randomToken(FEED_TOKEN_LENGTH), randomToken(FEED_TOKEN_LENGTH), defaults.calendarName, defaults.busyTitle),
  ]);
  return user;
}

export function getFeed(db: D1Database, userId: string): Promise<Feed | null> {
  return db.prepare("SELECT * FROM feeds WHERE user_id = ?").bind(userId).first<Feed>();
}

export function findFeedByToken(db: D1Database, token: string): Promise<Feed | null> {
  return db.prepare("SELECT * FROM feeds WHERE full_token = ?1 OR busy_token = ?1").bind(token).first<Feed>();
}

export async function listSources(db: D1Database, userId: string): Promise<SourceRow[]> {
  const { results } = await db.prepare("SELECT * FROM sources WHERE user_id = ? ORDER BY created_at, id").bind(userId).all<SourceRow>();
  return results;
}

/** Deletes a user and everything attached, including the stored feeds and calendar copies. */
export async function deleteUser(env: Env, userId: string): Promise<void> {
  const sources = await listSources(env.DB, userId);
  await env.DB.batch(
    ["sources", "feeds", "sessions"]
      .map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId))
      .concat(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId)),
  );
  await Promise.all([
    env.FEEDS.delete(feedKey(userId, "full")),
    env.FEEDS.delete(feedKey(userId, "busy")),
    ...sources.map((s) => env.FEEDS.delete(sourceKey(s.id))),
  ]);
}

export const feedKey = (userId: string, kind: "full" | "busy") => `feed:${userId}:${kind}`;
export const sourceKey = (sourceId: string) => `src:${sourceId}`;
