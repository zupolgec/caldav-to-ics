import { env as baseEnv } from "cloudflare:workers";
import ICAL from "ical.js";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW, SOURCE_A, SOURCE_B, multistatus, splitPerResource } from "./engine/fixtures";
import { type TestEnv, call, loginLink, makeEnv, resetData, runCron, runQueue, signIn } from "./helpers";
import { network } from "./network";

const WORK_URL = "https://calendar.example.com/ical/work/private-0123456789abcdef0123/basic.ics";
const HOME_URL = "https://ics.example.org/home.ics";
const CALDAV_URL = "https://dav.example.net/dav/me/calendar/";
const WORK_ICS = SOURCE_A.replace("PRODID:-//Source A//EN", "PRODID:-//Source A//EN\r\nX-WR-CALNAME:Work");

let env: TestEnv;
let hits: Record<string, number>;

function serveCalendars({ homeStatus = 200 } = {}) {
  network.use(
    http.get(WORK_URL, () => {
      hits[WORK_URL] = (hits[WORK_URL] ?? 0) + 1;
      return HttpResponse.text(WORK_ICS, { headers: { "Content-Type": "text/calendar" } });
    }),
    http.get(HOME_URL, () => {
      hits[HOME_URL] = (hits[HOME_URL] ?? 0) + 1;
      return homeStatus === 200 ? HttpResponse.text(SOURCE_B) : new HttpResponse("nope", { status: homeStatus });
    }),
    http.get("https://example.com/page.html", () => HttpResponse.html("<html>not a calendar</html>")),
    http.all(CALDAV_URL, async ({ request }) => {
      if (request.headers.get("Authorization") !== `Basic ${btoa("me@example.net:app-pass")}`) return new HttpResponse(null, { status: 401 });
      if (request.method === "GET") return new HttpResponse("<html>dav</html>", { headers: { "Content-Type": "text/html" } });
      if (request.method !== "REPORT") return new HttpResponse(null, { status: 405 });
      return new HttpResponse(multistatus(...splitPerResource(SOURCE_A)), { status: 207, headers: { "Content-Type": "application/xml" } });
    }),
  );
}

async function html(response: Response) {
  return response.text();
}

async function feedUrls(cookie: string) {
  const page = await html(await call(env, "/dashboard", { cookie }));
  const urls = [...page.matchAll(/https:\/\/cal\.test\/c\/([A-Za-z0-9]+)\.ics/g)].map((m) => m[0]);
  return { full: urls[0], busy: urls[1] };
}

async function getFeed(url: string, headers?: Record<string, string>) {
  return call(env, new URL(url).pathname, { headers });
}

function vevents(ics: string) {
  return new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents("vevent");
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await resetData();
  env = makeEnv();
  hits = {};
});

afterEach(() => vi.useRealTimers());

describe("landing page and language", () => {
  it("speaks Italian to Italian browsers and English to everyone else", async () => {
    const it = await html(await call(env, "/", { headers: { "Accept-Language": "it-IT,it;q=0.9,en;q=0.8" } }));
    expect(it).toContain('<html lang="it"');
    expect(it).toContain("Tutti i tuoi calendari");
    const en = await html(await call(env, "/", { headers: { "Accept-Language": "en-US,en;q=0.9" } }));
    expect(en).toContain('<html lang="en"');
    expect(en).toContain("All your calendars");
  });

  it("remembers the language picked with the switcher", async () => {
    const response = await call(env, "/lang/en?next=/", { headers: { "Accept-Language": "it" } });
    expect(response.status).toBe(303);
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
    const page = await html(await call(env, "/", { cookie, headers: { "Accept-Language": "it" } }));
    expect(page).toContain('<html lang="en"');
  });

  it("does not redirect the language switcher to other sites", async () => {
    const response = await call(env, "/lang/en?next=https://evil.example/");
    expect(response.headers.get("Location")).toBe("/");
  });
});

