# caldav-to-ics

Share a calendar that has no public link. caldav-to-ics is a small Cloudflare Worker that reads one or more calendars (CalDAV with a login, or `.ics` URLs), merges them, and publishes them as read-only `.ics` feeds at secret URLs:

- **full feed**: every event with all its details;
- **busy feed**: only when you're busy. Times and recurrences are kept, everything else is removed.

Any calendar app can subscribe to these URLs: Google Calendar, Apple Calendar, Outlook, Fantastical, and others.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zupolgec/caldav-to-ics)

## How it works

- Every few minutes (`REFRESH_MINUTES`, default 5), a Cron Trigger reads your sources and stores both feeds, ready to serve, in Workers KV.
- Calendar apps get the stored feed back right away, with `ETag`/`Last-Modified` so unchanged feeds return `304 Not Modified`.
- If a source fails, the previous feeds stay online and the error shows up in `/health`. A temporary outage never empties your calendar.
- The feeds include the last `PAST_DAYS` days (default 90) and everything in the future. A recurring event is included if any of its occurrences falls in that range.
- Events from all sources are merged into one calendar. Timezones are deduplicated, and `UID`, `RECURRENCE-ID`, `RRULE` and `EXDATE` are kept.

It runs on the Workers free plan.

## Setup

### One-click deploy

Click **Deploy to Cloudflare** above. Cloudflare copies the repository into your GitHub account, creates the KV namespace, and asks for the settings below. You can change them later in the dashboard: **Workers & Pages → caldav-to-ics → Settings → Variables and Secrets**.

### Manual deploy

```sh
git clone https://github.com/zupolgec/caldav-to-ics
cd caldav-to-ics
npm install
npx wrangler deploy                      # creates the KV namespace on first deploy
npx wrangler secret put SOURCES          # paste the JSON described below
openssl rand -hex 32 | npx wrangler secret put FULL_TOKEN
openssl rand -hex 32 | npx wrangler secret put BUSY_TOKEN
```

### Settings

| Name | Kind | Default | Description |
| --- | --- | --- | --- |
| `SOURCES` | secret | | JSON array of calendars to read (see [Sources](#sources)). |
| `FULL_TOKEN` | secret | | Token for the full feed URL. Leave it unset to turn the full feed off. |
| `BUSY_TOKEN` | secret | | Token for the busy feed URL. Leave it unset to turn the busy feed off. |
| `REFRESH_MINUTES` | variable | `5` | How often the sources are read, in minutes. Minimum 2. |
| `PAST_DAYS` | variable | `90` | Days of past events to include. |
| `CALENDAR_NAME` | variable | `Calendar` | Name shown in calendar apps (`X-WR-CALNAME`). |
| `BUSY_TITLE` | variable | `Busy` | Title of every event in the busy feed. |
| `OWNER_EMAILS` | variable | | Your addresses, comma-separated. Invitations you declined are left out of the busy feed. |

Variables set in `wrangler.jsonc` overwrite the ones in the dashboard on every `wrangler deploy`. To keep your own values, edit `wrangler.jsonc` or pass them at deploy time: `npx wrangler deploy --var CALENDAR_NAME:Work`.

### Sources

`SOURCES` is a JSON array, and every entry is one calendar.

**CalDAV** (needs a username and password; sent with Basic auth):

```json
{ "type": "caldav", "url": "https://caldav.example.com/calendars/me/work/", "username": "me@example.com", "password": "app-password" }
```

`url` can point at a single calendar or at the account root. With the account root, every event calendar of the account is found and included.

**ICS** (a public or secret `.ics` URL; `headers`, `username` and `password` are optional):

```json
{ "type": "ics", "url": "https://example.com/calendar.ics", "headers": { "Authorization": "Bearer ..." } }
```

Example with [Forward Email](https://forwardemail.net), which offers CalDAV but no public calendar links. Generate a password for your alias in the Forward Email dashboard (the alias password, not your account password), then:

```json
[
  { "type": "caldav", "url": "https://caldav.forwardemail.net/", "username": "you@yourdomain.com", "password": "generated-password" }
]
```

The setup is checked on every run. If `SOURCES` is malformed, `/health` explains what's wrong (for example `SOURCES[0]: "username" is required for caldav sources.`).

## Your calendar URLs

```
https://caldav-to-ics.<your-subdomain>.workers.dev/c/<FULL_TOKEN>.ics
https://caldav-to-ics.<your-subdomain>.workers.dev/c/<BUSY_TOKEN>.ics
```

Anyone with a URL can read that feed, so share the busy URL freely and keep the full URL private. Any other path, including a wrong token, returns `404`.

`/health` shows only the time and outcome of the last refresh and the number of events. It never shows event data or source URLs:

```json
{ "ok": true, "lastAttempt": "2026-10-06T12:00:00.000Z", "lastSuccess": "2026-10-06T12:00:00.000Z", "events": 42 }
```

### Generating and rotating tokens

Make a token with `openssl rand -hex 32`. To rotate one, set a new value:

```sh
openssl rand -hex 32 | npx wrangler secret put BUSY_TOKEN
```

The old URL stops working at once. Subscribers need the new URL.

## Subscribing

- **Google Calendar** (web): **Other calendars → + → From URL**, then paste the URL. Google decides when to refresh, usually every few hours.
- **Apple Calendar** (macOS): **File → New Calendar Subscription…**, paste the URL, and pick an auto-refresh interval. On iPhone or iPad: **Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar**.
- **Outlook** (web): **Add calendar → Subscribe from web**, then paste the URL.
- **Fantastical**: **Settings → Accounts → + → Subscribed Calendar**, then paste the URL. You can also subscribe in Apple Calendar and Fantastical will show it.

Some apps prefer `webcal://` links. Replace `https://` with `webcal://` in the URL.

## What the busy feed contains

Each event keeps only:

- start, end or duration (`DTSTART`, `DTEND`, `DURATION`);
- recurrence and exceptions (`RRULE`, `RDATE`, `EXDATE`, `RECURRENCE-ID`), plus `DTSTAMP` and `SEQUENCE`;
- a `UID` replaced by a hash of the original, so overrides stay attached to their series;
- the title `BUSY_TITLE`.

Descriptions, locations, attendees, organizers, alarms, attachments, URLs, categories and the original titles are removed.

These events are left out:

- events marked as free (`TRANSP:TRANSPARENT`);
- cancelled events (`STATUS:CANCELLED`). A cancelled single occurrence becomes an exception of its series;
- invitations you declined, if `OWNER_EMAILS` is set.

The full feed contains every event in the date range as the source provides it. Only events (`VEVENT`) are published; to-dos and journal entries are not.

## Free plan limits

- Workers KV allows 1,000 writes a day on the free plan. Each refresh writes once, so a 5-minute interval uses 288 writes a day. This is why `REFRESH_MINUTES` can't go below 2.
- The Cron Trigger runs every minute and does nothing until `REFRESH_MINUTES` have passed. It uses one of the 5 Cron Triggers a free account gets.

## Development

```sh
npm install
cp .dev.vars.example .dev.vars   # then fill it in
npm test                         # Vitest in the Workers runtime; network calls are mocked
npm run dev -- --test-scheduled  # local server; trigger the cron at /cdn-cgi/handler/scheduled
```

## License

MIT
