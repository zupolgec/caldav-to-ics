# Istanze sull'account 16bit

- Account Cloudflare: **16bit**. Wrangler vede anche altri account, quindi l'ID va sempre passato con `CLOUDFLARE_ACCOUNT_ID` (è in `.secrets/account.env`).
- Piano: **Workers Paid** (verificato il 6 ottobre 2026 via API `/accounts/{id}/subscriptions`; `cf` CLI non accetta la Global API Key, si usa curl con `CLOUDFLARE_EMAIL` e `CLOUDFLARE_API_KEY`). Cron e queue con 30 s di CPU; KV con 1M scritture al mese incluse; Email Sending con 3000 email al mese.

## Calendario (app multiutente)
- URL: `https://calendario.condividi.link` (custom domain del worker `calendario`, anche su `calendario.16bit.workers.dev`).
- Risorse create dal primo deploy: D1 `calendario`, KV `calendario-feeds`, Queue `calendario-refresh`.
- Email Sending abilitato su `condividi.link` (DKIM `cf-bounce`), mittente `accesso@condividi.link`.
- `ENCRYPTION_KEY` in `.secrets/calendario.env`: non va mai cambiata, altrimenti i calendari salvati non si leggono più.
- Account di Mattia: `mt@16bit.it`, con i tre calendari Google usati su Calendearing. I link sono in `.secrets/calendario-links.env`.

Deploy:

```sh
set -a; source .secrets/account.env; set +a
npm run build:css
npx wrangler deploy --domain calendario.condividi.link --var EMAIL_FROM:accesso@condividi.link
npx wrangler d1 migrations apply DB --remote
```

## caldav-to-ics (worker originale, utente singolo)
- URL: `https://caldav-to-ics.16bit.workers.dev`, codice nel tag `v0.1.0`. Pubblica il calendario 16bit di Forward Email (`mt@16bit.it`).
- I link consegnati il 6 ottobre continuano a funzionare. Quando non servono più, si può eliminare il worker (`npx wrangler delete caldav-to-ics`) e il suo KV `caldav-to-ics-feeds`.
- Token e password in `.secrets/16bit.env`, `.secrets/old-instance.dev.vars` e `.secrets/set-password.sh`.