describe("passwordless sign-in", () => {
  it("emails a one-time link that signs the user in and creates the account", async () => {
    const sent = await call(env, "/login", { form: { email: "  Me@Example.com " }, headers: { "Accept-Language": "it" } });
    expect(sent.status).toBe(303);
    expect(sent.headers.get("Location")).toMatch(/^\/login\/sent/);
    expect(env.sentEmails).toHaveLength(1);
    expect(env.sentEmails[0].to).toBe("me@example.com");
    expect(env.sentEmails[0].subject).toMatch(/accesso/i);

    // Opening the link only shows a confirmation, so mail scanners can't use it up.
    const link = loginLink(env, "me@example.com");
    const confirm = await call(env, new URL(link).pathname + new URL(link).search);
    expect(confirm.status).toBe(200);
    expect(await confirm.text()).toContain("me@example.com");

    const token = new URL(link).searchParams.get("token")!;
    const verified = await call(env, "/login/verify", { form: { token } });
    expect(verified.status).toBe(303);
    expect(verified.headers.get("Location")).toBe("/dashboard");
    const setCookie = verified.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/^__Host-session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const dashboard = await call(env, "/dashboard", { cookie: setCookie.split(";")[0] });
    expect(dashboard.status).toBe(200);
    expect(await dashboard.text()).toContain("me@example.com");

    const user = await baseEnv.DB.prepare("SELECT locale FROM users WHERE email = ?").bind("me@example.com").first();
    expect(user?.locale).toBe("it");
  });

  it("accepts each link only once and only for 20 minutes", async () => {
    await call(env, "/login", { form: { email: "me@example.com" } });
    const token = new URL(loginLink(env, "me@example.com")).searchParams.get("token")!;
    expect((await call(env, "/login/verify", { form: { token } })).status).toBe(303);
    const reused = await call(env, "/login/verify", { form: { token } });
    expect(reused.status).toBe(400);
    expect(reused.headers.get("Set-Cookie")).toBeNull();

    await call(env, "/login", { form: { email: "late@example.com" } });
    const late = new URL(loginLink(env, "late@example.com")).searchParams.get("token")!;
    vi.setSystemTime(NOW + 21 * 60_000);
    expect((await call(env, "/login/verify", { form: { token: late } })).status).toBe(400);
  });

  it("rejects invalid addresses and limits how many links one address gets", async () => {
    const invalid = await call(env, "/login", { form: { email: "not-an-email" } });
    expect(invalid.status).toBe(422);
    expect(env.sentEmails).toHaveLength(0);

    for (let i = 0; i < 5; i++) await call(env, "/login", { form: { email: "me@example.com" } });
    const sixth = await call(env, "/login", { form: { email: "me@example.com" } });
    expect(sixth.status).toBe(429);
    expect(env.sentEmails).toHaveLength(5);
  });

  it("keeps private pages behind sign-in and signs out", async () => {
    for (const path of ["/dashboard", "/settings"]) {
      const response = await call(env, path);
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/login");
    }
    const cookie = await signIn(env, "me@example.com");
    const out = await call(env, "/logout", { form: {}, cookie });
    expect(out.status).toBe(303);
    expect(out.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
    expect((await call(env, "/dashboard", { cookie })).status).toBe(303);
  });

  it("refuses form posts coming from other sites", async () => {
    const response = await call(env, "/login", { form: { email: "me@example.com" }, headers: { Origin: "https://evil.example" } });
    expect(response.status).toBe(403);
    expect(env.sentEmails).toHaveLength(0);
  });
});

describe("calendars", () => {
  it("adds calendar links, names them and builds both feeds", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com");
    const empty = await html(await call(env, "/dashboard", { cookie }));
    expect(empty).toContain("Add your first calendar");

    const added = await call(env, "/calendars", { form: { url: WORK_URL }, cookie });
    expect(added.status).toBe(303);
    await call(env, "/calendars", { form: { url: HOME_URL.replace("https://", "webcal://") }, cookie });

    const page = await html(await call(env, "/dashboard", { cookie }));
    expect(page).toContain("Work");
    expect(page).toContain("ics.example.org");
    // The private part of a link is never shown in full.
    expect(page).not.toContain("private-0123456789abcdef0123");

    const { full, busy } = await feedUrls(cookie);
    const fullFeed = await getFeed(full);
    expect(fullFeed.status).toBe(200);
    expect(fullFeed.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    const summaries = vevents(await fullFeed.text()).map((e) => e.getFirstPropertyValue("summary"));
    expect(summaries).toContain("Secret project kickoff");
    expect(summaries).toContain("Dentist");

    const busyText = await (await getFeed(busy)).text();
    expect(busyText).not.toContain("Secret project kickoff");
    expect(busyText).not.toContain("Dentist");
    expect(vevents(busyText).every((e) => e.getFirstPropertyValue("summary") === "Busy")).toBe(true);
  });

  it("stores calendar links and passwords encrypted", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com");
    await call(env, "/calendars", { form: { url: CALDAV_URL, username: "me@example.net", password: "app-pass" }, cookie });
    const row = await baseEnv.DB.prepare("SELECT kind, secret FROM sources").first<{ kind: string; secret: string }>();
    expect(row?.kind).toBe("caldav");
    expect(row?.secret).not.toContain("dav.example.net");
    expect(row?.secret).not.toContain("app-pass");
    const { full } = await feedUrls(cookie);
    expect(await (await getFeed(full)).text()).toContain("Secret project kickoff");
  });

  it("explains why a link can't be added", async () => {
    serveCalendars({ homeStatus: 404 });
    const cookie = await signIn(env, "me@example.com");
    const cases: [Record<string, string>, string][] = [
      [{ url: "not a url" }, "doesn't look like a link"],
      [{ url: "https://example.com/page.html" }, "isn't a calendar"],
      [{ url: HOME_URL }, "couldn't be found"],
      [{ url: CALDAV_URL, username: "me@example.net", password: "wrong" }, "username and password"],
    ];
    for (const [form, message] of cases) {
      const response = await call(env, "/calendars", { form, cookie });
      expect(response.status, form.url).toBe(422);
      expect((await response.text()).replace(/&#39;/g, "'"), form.url).toContain(message);
    }
    const count = await baseEnv.DB.prepare("SELECT COUNT(*) AS n FROM sources").first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("removes a calendar and its events from the feeds", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com");
    await call(env, "/calendars", { form: { url: WORK_URL }, cookie });
    await call(env, "/calendars", { form: { url: HOME_URL }, cookie });
    const id = (await baseEnv.DB.prepare("SELECT id FROM sources WHERE label = 'Work'").first<{ id: string }>())!.id;
    const removed = await call(env, `/calendars/${id}/delete`, { form: {}, cookie });
    expect(removed.status).toBe(303);
    const { full } = await feedUrls(cookie);
    const text = await (await getFeed(full)).text();
    expect(text).not.toContain("Secret project kickoff");
    expect(text).toContain("Dentist");
  });

  it("does not let users touch other users' calendars", async () => {
    serveCalendars();
    const alice = await signIn(env, "alice@example.com");
    await call(env, "/calendars", { form: { url: WORK_URL }, cookie: alice });
    const id = (await baseEnv.DB.prepare("SELECT id FROM sources").first<{ id: string }>())!.id;
    const bob = await signIn(env, "bob@example.com");
    expect((await call(env, `/calendars/${id}/delete`, { form: {}, cookie: bob })).status).toBe(404);
    const count = await baseEnv.DB.prepare("SELECT COUNT(*) AS n FROM sources").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

describe("feed links", () => {
  it("serves an empty but valid calendar before any calendar is added", async () => {
    const cookie = await signIn(env, "me@example.com");
    const { full } = await feedUrls(cookie);
    const response = await getFeed(full);
    expect(response.status).toBe(200);
    expect(vevents(await response.text())).toHaveLength(0);
  });

  it("answers 304 to unchanged feeds and 404 to unknown links", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com");
    await call(env, "/calendars", { form: { url: WORK_URL }, cookie });
    const { full } = await feedUrls(cookie);
    const first = await getFeed(full);
    const etag = first.headers.get("ETag")!;
    expect(first.headers.get("Cache-Control")).toMatch(/max-age=\d+/);
    expect((await getFeed(full, { "If-None-Match": etag })).status).toBe(304);
    for (const path of ["/c/nope.ics", "/c/.ics", `${new URL(full).pathname}x`, "/c/"]) {
      expect((await call(env, path)).status, path).toBe(404);
    }
  });

  it("applies the calendar name, busy title and past days from settings", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com");
    await call(env, "/calendars", { form: { url: HOME_URL }, cookie });
    const saved = await call(env, "/settings", {
      form: { calendar_name: "Mattia, work & life", busy_title: "Occupato", past_days: "730", extra_emails: "" },
      cookie,
    });
    expect(saved.status).toBe(303);
    const { full, busy } = await feedUrls(cookie);
    const fullText = await (await getFeed(full)).text();
    expect(fullText).toContain("X-WR-CALNAME:Mattia\\, work & life"); // TEXT escaping (RFC 5545)
    expect(fullText).toContain("Old event"); // March 2025, inside 730 days
    expect(await (await getFeed(busy)).text()).toContain("SUMMARY:Occupato");
  });

  it("drops invitations the user declined from the busy feed", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com"); // the declined attendee in the fixture
    await call(env, "/calendars", { form: { url: WORK_URL }, cookie });
    const { busy } = await feedUrls(cookie);
    const starts = vevents(await (await getFeed(busy)).text()).map((e) => e.getFirstPropertyValue("dtstart")!.toString());
    expect(starts).not.toContain("2026-10-21T14:00:00Z");
  });

  it("replaces links with new ones", async () => {
    const cookie = await signIn(env, "me@example.com");
    const before = await feedUrls(cookie);
    const rotated = await call(env, "/settings/rotate", { form: { feed: "busy" }, cookie });
    expect(rotated.status).toBe(303);
    const after = await feedUrls(cookie);
    expect(after.full).toBe(before.full);
    expect(after.busy).not.toBe(before.busy);
    expect((await getFeed(before.busy)).status).toBe(404);
    expect((await getFeed(after.busy)).status).toBe(200);
  });
});

describe("background refresh", () => {
  it("queues the feeds that are due and refreshes them", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com");
    await call(env, "/calendars", { form: { url: WORK_URL }, cookie });
    await signIn(env, "nocalendars@example.com");

    await runCron(env, NOW + 60_000);
    expect(env.queued).toHaveLength(0); // refreshed when the calendar was added

    vi.setSystemTime(NOW + 11 * 60_000);
    await runCron(env, NOW + 11 * 60_000);
    expect(env.queued).toHaveLength(1); // users without calendars are skipped
    await runCron(env, NOW + 12 * 60_000);
    expect(env.queued).toHaveLength(1); // not queued twice

    const before = hits[WORK_URL];
    const result = await runQueue(env, env.queued);
    expect(result.acked).toBe(1);
    expect(hits[WORK_URL]).toBe(before + 1);
  });

  it("keeps the last good copy of a calendar that stops answering", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com");
    await call(env, "/calendars", { form: { url: WORK_URL }, cookie });
    await call(env, "/calendars", { form: { url: HOME_URL }, cookie });
    const { full } = await feedUrls(cookie);

    network.resetHandlers();
    serveCalendars({ homeStatus: 500 });
    const userId = (await baseEnv.DB.prepare("SELECT id FROM users").first<{ id: string }>())!.id;
    vi.setSystemTime(NOW + 11 * 60_000);
    await runQueue(env, [{ userId }]);

    expect(await (await getFeed(full)).text()).toContain("Dentist");
    const page = await html(await call(env, "/dashboard", { cookie }));
    expect(page).toContain("Not responding");
  });
});

describe("account", () => {
  it("deletes the account, its calendars and its links", async () => {
    serveCalendars();
    const cookie = await signIn(env, "me@example.com");
    await call(env, "/calendars", { form: { url: WORK_URL }, cookie });
    const { full } = await feedUrls(cookie);
    const wrong = await call(env, "/account/delete", { form: { confirm: "someone@else.com" }, cookie });
    expect(wrong.status).toBe(422);
    const deleted = await call(env, "/account/delete", { form: { confirm: "me@example.com" }, cookie });
    expect(deleted.status).toBe(303);
    expect((await getFeed(full)).status).toBe(404);
    for (const table of ["users", "sources", "feeds", "sessions"]) {
      const row = await baseEnv.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
    expect((await baseEnv.FEEDS.list()).keys).toHaveLength(0);
  });
});
