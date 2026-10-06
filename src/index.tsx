import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { maskUrl, probeCalendar } from "./calendars";
import { FEED_TOKEN_LENGTH, MAX_SOURCES, type User, createUser, deleteUser, feedKey, findFeedByToken, findUserByEmail, getFeed, listSources, sourceKey } from "./db";
import { SourceError } from "./engine/sources";
import { encryptJson, randomToken, sha256Hex } from "./lib/crypto";
import { sendLoginEmail } from "./lib/email";
import { type Locale, isLocale, negotiateLocale, t } from "./lib/i18n";
import { type RefreshMessage, contentHash, countEvents, enqueueDueFeeds, refreshInterval, refreshUser } from "./refresh";
import { InvalidLinkPage, LoginPage, NotFoundPage, SentPage, VerifyPage } from "./views/auth";
import { DashboardPage } from "./views/dashboard";
import { LandingPage } from "./views/landing";
import type { PageContext } from "./views/layout";
import { type SettingsErrors, SettingsPage, type SettingsValues } from "./views/settings";

type AppEnv = { Bindings: Env; Variables: { now: number; locale: Locale; user: User | null; sessionHash: string | null } };
type Ctx = Context<AppEnv>;

const SESSION_COOKIE = "__Host-session";
const SESSION_DAYS = 30;
const LOGIN_TOKEN_MINUTES = 20;
const LOGIN_LINKS_PER_HOUR = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = new Hono<AppEnv>();

// Calendar feeds: plain text answers, no session, no HTML.
app.on(["GET", "HEAD"], "/c/:file", async (c) => {
  const match = /^([A-Za-z0-9]{16,128})\.ics$/.exec(c.req.param("file"));
  if (!match) return c.text("Not found", 404);
  let feed = await findFeedByToken(c.env.DB, match[1]);
  if (!feed) return c.text("Not found", 404);
  const kind = feed.full_token === match[1] ? "full" : "busy";

  let body: string | null = null;
  if (feed[`${kind}_etag`]) body = await c.env.FEEDS.get(feedKey(feed.user_id, kind));
  if (body === null) {
    // Never built yet: build it now rather than serve nothing.
    await refreshUser(c.env, feed.user_id, Date.now(), { force: true });
    feed = (await getFeed(c.env.DB, feed.user_id))!;
    body = await c.env.FEEDS.get(feedKey(feed.user_id, kind));
    if (body === null) return c.text("Calendar temporarily unavailable", 503, { "Retry-After": "60" });
  }

  const etag = feed[`${kind}_etag`]!;
  const headers = {
    "Content-Type": "text/calendar; charset=utf-8",
    ETag: etag,
    "Last-Modified": new Date(feed.modified_at ?? Date.now()).toUTCString(),
    "Cache-Control": `private, max-age=${Math.round(refreshInterval(c.env) / 2000)}`,
    "X-Robots-Tag": "noindex",
  };
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatch?.split(",").some((tag) => ["*", etag].includes(tag.trim().replace(/^W\//, "")))) {
    return c.body(null, 304, headers);
  }
  return c.req.method === "HEAD" ? c.body(null, 200, headers) : c.body(body, 200, headers);
});

app.get("/healthz", (c) => c.text("ok"));

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"],
    },
    referrerPolicy: "same-origin",
  }),
);
app.use(csrf());

// Session and language for every page.
app.use(async (c, next) => {
  c.set("now", Date.now());
  const sid = getCookie(c, SESSION_COOKIE);
  let user: User | null = null;
  let sessionHash: string | null = null;
  if (sid) {
    sessionHash = await sha256Hex(sid);
    user = await c.env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?")
      .bind(sessionHash, c.get("now"))
      .first<User>();
  }
  c.set("user", user);
  c.set("sessionHash", user ? sessionHash : null);
  const chosen = getCookie(c, "lang");
  c.set("locale", isLocale(chosen) ? chosen : (user?.locale ?? negotiateLocale(c.req.header("Accept-Language"))));
  c.header("Vary", "Cookie, Accept-Language");
  await next();
});

