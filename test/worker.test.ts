import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env as baseEnv } from "cloudflare:workers";
import ICAL from "ical.js";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { NOW, SOURCE_A, SOURCE_B, multistatus, splitPerResource } from "./fixtures";
import { network } from "./network";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const CALDAV_URL = "https://caldav.test/dav/me/calendar/";
const ICS_URL = "https://ics.test/secret/basic.ics";
const SOURCES = JSON.stringify([
  { type: "caldav", url: CALDAV_URL, username: "me@example.com", password: "s3cret" },
  { type: "ics", url: ICS_URL, headers: { Authorization: "Bearer abc" } },
]);

type TestEnv = typeof baseEnv;
let env: TestEnv;
type Recorded = { method: string; url: string; headers: Headers; text(): Promise<string> };
let requests: Recorded[];

function serveSources({ icsStatus = 200 } = {}) {
  network.use(
    http.all(CALDAV_URL, async ({ request }) => {
      requests.push(request.clone());
      if (request.method !== "REPORT") return new HttpResponse(null, { status: 405 });
      return new HttpResponse(multistatus(...splitPerResource(SOURCE_A)), {
        status: 207,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    }),
    http.get(ICS_URL, ({ request }) => {
      requests.push(request.clone());
      if (icsStatus !== 200) return new HttpResponse("boom", { status: icsStatus });
      return HttpResponse.text(SOURCE_B, { headers: { "Content-Type": "text/calendar" } });
    }),
  );
}

async function get(path: string, init?: { headers?: Record<string, string> }, e: TestEnv = env) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new IncomingRequest(`https://cal.test${path}`, init), e, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function cron(at: number, e: TestEnv = env) {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ scheduledTime: at, cron: "* * * * *" }), e, ctx);
  await waitOnExecutionContext(ctx);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  env = { ...baseEnv, SOURCES, REFRESH_MINUTES: "5" };
  requests = [];
  for (const key of (await env.FEEDS.list()).keys) await env.FEEDS.delete(key.name);
});

afterEach(() => vi.useRealTimers());

describe("feed URLs", () => {
  it("builds the feed on the first request and serves a valid full calendar", async () => {
    serveSources();
    const response = await get("/c/full-token-test.ics");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("ETag")).toMatch(/^"[0-9a-f]+"$/);
    expect(new Date(response.headers.get("Last-Modified")!).getTime()).toBe(NOW);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    const body = await response.text();
    const vevents = new ICAL.Component(ICAL.parse(body)).getAllSubcomponents("vevent");
    expect(vevents.map((e) => e.getFirstPropertyValue("summary"))).toContain("Secret project kickoff");
    expect(vevents.map((e) => e.getFirstPropertyValue("summary"))).toContain("Dentist");
  });

  it("serves the busy feed on the busy token", async () => {
    serveSources();
    const response = await get("/c/busy-token-test.ics");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("SUMMARY:Busy");
    expect(body).not.toContain("Secret project kickoff");
    expect(body).not.toContain("Dentist");
  });

  it("queries CalDAV with Basic auth and a time range, and ICS with the configured header", async () => {
    serveSources();
    await get("/c/full-token-test.ics");
    const report = requests.find((r) => r.method === "REPORT")!;
    expect(report.headers.get("Authorization")).toBe(`Basic ${btoa("me@example.com:s3cret")}`);
    expect(report.headers.get("Depth")).toBe("1");
    const body = await report.text();
    expect(body).toContain("calendar-query");
    expect(body).toMatch(/<c:time-range start="20260708T120000Z"\s*\/>/);
    const ics = requests.find((r) => r.url === ICS_URL)!;
    expect(ics.headers.get("Authorization")).toBe("Bearer abc");
  });

  it("answers 304 when the ETag matches", async () => {
    serveSources();
    const first = await get("/c/full-token-test.ics");
    const etag = first.headers.get("ETag")!;
    const second = await get("/c/full-token-test.ics", { headers: { "If-None-Match": etag } });
    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");
  });

  it("answers 404 without details for wrong tokens and unknown paths", async () => {
    serveSources();
    await get("/c/full-token-test.ics");
    for (const path of ["/", "/c/", "/c/.ics", "/c/wrong.ics", "/c/full-token-test", "/c/full-token-test.ics/x", "/c/FULL-TOKEN-TEST.ics", "/full-token-test.ics", "/c/busy-token-tes.ics"]) {
      const response = await get(path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).toBe("Not found");
    }
  });

  it("disables a feed whose token is not configured", async () => {
    serveSources();
    const noBusy = { ...env, BUSY_TOKEN: "" };
    expect((await get("/c/busy-token-test.ics", undefined, noBusy)).status).toBe(404);
    expect((await get("/c/.ics", undefined, noBusy)).status).toBe(404);
    expect((await get("/c/full-token-test.ics", undefined, noBusy)).status).toBe(200);
  });
});

