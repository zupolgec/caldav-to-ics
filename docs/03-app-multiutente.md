# App multiutente (calendario.condividi.link)

Data: 7 ottobre 2026. Obiettivo: trasformare il worker in un'app simile a calendearing.com, in italiano e inglese, su `calendario.condividi.link`.

## Scelte
- **Stack**: Cloudflare Worker con Hono e JSX lato server, Tailwind v4 (build con `@tailwindcss/cli` verso `public/app.css`, servito come asset statico), un piccolo `public/app.js` di miglioramento progressivo. Le pagine funzionano senza JavaScript.
- **Dati**: D1 per utenti, sessioni, token di accesso, calendari e impostazioni; KV per i feed `.ics` già pronti (`feed:<user>:full|busy`) e per l'ultima copia buona di ogni calendario (`src:<id>`). I feed in KV si scrivono solo quando cambiano.
- **Aggiornamento**: cron ogni 5 minuti che mette in coda i feed scaduti (`next_refresh_at`), consumer della Queue che li aggiorna. Intervallo 10 minuti (Calendearing: 1 ora). Prima di ricostruire si confronta un hash degli input (calendari senza `DTSTAMP`, impostazioni, giorno): Google riscrive `DTSTAMP` a ogni download, quindi senza questo accorgimento ogni giro ricostruirebbe tutto.
- **Accesso**: link via email senza password (come registrazione, accesso e recupero in un solo flusso). Il link apre una pagina di conferma con un pulsante, così gli scanner delle email non lo consumano. Token e sessioni sono salvati solo come hash. Limiti: 5 link l'ora per indirizzo, 10 richieste al minuto per IP (binding Rate Limiting).
- **Email**: Cloudflare Email Service (beta, richiede Workers Paid, 3000 email al mese incluse). Dominio `condividi.link` abilitato con `wrangler email sending enable`: record SPF, DKIM e DMARC su `cf-bounce.condividi.link`, nessun MX toccato. Mittente `accesso@condividi.link`.
- **Cifratura**: URL e password dei calendari cifrati con AES-256-GCM (`ENCRYPTION_KEY`, secret). In pagina si mostra solo `url_hint`, con le parti segrete accorciate.
- **Calendari**: si accettano `https`, `http` e `webcal`. Con utente e password, se il link non è un `.ics` si prova CalDAV, con la discovery dalla radice dell'account. Nome preso da `X-WR-CALNAME`. Massimo 20 calendari per account, niente duplicati.
- **Indirizzi del proprietario** per escludere gli inviti rifiutati: email dell'account, indirizzi nei link Google (`/calendar/ical/<email>/private-…`), utenti CalDAV, nomi di calendario che sono indirizzi, più quelli aggiunti nelle impostazioni.
- **Design**: inchiostro indaco su carta (`#1b1f3b` su `#fbfbf8`), carattere Schibsted Grotesk servito dal sito, numeri grandi da calendario da muro (riferimento ai calendari di Vignelli), un colore per ogni calendario unito, tratteggio diagonale per il tempo occupato. La demo in home usa la settimana corrente.
- **Lingua**: cookie `lang` scelto con il selettore, poi lingua salvata nell'account, poi `Accept-Language`; ripiego inglese. Le email partono nella lingua in cui è stato chiesto il link.
- **Versione precedente**: il worker a utente singolo è nel tag `v0.1.0` ed è ancora online come worker `caldav-to-ics` (vedi `02-istanza-16bit.md`).

## Dopo il primo rilascio (7 ottobre 2026)
- **Anteprima** (richiesta di Mattia): pagina `/preview` con la settimana del calendario, completo o occupato. Legge proprio i feed pubblicati (quello che vede chi si abbona), espande ricorrenze ed eccezioni con ical.js e mostra gli orari nel fuso del browser (cookie `tz` impostato da `app.js`; finché manca, Europe/Rome per l'italiano e UTC per l'inglese, poi la pagina si ricarica). Nella vista completa ogni evento ha il colore del calendario da cui viene (mappa UID → calendario dalle copie in KV).
- **Pagina più alta della finestra** (segnalato da Mattia: "scrolla come se fosse 101%"): la dashboard usava un'altezza fissa calcolata a mano, più alta dello spazio reale tra intestazione e piè di pagina; su telefono l'intestazione sforava in orizzontale. Ora `Layout` ha l'opzione `fill` e l'intestazione va a capo; un test Playwright misura lo scroll su tre dimensioni di schermo.
- **Google cambia ordine agli eventi a ogni download**, oltre a `DTSTAMP`: l'hash del contenuto ora li ordina, altrimenti ogni giro ricostruiva tutto (464 ms di CPU invece di pochi).
- **Revisione del codice** (agente separato), corretti: feed vecchio servito dopo due aggiornamenti concorrenti (ora ETag e hash degli input stanno nei metadati KV insieme al corpo), redirect aperto su `/lang`, lettura dei calendari limitata durante il download, credenziali CalDAV solo verso lo stesso server, occorrenze senza serie nel feed occupato, UID con sale per utente, fusi orari solo usati, `\r` nei titoli, pulizia di link e sessioni scaduti, messaggi d'errore per campo e annuncio della copia per i lettori di schermo.
- Non corretti, accettati: `GET /lang` aggiorna la lingua dell'account (innocuo); `/login/sent` ripete l'indirizzo passato (solo testo, escapato); nessun Turnstile sul form di accesso (limiti per indirizzo e IP bastano per ora).

## Confronto con Calendearing (6 ottobre 2026, stessi tre calendari Google)
- Calendearing restituisce **100 eventi** per feed: sembra un limite fisso. Include anche due serie finite nel 2020 e nel 2024.
- Calendario restituisce **130 serie** (179 VEVENT con le eccezioni) dagli ultimi 90 giorni in poi: tutti gli 84 eventi di Calendearing che cadono nella finestra, più 46 che Calendearing taglia.
- Il feed occupato di Calendearing copia gli UID originali (100 su 100); il nostro li sostituisce con un hash (0 su 129).
- Calendearing aggiorna ogni ora e chiede $30 l'anno; accesso con email e password.
- Ricostruire i tre calendari (circa 4 MB) costa circa 115 ms di CPU; senza modifiche quasi zero.

## Test
- `npm test`: 50 test Vitest nel runtime Workers (motore iCalendar, accesso, calendari, feed, impostazioni, refresh, sicurezza), con D1 e KV locali e server di calendario simulati con msw.
- `npm run e2e`: Playwright in Chromium sul percorso completo (home in due lingue, registrazione via link, aiuto, aggiunta di due calendari, errore, copia, feed, anteprima completa e occupata, impostazioni, rimozione, uscita) e controllo dello scroll su tre dimensioni di schermo. Gira su `wrangler dev` porta 8797 con dati in `.wrangler/e2e`; la porta 8787 sulla macchina di Mattia è occupata da un altro processo.
- Verifica dal vivo: accesso reale come `mt@16bit.it` leggendo l'email via IMAP di Forward Email, aggiunta dei tre calendari Google, confronto con Calendearing, account di prova `mt+caldav@16bit.it` con CalDAV Forward Email poi eliminato. Gli script sono in `.secrets/` (fuori dal repo).
