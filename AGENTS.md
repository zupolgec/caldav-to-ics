# caldav-to-ics

Cloudflare Worker open source (`zupolgec/caldav-to-ics`) che ripubblica calendari CalDAV/ICS come feed `.ics` in sola lettura, completo o solo occupato, a URL con token segreti.

Documentazione di progetto in `docs/` (decisioni in `docs/01-decisioni.md`, istanza 16bit in `docs/02-istanza-16bit.md`).
`docs/` va committata nel repo, ma solo con documenti utili al progetto (il prompt iniziale è stato tolto).

- Test: `npm test` (Vitest nel runtime Workers, rete simulata con msw). Typecheck: `npm run typecheck`.
- Segreti dell'istanza 16bit in `.secrets/` (gitignored). Mai credenziali nel repo.
- Deploy dell'istanza 16bit: vedi `docs/02-istanza-16bit.md` (l'account va passato esplicitamente).
