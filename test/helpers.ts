import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env as baseEnv } from "cloudflare:workers";
import worker from "../src/index";

export const ORIGIN = "https://cal.test";
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface TestEnv extends Env {
  sentEmails: SentEmail[];
  queued: unknown[];
}

/** A copy of the test environment with email and queue bindings that record what they receive. */
export function makeEnv(overrides: Partial<Env> = {}): TestEnv {
  const sentEmails: SentEmail[] = [];
  const queued: unknown[] = [];
  const EMAIL = {
    async send(message: { to: string; subject: string; text: string; html: string }) {
      sentEmails.push({ to: message.to, subject: message.subject, text: message.text, html: message.html });
      return { messageId: `m${sentEmails.length}` };
    },
  } as unknown as SendEmail;
  const REFRESH_QUEUE = {
    async send(body: unknown) {
      queued.push(body);
    },
    async sendBatch(messages: { body: unknown }[]) {
      queued.push(...messages.map((m) => m.body));
    },
  } as unknown as Queue;
  return { ...baseEnv, EMAIL, REFRESH_QUEUE, EMAIL_FROM: "login@cal.test", ...overrides, sentEmails, queued } as TestEnv;
}

export async function resetData(): Promise<void> {
  await baseEnv.DB.batch(["sources", "feeds", "sessions", "login_tokens", "users"].map((t) => baseEnv.DB.prepare(`DELETE FROM ${t}`)));
  for (const key of (await baseEnv.FEEDS.list()).keys) await baseEnv.FEEDS.delete(key.name);
}

interface RequestOptions {
  method?: string;
  form?: Record<string, string>;
  cookie?: string;
  headers?: Record<string, string>;
}

export async function call(env: TestEnv, path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("Cookie", options.cookie);
  let body: string | undefined;
  if (options.form) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    if (!headers.has("Origin")) headers.set("Origin", ORIGIN);
    body = new URLSearchParams(options.form).toString();
  }
  const method = options.method ?? (options.form ? "POST" : "GET");
  const ctx = createExecutionContext();
  const response = await worker.fetch(new IncomingRequest(`${ORIGIN}${path}`, { method, headers, body }), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export async function runCron(env: TestEnv, at: number): Promise<void> {
  const ctx = createExecutionContext();
  await worker.scheduled!(createScheduledController({ scheduledTime: at, cron: "*/5 * * * *" }), env, ctx);
  await waitOnExecutionContext(ctx);
}

export async function runQueue(env: TestEnv, bodies: unknown[]): Promise<{ acked: number; retried: number }> {
  let acked = 0;
  let retried = 0;
  const messages = bodies.map((body, i) => ({
    id: `msg-${i}`,
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: () => acked++,
    retry: () => retried++,
  }));
  const batch = { queue: "calendario-refresh", messages, ackAll: () => (acked += messages.length), retryAll: () => (retried += messages.length) };
  const ctx = createExecutionContext();
  await worker.queue!(batch as unknown as MessageBatch, env, ctx);
  await waitOnExecutionContext(ctx);
  return { acked, retried };
}

/** Extracts the sign-in link from the last email sent to an address. */
export function loginLink(env: TestEnv, email: string): string {
  const message = env.sentEmails.findLast((m) => m.to === email);
  if (!message) throw new Error(`no email sent to ${email}`);
  const match = /https?:\/\/\S+\/login\/verify\?token=[\w-]+/.exec(message.text);
  if (!match) throw new Error("no sign-in link in the email");
  return match[0];
}

/** Runs the whole passwordless sign-in and returns the session cookie. */
export async function signIn(env: TestEnv, email: string, lang = "en"): Promise<string> {
  await call(env, "/login", { form: { email }, headers: { "Accept-Language": lang } });
  const token = new URL(loginLink(env, email)).searchParams.get("token")!;
  const response = await call(env, "/login/verify", { form: { token } });
  const cookie = response.headers.get("Set-Cookie")?.split(";")[0];
  if (!cookie) throw new Error(`sign-in failed with status ${response.status}`);
  return cookie;
}
