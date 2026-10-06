import { readSettings, readSources } from "./config";
import { buildFeeds } from "./feeds";
import { fetchSource } from "./sources";

export interface StoredFeed {
  body: string;
  etag: string;
  /** When the content last changed (ms). */
  modified: number;
}

export interface State {
  full?: StoredFeed;
  busy?: StoredFeed;
  events: number;
  lastAttempt: number | null;
  lastSuccess: number | null;
  error?: string;
}

// Everything lives under one key so each refresh costs a single KV write.
const STATE_KEY = "state";

export async function loadState(env: Env): Promise<State | null> {
  return env.FEEDS.get<State>(STATE_KEY, "json");
}

/** True when the cron run at `time` falls on a REFRESH_MINUTES boundary. */
export function isRefreshDue(time: number, refreshMinutes: number): boolean {
  return Math.floor(time / 60_000) % refreshMinutes === 0;
}

/**
 * Reads every source and stores freshly built feeds. If anything fails, the previous feeds
 * are kept as they are and only the error is recorded.
 */
export async function refresh(env: Env, now: number): Promise<State> {
  const previous = (await loadState(env)) ?? { events: 0, lastAttempt: null, lastSuccess: null };
  const state: State = { ...previous, lastAttempt: now, error: undefined };

  try {
    const settings = readSettings(env);
    const sources = readSources(env);
    const windowStart = now - settings.pastDays * 86_400_000;
    const results = await Promise.allSettled(sources.map((source) => fetchSource(source, windowStart)));
    const failures = results.flatMap((result, i) =>
      result.status === "rejected" ? [`source ${i + 1} (${sources[i].type}): ${describe(result.reason)}`] : [],
    );
    if (failures.length > 0) throw new Error(failures.join("; "));

    const texts = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    const feeds = await buildFeeds(texts, { now, ...settings });
    state.full = await stored(feeds.full, previous.full, now);
    state.busy = await stored(feeds.busy, previous.busy, now);
    state.events = feeds.eventCount;
    state.lastSuccess = now;
  } catch (error) {
    state.error = describe(error);
    console.error(`Refresh failed: ${state.error}`);
  }

  await env.FEEDS.put(STATE_KEY, JSON.stringify(state));
  return state;
}

async function stored(body: string, previous: StoredFeed | undefined, now: number): Promise<StoredFeed> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const etag = `"${hex.slice(0, 32)}"`;
  return { body, etag, modified: previous?.etag === etag ? previous.modified : now };
}

/** Error text safe to expose: URLs are removed in case a runtime error message includes one. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "<url>");
}
