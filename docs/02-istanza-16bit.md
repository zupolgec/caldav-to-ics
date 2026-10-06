# Istanza 16bit

- Account Cloudflare: **16bit**. Wrangler vede anche altri account, quindi l'ID va sempre passato con `CLOUDFLARE_ACCOUNT_ID` (è in `.secrets/account.env`).
- URL: `https://caldav-to-ics.16bit.workers.dev`
- KV: `caldav-to-ics-feeds`, creato in automatico al primo deploy.
- Sorgente: CalDAV Forward Email, `https://caldav.forwardemail.net/` (radice dell'account, con discovery), utente `mt@16bit.it`, password generata per l'alias.
- I token e lo script che imposta la password (`set-password.sh`) stanno in `.secrets/`, fuori dal repo.

## Deploy
I valori di questa istanza si passano con `--var`, così `wrangler.jsonc` resta generico:

```sh
set -a; source .secrets/account.env; set +a
npx wrangler deploy --var CALENDAR_NAME:16bit --var OWNER_EMAILS:mt@16bit.it
```