function pageContext(c: Ctx): PageContext {
  const user = c.get("user");
  return { locale: c.get("locale"), path: new URL(c.req.url).pathname, signedIn: !!user, email: user?.email };
}

function requireUser(c: Ctx): User | Response {
  return c.get("user") ?? c.redirect("/login", 303);
}

// --- Public pages ---

app.get("/", (c) => {
  if (c.get("user")) return c.redirect("/dashboard", 303);
  return c.html(<LandingPage ctx={pageContext(c)} now={c.get("now")} />);
});

app.get("/lang/:code", async (c) => {
  const code = c.req.param("code");
  const next = c.req.query("next") ?? "/";
  const target = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  if (isLocale(code)) {
    setCookie(c, "lang", code, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax", secure: true });
    const user = c.get("user");
    if (user) await c.env.DB.prepare("UPDATE users SET locale = ? WHERE id = ?").bind(code, user.id).run();
  }
  return c.redirect(target, 303);
});

// --- Passwordless sign-in ---

app.get("/login", (c) => {
  if (c.get("user")) return c.redirect("/dashboard", 303);
  return c.html(<LoginPage ctx={pageContext(c)} />);
});

app.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const email = String(form.email ?? "").trim().toLowerCase();
  const ctx = pageContext(c);
  const m = t(ctx.locale).auth;
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return c.html(<LoginPage ctx={ctx} email={email} error={m.errors.email} />, 422);
  }

  const ip = c.req.header("CF-Connecting-IP");
  if (ip && c.env.LOGIN_LIMITER && !(await c.env.LOGIN_LIMITER.limit({ key: ip })).success) {
    return c.html(<LoginPage ctx={ctx} email={email} error={m.errors.tooMany} />, 429);
  }
  const now = c.get("now");
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?")
    .bind(email, now - 3_600_000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= LOGIN_LINKS_PER_HOUR) {
    return c.html(<LoginPage ctx={ctx} email={email} error={m.errors.tooMany} />, 429);
  }

  const token = randomToken(43);
  await c.env.DB.prepare("INSERT INTO login_tokens (token_hash, email, locale, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), email, ctx.locale, now, now + LOGIN_TOKEN_MINUTES * 60_000)
    .run();
  const url = new URL(c.req.url);
  try {
    await sendLoginEmail(c.env, email, `${url.origin}/login/verify?token=${token}`, ctx.locale, url.hostname);
  } catch (error) {
    console.error(`Sign-in email failed: ${error instanceof Error ? error.message : String(error)}`);
    return c.html(<LoginPage ctx={ctx} email={email} error={m.errors.send} />, 502);
  }
  return c.redirect(`/login/sent?email=${encodeURIComponent(email)}`, 303);
});

app.get("/login/sent", (c) => c.html(<SentPage ctx={pageContext(c)} email={c.req.query("email") ?? ""} />));

app.get("/login/verify", async (c) => {
  const token = c.req.query("token") ?? "";
  const row = token
    ? await c.env.DB.prepare("SELECT email FROM login_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
        .bind(await sha256Hex(token), c.get("now"))
        .first<{ email: string }>()
    : null;
  if (!row) return c.html(<InvalidLinkPage ctx={pageContext(c)} />, 400);
  return c.html(<VerifyPage ctx={pageContext(c)} email={row.email} token={token} />);
});

app.post("/login/verify", async (c) => {
  const token = String((await c.req.parseBody()).token ?? "");
  const now = c.get("now");
  // Using the link and checking it happen in one statement, so it can't be used twice.
  const row = token
    ? await c.env.DB.prepare(
        "UPDATE login_tokens SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1 RETURNING email, locale",
      )
        .bind(now, await sha256Hex(token))
        .first<{ email: string; locale: string }>()
    : null;
  if (!row) return c.html(<InvalidLinkPage ctx={pageContext(c)} />, 400);

  const user = (await findUserByEmail(c.env.DB, row.email)) ?? (await createUser(c.env.DB, row.email, isLocale(row.locale) ? row.locale : "en", now));
  const sid = randomToken(43);
  await c.env.DB.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(sid), user.id, now, now + SESSION_DAYS * 86_400_000)
    .run();
  setCookie(c, SESSION_COOKIE, sid, { path: "/", httpOnly: true, secure: true, sameSite: "Lax", maxAge: SESSION_DAYS * 86_400 });
  return c.redirect("/dashboard", 303);
});

