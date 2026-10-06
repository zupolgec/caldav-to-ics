# Calendario

Merge all your calendars into one link you can share. Calendario reads your calendars (secret iCal links from Google, iCloud, Outlook, Fastmail… or CalDAV accounts with a username and password) and publishes them as two read-only feeds:

- a **full** calendar with every event and its details;
- a **busy** calendar that only shows when you're busy: times and repeats stay, everything else is removed.

Anyone can subscribe to these links from Google Calendar, Apple Calendar, Outlook, Fantastical and any other calendar app.

The hosted version runs at **[calendario.condividi.link](https://calendario.condividi.link)** in Italian and English. It's free, and this repository has everything you need to run your own copy on Cloudflare.

## Features

- **Sign in without passwords.** Enter your email and you get a one-time link (valid 20 minutes). The first sign-in creates the account.
- **Any calendar with a link**, including `webcal://` links, plus **CalDAV** servers with a username and password. If you paste the account root of a CalDAV server, all of its event calendars are found and added.
- **Checked when added.** The calendar is downloaded right away, named after its own title, and any problem is explained (wrong link, wrong password, not a calendar…).
- **Two links, two levels of detail**, each with copy and one-click subscribe buttons for Apple, Google and Outlook.
- **Week preview** of exactly what each link shows, full or busy, with one colour per calendar and times in your own timezone.
- **Up to date.** Calendars are read again every 10 minutes. If one stops answering, its last good copy is kept, so a temporary outage never empties your links.
- **The last 90 days and everything ahead.** Repeating events are included when any occurrence falls in that range. You can change how many past days to include.
- **Settings**: calendar name, title of busy events, past days, extra addresses for spotting declined invitations, new links (the old ones stop working at once), account deletion.

### What the busy calendar contains

Each event keeps only its start, end or duration, repeat rules and exceptions, and a fixed title (“Busy”/“Occupato”, configurable). Its `UID` is replaced with a hash salted per account, so nothing in it reveals addresses or domains, and two people's busy calendars can't be matched up to find shared meetings. Only the timezones its events use are included. Titles, descriptions, locations, attendees, organizers, alarms, attachments, URLs and categories are removed.

It leaves out events marked as free (`TRANSP:TRANSPARENT`), cancelled events, and invitations you declined. Your sign-in address, the addresses in your Google calendar links and your CalDAV usernames are recognized automatically; you can add more in the settings. A cancelled single occurrence becomes an exception of its series; a busy occurrence of a series that is left out becomes an event of its own.

### Privacy and security

- Calendar links and passwords are encrypted in the database with AES-256-GCM and never shown in full again, not even to you.
- Sign-in links and session cookies are random 256-bit tokens; only their SHA-256 hashes are stored. Sessions last 30 days in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Sign-in links are used with an explicit click, so mail scanners that open links can't use them up. Each address can get 5 links an hour, and each IP 10 requests a minute.
- Forms only accept requests from the site itself (CSRF protection), and pages are served with a strict Content Security Policy.
- Feed links are random 24-character tokens (about 143 bits).
- CalDAV passwords are only ever sent to the server you entered: redirects and discovery links to other hosts are not followed. Downloads stop at 20 MB.

## How it works

```
Browser ──► Worker (Hono, server-rendered JSX) ──► D1: users, sessions, calendars (encrypted), feed settings
                                               └─► KV: ready-made .ics feeds and the last good copy of each calendar
Cron (every 5 min) ──► Queue ──► Worker: refreshes the feeds that are due
Calendar apps ──► /c/<token>.ics ──► served straight from KV, with ETag / 304
```

- **Cloudflare Workers** with [Hono](https://hono.dev) and server-side JSX. The pages work without JavaScript; a small script adds copy buttons, the help dialog and confirmations.
- **D1** stores accounts and settings. **KV** stores the generated feeds, each with its ETag and the hash of the inputs it was built from in the KV metadata, so a body and its ETag always travel together and a slow, older refresh can't leave a stale feed behind.
- A **Cron Trigger** queues the feeds that are due, and a **Queue** consumer refreshes them, so many accounts never pile up in one invocation. The cron also deletes expired sign-in links and sessions. Before rebuilding, each calendar is hashed ignoring `DTSTAMP` and the order of events (Google rewrites the first and shuffles the second on every download): unchanged calendars cost almost no CPU.
- **Email Service** sends the sign-in emails.
- The iCalendar engine (`src/engine`) is a small hand-written parser that keeps every property as-is, plus [ical.js](https://github.com/kewisch/ical.js) to walk repeat rules and to expand occurrences for the preview. Tailwind CSS v4 for styles.

## Run your own

You need a Cloudflare account on the **Workers Paid** plan (Email Sending to any address requires it) and a domain on Cloudflare to send emails from.

1. Enable email sending for your domain: `npx wrangler email sending enable example.com`. It adds SPF, DKIM and DMARC records on a `cf-bounce` subdomain and doesn't touch your MX records.
2. Deploy:

   ```sh
   git clone https://github.com/zupolgec/caldav-to-ics calendario && cd calendario
   npm install
   npm run deploy                 # builds the CSS, creates D1, KV and the queue, applies the migrations
   openssl rand -base64 32 | npx wrangler secret put ENCRYPTION_KEY
   npx wrangler deploy --domain calendar.example.com --var EMAIL_FROM:login@example.com
   ```

   Or use the button, then set `ENCRYPTION_KEY` and `EMAIL_FROM` when asked:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zupolgec/caldav-to-ics)

| Name | Kind | Description |
| --- | --- | --- |
| `ENCRYPTION_KEY` | secret | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts calendar links and passwords. Don't change it afterwards, or saved calendars can't be read anymore. |
| `EMAIL_FROM` | variable | Sender of sign-in emails, on a domain with email sending enabled. |
| `REFRESH_MINUTES` | variable | How often calendars are read again. Default `10`. |

Schema changes go in `migrations/`; `npm run deploy` applies them after deploying, so keep them backward compatible.

## Development

```sh
npm install
cp .dev.vars.example .dev.vars   # then set ENCRYPTION_KEY
npx wrangler d1 migrations apply DB --local
npm run dev                      # emails are not sent locally: they're printed in the terminal
npm test                         # Vitest in the Workers runtime, with D1, KV and mocked calendar servers
npm run e2e                      # Playwright: the whole journey in Chromium, on separate local data
npm run typecheck
```

The E2E tests start `wrangler dev` on port 8797 with its own data in `.wrangler/e2e` and a small server with fixture calendars. `SCREENSHOTS=1 npx playwright test screenshots` saves screenshots of every page, on desktop and mobile, in `test-results/screens`.

The single-account version this project started from (calendars configured with secrets, no web interface) is tagged [`v0.1.0`](https://github.com/zupolgec/caldav-to-ics/tree/v0.1.0).

## License

MIT
