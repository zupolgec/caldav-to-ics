import { ConfigError, readSettings, readSources } from "./config";
import { type State, type StoredFeed, isRefreshDue, loadState, refresh } from "./refresh";

const FEED_PATH = /^\/c\/([^/]+)\.ics$/;

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return notFound();
    if (pathname === "/health") return health(env);

    const token = FEED_PATH.exec(pathname)?.[1];
    if (!token) return notFound();
    const [isFull, isBusy] = await Promise.all([tokenMatches(token, env.FULL_TOKEN), tokenMatches(token, env.BUSY_TOKEN)]);
    if (!isFull && !isBusy) return notFound();

    let state = await loadState(env);
    // No feed yet: build it now instead of waiting for the cron, but at most once a minute
    // so a broken source can't burn through the KV write quota.
    if (!state?.full && Date.now() - (state?.lastAttempt ?? 0) >= 60_000) state = await refresh(env, Date.now());
    const feed = isFull ? state?.full : state?.busy;
    if (!feed) return new Response("Calendar temporarily unavailable", { status: 503, headers: { "Retry-After": "60" } });
    return serveFeed(request, feed, readSettings(env).refreshMinutes);
  },

  async scheduled(controller, env, _ctx): Promise<void> {
    if (isRefreshDue(controller.scheduledTime, readSettings(env).refreshMinutes)) {
      await refresh(env, controller.scheduledTime);
    }
  },
} satisfies ExportedHandler<Env>;

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

/** Constant-time comparison; an unset or empty token never matches, which disables its feed. */
async function tokenMatches(candidate: string, secret: string | undefined): Promise<boolean> {
  const digest = (text: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const [a, b] = await Promise.all([digest(candidate), digest(secret ?? "")]);
  return crypto.subtle.timingSafeEqual(a, b) && !!secret;
}

function serveFeed(request: Request, feed: StoredFeed, refreshMinutes: number): Response {
  const headers = new Headers({
    "Content-Type": "text/calendar; charset=utf-8",
    ETag: feed.etag,
    "Last-Modified": new Date(feed.modified).toUTCString(),
    "Cache-Control": `private, max-age=${refreshMinutes * 60}`,
  });
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch?.split(",").some((tag) => ["*", feed.etag].includes(tag.trim().replace(/^W\//, "")))) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === "HEAD" ? null : feed.body, { headers });
}

async function health(env: Env): Promise<Response> {
  const state: State | null = await loadState(env);
  let error = state?.error;
  try {
    readSources(env);
  } catch (e) {
    if (e instanceof ConfigError) error = e.message;
  }
  const body = {
    ok: !!state?.lastSuccess && !error,
    lastAttempt: state?.lastAttempt ? new Date(state.lastAttempt).toISOString() : null,
    lastSuccess: state?.lastSuccess ? new Date(state.lastSuccess).toISOString() : null,
    events: state?.events ?? 0,
    ...(error ? { error } : {}),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
