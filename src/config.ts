export type Source =
  | { type: "caldav"; url: string; username: string; password: string }
  | { type: "ics"; url: string; username?: string; password?: string; headers?: Record<string, string> };

export interface Settings {
  refreshMinutes: number;
  pastDays: number;
  calendarName: string;
  busyTitle: string;
  ownerEmails: string[];
}

export class ConfigError extends Error {}

/**
 * The free plan allows 1,000 KV writes a day and every refresh writes once, so refreshing
 * more often than every 2 minutes (720 writes a day) would run out of quota.
 */
const MIN_REFRESH_MINUTES = 2;

export function readSettings(env: Env): Settings {
  return {
    refreshMinutes: Math.max(MIN_REFRESH_MINUTES, positiveInt(env.REFRESH_MINUTES, 5)),
    pastDays: positiveInt(env.PAST_DAYS, 90),
    calendarName: env.CALENDAR_NAME || "Calendar",
    busyTitle: env.BUSY_TITLE || "Busy",
    ownerEmails: (env.OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parses and validates the SOURCES secret. Error messages never include URLs or credentials. */
export function readSources(env: Env): Source[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.SOURCES ?? "");
  } catch {
    throw new ConfigError('SOURCES is not valid JSON. Expected an array like [{"type":"ics","url":"..."}].');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ConfigError("SOURCES must be a non-empty JSON array of sources.");
  }
  return parsed.map((raw, i): Source => {
    const where = `SOURCES[${i}]`;
    if (!raw || typeof raw !== "object") throw new ConfigError(`${where} must be an object.`);
    const s = raw as Record<string, unknown>;
    if (s.type !== "caldav" && s.type !== "ics") throw new ConfigError(`${where}: "type" must be "caldav" or "ics".`);
    if (typeof s.url !== "string" || !URL.canParse(s.url) || !/^https?:/.test(s.url)) {
      throw new ConfigError(`${where}: "url" must be an http(s) URL.`);
    }
    for (const key of ["username", "password"]) {
      if (s.type === "caldav" && typeof s[key] !== "string") {
        throw new ConfigError(`${where}: "${key}" is required for caldav sources.`);
      }
      if (s[key] !== undefined && typeof s[key] !== "string") throw new ConfigError(`${where}: "${key}" must be a string.`);
    }
    if (s.headers !== undefined) {
      const ok =
        s.type === "ics" &&
        typeof s.headers === "object" &&
        s.headers !== null &&
        Object.values(s.headers).every((v) => typeof v === "string");
      if (!ok) throw new ConfigError(`${where}: "headers" must be an object of strings (ics sources only).`);
    }
    return s as unknown as Source;
  });
}
