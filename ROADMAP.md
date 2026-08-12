# Quasimorph Save Editor — improvement roadmap

Roadmap to harden and extend the editor: first close gaps in the current campaign surface (Projects buffs, docs, incomplete libraries), then add Magnum world editors (stations → missions → shippings), while explicitly deferring dungeon floors and full pact-absorb simulation.

## Todos

- [x] **Phase 0:** Update README (tech caps, buffs, scrape:all); regroup Projects Equipment toolbars
- [x] **Phase 1:** Buff profiles, Key/Value mod form, bulk apply, stricter type safety
- [x] **Phase 1:** Enrich equipProjectLibrary (bestByType, strip huge CachedItems for Pages)
- [x] **Phase 2:** Pact missing tracker, empty classes, passive/trigger harvest, unlock baseline refresh
- [x] **Phase 3:** Stations editor (list / ownership / safe finish-clear)
- [x] **Phase 3:** Missions editor (list / expire / complete / delete)
- [x] **Phase 3:** Shippings editor (inspect / clear / force-arrive with warnings)
- [x] **Phase 4:** Smoke tests, stronger status warnings, optional undo for bulk ops

## Implemented summary

See [`README.md`](README.md) for current features. Maintenance: `npm run scrape:all`, `npm test`.

## Out of scope (unchanged)

- Dungeon floor entity editing
- Full pact absorb simulation
- Shipping the user’s real `slot_*_session.dat` in the repo