app.post("/logout", async (c) => {
  const hash = c.get("sessionHash");
  if (hash) await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(hash).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  return c.redirect("/", 303);
});

// --- Calendars ---

async function renderDashboard(c: Ctx, user: User, extra: { flash?: string; form?: { url?: string; username?: string; error?: string } } = {}, status: 200 | 422 = 200) {
  const [feed, sources] = await Promise.all([getFeed(c.env.DB, user.id), listSources(c.env.DB, user.id)]);
  return c.html(
    <DashboardPage ctx={pageContext(c)} feed={feed!} sources={sources} origin={new URL(c.req.url).origin} now={c.get("now")} {...extra} />,
    status,
  );
}

app.get("/dashboard", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const m = t(c.get("locale")).dashboard;
  let flash: string | undefined;
  const added = c.req.query("added");
  if (added) {
    const source = await c.env.DB.prepare("SELECT label FROM sources WHERE id = ? AND user_id = ?").bind(added, user.id).first<{ label: string }>();
    if (source) flash = m.added(source.label);
  }
  if (c.req.query("done") === "removed") flash = m.removed;
  return renderDashboard(c, user, { flash });
});

app.post("/calendars", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const form = await c.req.parseBody();
  const input = { url: String(form.url ?? ""), username: String(form.username ?? ""), password: String(form.password ?? "") };
  const m = t(c.get("locale")).dashboard;
  const now = c.get("now");
  const existing = await listSources(c.env.DB, user.id);
  if (existing.length >= MAX_SOURCES) {
    return renderDashboard(c, user, { form: { ...input, error: m.limit(MAX_SOURCES) } }, 422);
  }

  const feed = (await getFeed(c.env.DB, user.id))!;
  let probed;
  try {
    probed = await probeCalendar(input, now - feed.past_days * 86_400_000);
  } catch (error) {
    const code = error instanceof SourceError ? error.code : "network";
    return renderDashboard(c, user, { form: { url: input.url, username: input.username, error: m.sourceErrors[code] } }, 422);
  }

  const id = crypto.randomUUID();
  const secret = await encryptJson(c.env.ENCRYPTION_KEY, {
    url: probed.url,
    ...(input.username.trim() ? { username: input.username.trim(), password: input.password } : {}),
  });
  const color = existing.reduce((max, s) => Math.max(max, s.color + 1), 0) % 6;
  const hash = await contentHash(probed.texts);
  await c.env.FEEDS.put(sourceKey(id), JSON.stringify(probed.texts));
  await c.env.DB.prepare(
    `INSERT INTO sources (id, user_id, kind, label, url_hint, secret, color, created_at, last_fetched_at, content_hash, event_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, probed.kind, probed.label, maskUrl(probed.url), secret, color, now, now, hash, countEvents(probed.texts))
    .run();
  c.executionCtx.waitUntil(refreshUser(c.env, user.id, now, { force: true }));
  return c.redirect(`/dashboard?added=${id}`, 303);
});

app.post("/calendars/:id/delete", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("DELETE FROM sources WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  if (!result.meta.changes) return c.html(<NotFoundPage ctx={pageContext(c)} />, 404);
  await c.env.FEEDS.delete(sourceKey(id));
  c.executionCtx.waitUntil(refreshUser(c.env, user.id, c.get("now"), { force: true }));
  return c.redirect("/dashboard?done=removed", 303);
});

// --- Settings ---

app.get("/settings", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const m = t(c.get("locale")).settings;
  const done = c.req.query("done");
  const flash = done === "saved" ? m.saved : done === "rotated" ? m.rotated : undefined;
  const feed = (await getFeed(c.env.DB, user.id))!;
  return c.html(<SettingsPage ctx={pageContext(c)} email={user.email} feed={feed} flash={flash} />);
});

app.post("/settings", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const form = await c.req.parseBody();
  const values: SettingsValues = {
    calendar_name: String(form.calendar_name ?? "").trim(),
    busy_title: String(form.busy_title ?? "").trim(),
    past_days: String(form.past_days ?? "").trim(),
    extra_emails: String(form.extra_emails ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .join(", "),
  };
  const errors: SettingsErrors = {};
  if (!values.calendar_name || values.calendar_name.length > 80) errors.calendar_name = true;
  if (!values.busy_title || values.busy_title.length > 40) errors.busy_title = true;
  const pastDays = Number(values.past_days);
  if (!/^\d+$/.test(values.past_days) || pastDays > 3650) errors.past_days = true;
  if (values.extra_emails && !values.extra_emails.split(", ").every((e) => EMAIL_PATTERN.test(e))) errors.extra_emails = true;
  if (Object.keys(errors).length > 0) {
    const feed = (await getFeed(c.env.DB, user.id))!;
    return c.html(<SettingsPage ctx={pageContext(c)} email={user.email} feed={feed} values={values} errors={errors} />, 422);
  }
  await c.env.DB.prepare("UPDATE feeds SET calendar_name = ?, busy_title = ?, past_days = ?, extra_emails = ? WHERE user_id = ?")
    .bind(values.calendar_name, values.busy_title, pastDays, values.extra_emails, user.id)
    .run();
  c.executionCtx.waitUntil(refreshUser(c.env, user.id, c.get("now"), { force: true }));
  return c.redirect("/settings?done=saved", 303);
});

app.post("/settings/rotate", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const kind = String((await c.req.parseBody()).feed ?? "");
  if (kind !== "full" && kind !== "busy") return c.html(<NotFoundPage ctx={pageContext(c)} />, 404);
  await c.env.DB.prepare(`UPDATE feeds SET ${kind}_token = ? WHERE user_id = ?`).bind(randomToken(FEED_TOKEN_LENGTH), user.id).run();
  return c.redirect("/settings?done=rotated", 303);
});

app.post("/account/delete", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const confirm = String((await c.req.parseBody()).confirm ?? "").trim().toLowerCase();
  if (confirm !== user.email) {
    const feed = (await getFeed(c.env.DB, user.id))!;
    const m = t(c.get("locale")).settings;
    return c.html(<SettingsPage ctx={pageContext(c)} email={user.email} feed={feed} deleteError={m.deleteMismatch} />, 422);
  }
  await deleteUser(c.env, user.id);
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  return c.redirect("/", 303);
});

// Local E2E runs only: lets the browser tests read the sign-in email.
app.get("/__dev/outbox", async (c) => {
  if (c.env.DEV_OUTBOX !== "1") return c.html(<NotFoundPage ctx={pageContext(c)} />, 404);
  const text = await c.env.FEEDS.get(`outbox:${c.req.query("to") ?? ""}`);
  return text ? c.text(text) : c.text("No email", 404);
});

app.notFound((c) => c.html(<NotFoundPage ctx={pageContext(c)} />, 404));

export default {
  fetch: app.fetch,

  async scheduled(controller, env, _ctx): Promise<void> {
    await enqueueDueFeeds(env, controller.scheduledTime);
  },

  async queue(batch, env, _ctx): Promise<void> {
    for (const message of batch.messages) {
      try {
        await refreshUser(env, (message.body as RefreshMessage).userId, Date.now());
        message.ack();
      } catch (error) {
        console.error(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env>;