describe("background refresh", () => {
  it("only refreshes when REFRESH_MINUTES have elapsed", async () => {
    serveSources();
    const minute = 60_000;
    const base = Date.UTC(2026, 9, 6, 12, 0, 0); // epoch minute divisible by 5
    await cron(base);
    expect(requests).toHaveLength(2);
    for (let i = 1; i < 5; i++) await cron(base + i * minute);
    expect(requests).toHaveLength(2);
    await cron(base + 5 * minute);
    expect(requests).toHaveLength(4);

    env = { ...env, REFRESH_MINUTES: "15" };
    await cron(base + 10 * minute);
    expect(requests).toHaveLength(4);
    await cron(base + 15 * minute);
    expect(requests).toHaveLength(6);
  });

  it("keeps the previous feed when a source fails, and reports the error", async () => {
    serveSources();
    await cron(NOW);
    const before = await (await get("/c/full-token-test.ics")).text();

    network.resetHandlers();
    serveSources({ icsStatus: 500 });
    vi.setSystemTime(NOW + 5 * 60_000);
    await cron(NOW + 5 * 60_000);

    const after = await get("/c/full-token-test.ics");
    expect(after.status).toBe(200);
    expect(await after.text()).toBe(before);

    const health = (await (await get("/health")).json()) as Record<string, unknown>;
    expect(health.ok).toBe(false);
    expect(health.lastAttempt).toBe(new Date(NOW + 5 * 60_000).toISOString());
    expect(health.lastSuccess).toBe(new Date(NOW).toISOString());
    expect(health.events).toBe(8);
    expect(JSON.stringify(health)).not.toContain("ics.test");
  });

  it("keeps the same ETag and Last-Modified when nothing changed", async () => {
    serveSources();
    await cron(NOW);
    const first = await get("/c/busy-token-test.ics");
    vi.setSystemTime(NOW + 5 * 60_000);
    await cron(NOW + 5 * 60_000);
    const second = await get("/c/busy-token-test.ics");
    expect(second.headers.get("ETag")).toBe(first.headers.get("ETag"));
    expect(second.headers.get("Last-Modified")).toBe(first.headers.get("Last-Modified"));
  });

  it("answers 503 when there is no feed yet and the sources fail", async () => {
    serveSources({ icsStatus: 500 });
    const response = await get("/c/full-token-test.ics");
    expect(response.status).toBe(503);
  });
});

describe("/health", () => {
  it("reports the last refresh without event data or source URLs", async () => {
    serveSources();
    await cron(NOW);
    const response = await get("/health");
    expect(response.status).toBe(200);
    const health = await response.json();
    expect(health).toEqual({
      ok: true,
      lastAttempt: new Date(NOW).toISOString(),
      lastSuccess: new Date(NOW).toISOString(),
      events: 8,
    });
  });

  it("reports a clear error when SOURCES is malformed", async () => {
    const broken = { ...env, SOURCES: '[{"type":"caldav","url":"https://x.test/"}]' };
    await cron(NOW, broken);
    const health = (await (await get("/health", undefined, broken)).json()) as { ok: boolean; error: string };
    expect(health.ok).toBe(false);
    expect(health.error).toMatch(/SOURCES\[0\].*username/);
  });

  it("shows the whole error message when SOURCES is not JSON", async () => {
    const broken = { ...env, SOURCES: "not json" };
    await cron(NOW, broken);
    const state = (await env.FEEDS.get("state", "json")) as { error: string };
    expect(state.error).toBe('SOURCES is not valid JSON. Expected an array like [{"type":"ics","url":"..."}].');
  });

  it("never exposes source URLs in errors", async () => {
    network.use(http.get(ICS_URL, () => Response.error()));
    const e = { ...env, SOURCES: JSON.stringify([{ type: "ics", url: ICS_URL }]) };
    await cron(NOW, e);
    const health = (await (await get("/health", undefined, e)).json()) as { error: string };
    expect(health.error).toMatch(/^source 1 \(ics\): /);
    expect(health.error).not.toContain("ics.test");
  });

  it("reports that no refresh has happened yet", async () => {
    const health = await (await get("/health")).json();
    expect(health).toEqual({ ok: false, lastAttempt: null, lastSuccess: null, events: 0 });
  });
});

describe("CalDAV discovery", () => {
  it("finds the calendars when the URL is the account root", async () => {
    const root = "https://dav.test/";
    const propfind = (body: string) => new HttpResponse(body, { status: 207, headers: { "Content-Type": "application/xml" } });
    network.use(
      http.all(root, ({ request }) => {
        if (request.method === "REPORT") return new HttpResponse(null, { status: 405 });
        return propfind(`<?xml version="1.0"?><multistatus xmlns="DAV:"><response><href>/</href><propstat><prop><current-user-principal><href>/principals/me/</href></current-user-principal><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`);
      }),
      http.all("https://dav.test/principals/me/", () =>
        propfind(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:href>/principals/me/</D:href><D:propstat><D:prop><C:calendar-home-set><D:href>https://dav.test/cals/me/</D:href></C:calendar-home-set><D:resourcetype><D:principal/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`),
      ),
      http.all("https://dav.test/cals/me/", () =>
        propfind(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
          <D:response><D:href>/cals/me/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
          <D:response><D:href>/cals/me/work/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
          <D:response><D:href>/cals/me/tasks/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
          <D:response><D:href>/cals/me/inbox/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:schedule-inbox/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
        </D:multistatus>`),
      ),
      http.all("https://dav.test/cals/me/work/", ({ request }) => {
        requests.push(request.clone());
        return new HttpResponse(multistatus(SOURCE_A), { status: 207, headers: { "Content-Type": "application/xml" } });
      }),
      http.all("https://dav.test/cals/me/tasks/", () => {
        throw new Error("the to-do list must not be queried");
      }),
    );
    const e = { ...env, SOURCES: JSON.stringify([{ type: "caldav", url: root, username: "u", password: "p" }]) };
    const response = await get("/c/full-token-test.ics", undefined, e);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Secret project kickoff");
    expect(requests.map((r) => r.method)).toEqual(["REPORT"]);
  });
});
