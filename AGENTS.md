# caldav-to-ics → Calendario

App web open source (`zupolgec/caldav-to-ics`) su Cloudflare Workers, online su `calendario.condividi.link`: unisce i calendari (link iCal e CalDAV) di ogni utente in due link `.ics`, completo e solo occupato. Accesso senza password via email. Interfaccia in italiano e inglese.

Documentazione di progetto in `docs/`: decisioni del worker originale in `docs/01-decisioni.md`, istanze e deploy in `docs/02-istanza-16bit.md`, app multiutente in `docs/03-app-multiutente.md`.
`docs/` va committata nel repo, ma solo con documenti utili al progetto (il prompt iniziale è stato tolto).

- Test: `npm test` (Vitest nel runtime Workers), `npm run e2e` (Playwright, dati separati in `.wrangler/e2e`, porta 8797), `npm run typecheck`.
- Segreti, URL privati di prova e script di verifica dal vivo in `.secrets/` (gitignored). Mai credenziali o URL privati nel repo.
- Deploy: vedi `docs/02-istanza-16bit.md` (l'account va passato esplicitamente).
