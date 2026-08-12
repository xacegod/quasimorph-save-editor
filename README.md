# Quasimorph Save Editor

Local browser tool for editing Quasimorph `slot_*_session.dat` saves (UTF-8 JSON with BOM).

## Run

Serve the project folder over HTTP (ES modules + catalog fetches):

```bash
npx --yes serve -p 5173
```

Then open `http://localhost:5173` and load a save (`slot_0_session.dat`, `slot_1_session.dat`, or `slot_2_session.dat`).

Or any static server from this directory.

## Safety

- Edits mutate the in-memory tree in place (unknown fields and key order preserved).
- Almost all game scalars are **strings** (`"True"`, `"4355"`). The editor keeps them as strings.
- Empty C# optionals stay as `{}`, not `null`.
- Download writes compact JSON **with a UTF-8 BOM**, same as the game.
- Warns if `SaveVersion` is not `50`.
- Everything stays in your browser; nothing is uploaded.

## Features

### Mercenaries
- Edit stats/health (bools are True/False dropdowns; hover **?** for what a field means)
- **Pact / ultimate** is separate from class ranks. Ultimates come from bramfatura pacts (skull item + `HasUltimate` + `PerkType: Ultimate`). Ranks (`rank_4` / `rank_5`) come from the class.
- **Talents (traits):** all 15 from `data/talentLibrary.json` can be stacked on one merc (the game normally allows one). Each Int/Float/Bool parameter is editable. **Add all 15 talents** adds any that are missing.
- Backpack/vest **qty is editable**; **Add stack** searches the item catalog
- **Copy to selected / all others**: inventory, augs, implants, augment effects, ranks, pact/ultimate, other perks, stats
- Clear curse (`CurseData` → `{}`), instant-finish training, heal non-augment wounds

### Cargo
- Filter by name/id, store, **newest N stacks on ShipCargo[0]** (new loot is appended at the end of that tab)
- Empty table shows **No results** plus how many stacks remain in the save and **Clear filter** — deleting a filter does not freeze the UI
- Set stack qty (`Count` may exceed `Max`; the game can split)
- **Add filtered IDs to always-recycle** then **Move always-recycle list → recycler**, or **Move filtered → recycler**
- **Fridge auto-move** (rotten / expired):
  - Rotten = item id contains `rotten`
  - Expired = `ExpireComponent` with `IsStarted=True`, not frozen, and `ExpireDate` **before** current `SpaceTime.Time`
  - Already-in-fridge items are skipped; on move `IsFrozen=True`
- Spawn: **Search item catalog** + scrollable full list (not a 80-item dropdown)
- Storage table shows **Width × Height = capacity** grouped as Magnum tabs / recycler+fridge / shuttle. Ship cargo tabs are often already huge (8×1910). Grow **Height** on recycler, fridge, and shuttle if you need more cells. Never shrinks.

### Projects
- Equipment tab: delete junk to free the ~10 project cap; instant-finish
- Mercenary tab: instant-finish; copy buffed kit from one DevelopId to others
- Class tab: edit Applied/Upcoming mods JSON; copy mods

### Unlocks
- View merc / class / production / ship perk unlock lists
- **Restore full unlocks** from `data/unlockBaseline.json` (extracted from late-game slot 2)

### Factions / Difficulty / World
- Faction power, reputation, tech, alliance
- Difficulty preset groups
- Travel, SpaceTime, Debug; RaidMetadata when `IsInDungeon` is True

### Raw
- Component list + inferred schema + truncated JSON

## Sample saves

| File | Role |
|------|------|
| `slot_2_session.dat` | Late-game ship, unlock/buff baseline |
| `slot_1_session.dat` | In-raid session (`IsInDungeon: True`) |
| `slot_0_session.dat` | Early campaign (few unlocks) |

Floor/mob entities are **not** in session files; only `RaidMetadata` exists for raids.

## Catalogs

- `quasimorph Item name.txt` — display names
- `data/spawnableItems.txt` — playable non-quest ids
- `data/questItems.txt` — protected quest ids
- `data/unlockBaseline.json` — full unlock snapshot from slot 2
