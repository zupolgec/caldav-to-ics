# Decisioni di progetto

Data: 6 ottobre 2026

## Storage: un'unica chiave KV, non R2
- Piano gratuito KV: 100.000 letture e 1.000 scritture al giorno. R2 avrebbe quote più ampie (1M operazioni di classe A al mese), ma va attivato a mano sull'account, di solito con un metodo di pagamento, e questo complica il deploy con un click.
- Scelto KV, con tutto lo stato (feed completo, feed busy, metadati per `/health`) in **una sola chiave** `state`: ogni aggiornamento costa una scrittura. Con 5 minuti sono 288 scritture al giorno.
- `REFRESH_MINUTES` ha un minimo di 2 (720 scritture al giorno), per non sforare la quota.
- L'aggiornamento al momento, quando non c'è ancora un feed, avviene al massimo una volta al minuto: così una sorgente rotta non può esaurire le scritture.

## Cron
- Le espressioni cron stanno in `wrangler.jsonc` e non si leggono da env. Il cron gira ogni minuto (`* * * * *`) e aggiorna solo quando il minuto epoch è multiplo di `REFRESH_MINUTES`.
- È una decisione senza stato: non serve leggere la data dell'ultimo aggiornamento da KV, che è eventualmente consistente. Se un'esecuzione salta, si aspetta l'intervallo successivo.
- Limite free: 10 ms di CPU per invocazione (l'attesa di rete non conta) e 5 cron per account.
- Misurato dal vivo il 6 ottobre 2026 (2 eventi): refresh a freddo 13 ms di CPU, a caldo 8 ms, circa 1,1 s di attesa di rete; richieste HTTP 0–1 ms. Il costo è quasi tutto fisso. Sul piano free i calendari grandi possono sforare, su Workers Paid (30 s) no.

## Parsing
- Parser iCalendar scritto a mano (`src/ics.ts`, circa 150 righe): conserva ogni proprietà così com'è, così il feed completo riproduce fedelmente la sorgente, ed è leggero in CPU.
- `ical.js` (zero dipendenze, ESM, compatibile con Workers) serve solo a iterare le `RRULE` con `COUNT` o `UNTIL` per capire se un'occorrenza cade nella finestra. Le regole senza fine sono sempre incluse, perché la finestra non ha fine.
- Nella finestra le ore locali sono trattate come UTC: lo scarto di qualche ora sul bordo di 90 giorni è irrilevante e si evita di risolvere i fusi.
- L'XML di CalDAV è letto con regex indipendenti dal prefisso di namespace, perché Workers non ha `DOMParser`.

## CalDAV
- `REPORT calendar-query` con `time-range start=` (senza fine).
- Se il REPORT non restituisce nulla (per esempio sulla radice dell'account), si fa la discovery con `PROPFIND` Depth 1, seguendo `current-user-principal` e `calendar-home-set` fino a 3 passaggi. Si includono solo i calendari che supportano `VEVENT`.

## Unione e feed
- `VTIMEZONE` deduplicati per `TZID` (vince il primo).
- Eventi raggruppati per `UID`, deduplicati per `RECURRENCE-ID` tra sorgenti (vince il primo). Una serie è inclusa se almeno un suo componente (master o eccezione) tocca la finestra.
- Pubblicati solo i `VEVENT`: niente VTODO né VJOURNAL.
- Feed busy: whitelist di proprietà (UID, DTSTAMP, DTSTART, DTEND, DURATION, RRULE, RDATE, EXDATE, RECURRENCE-ID, SEQUENCE) più `SUMMARY` fisso. L'UID è sostituito dallo SHA-256 dell'originale, così le eccezioni restano legate alla serie senza rivelare domini o indirizzi.
- Un'occorrenza esclusa (cancellata, trasparente, rifiutata) di una serie inclusa diventa un `EXDATE` sul master.
- Se una sorgente fallisce, non si aggiorna niente: restano i feed precedenti e l'errore va in `/health`, senza URL.

## Sicurezza
- Token confrontati in tempo costante: SHA-256 di entrambi e `crypto.subtle.timingSafeEqual`. Un token vuoto o assente disattiva il feed.
- Qualsiasi altro percorso o metodo risponde `404 Not found`.
- `Cache-Control: private`, perché l'URL contiene un segreto.

## Test
- `@cloudflare/vitest-pool-workers` è stato rinominato in `@cloudflare/vitest-plugin`, che richiede Vitest 4. Le chiamate esterne sono simulate con `msw` e `@msw/cloudflare`.
- Lo storage è isolato per file di test, non per singolo test: i test svuotano KV in `beforeEach`.

## Deploy con un click
- Il KV in `wrangler.jsonc` non ha `id`: wrangler lo crea al primo deploy (verificato), e il pulsante Deploy to Cloudflare fa lo stesso.
- Le descrizioni di variabili e secret stanno in `package.json` sotto `cloudflare.bindings`. I secret richiesti sono in `.dev.vars.example`.
