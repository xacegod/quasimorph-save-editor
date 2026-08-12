# Quasimorph Save Editor

Browser tool for editing Quasimorph `slot_*_session.dat` saves (UTF-8 JSON with BOM). Vanilla HTML/CSS/ES modules — no build step. All editing stays in your browser; nothing is uploaded.

**Use it online:** [https://xacegod.github.io/quasimorph-save-editor/](https://xacegod.github.io/quasimorph-save-editor/)

## Quick start (GitHub Pages)

1. Open the link above.
2. Click **Open save…** and pick your `slot_0_session.dat`, `slot_1_session.dat`, or `slot_2_session.dat`.
3. Edit, then **Download save** and replace the file in your Quasimorph save folder (back up first).

Typical Windows save location:

`%USERPROFILE%\AppData\LocalLow\Magnum Scripta\Quasimorph\`

(Exact path can vary by platform / launcher; look for `slot_*_session.dat`.)

## Run locally

Clone the repo, then from this directory:

```bash
npm start
```

Open `http://localhost:5173`. Equivalent: `npx --yes serve -p 5173` (or any static server). Catalogs need HTTP — opening `index.html` via `file://` will not load them.

## Safety

- Back up your save before replacing it.
- Edits mutate the in-memory tree in place (unknown fields and key order preserved).
- Almost all game scalars are **strings** (`"True"`, `"4355"`). The editor keeps them as strings.
- Empty C# optionals stay as `{}`, not `null`.
- Download writes compact JSON **with a UTF-8 BOM**, same as the game.
- Warns if `SaveVersion` is not `50`.
- Everything stays in your browser; nothing is uploaded.

## Perk types (important)

Merc `CreatureData.Perks` mix several `PerkType` values. They are easy to confuse:

| PerkType | Tied to | Levels? | Notes |
|----------|---------|---------|--------|
| **Talent** | Character | No (`MaxExp` 0) | Game UI normally allows **one**. Stacking many in the save has been observed to **work**. Use **Set / replace** or **Add (stack)** in the editor. |
| **Rank** | Merc **class** | Yes (toward next rank) | Typically through legend. **Max exp** / **Max rank** in the editor. Difficulty `ExpMult` scales MaxExp. |
| **Ultimate** | Pact / skull | No | **One** active pact. See below. |
| **Passive** / **Trigger** | Class or character | Often yes | Most flexible. Clone from the save; you can remix `Parameters` onto a perk as long as **`PerkId` stays a valid existing id**. Exp UI only when `MaxExp > 0`. |

### Pacts / ultimates in this editor

- **Fully reliable:** edit the ultimate **already** on the merc, or **Remove** it (clears Ultimate perk + skull + `HasUltimate`). That matches the idea of the in-game **Breaking the Pact** item.
- **To unlock a different pact:** put the skull in **inventory** and **absorb it in-game**. Library **Set / edit ultimate** can sync ids for the current ultimate, but it is **not** a full substitute for absorb (banes, charge, and other pact systems).

## Features

### Mercenaries
- Pick who to edit with a dropdown (full-width detail panel)
- Edit stats/health (bools are True/False dropdowns; hover **?** for field help)
- **Pact / ultimate:** see above — edit/remove current ultimate safely; absorb new pacts in-game
- **Talents:** set/replace or stack; parameters editable; not a leveling perk type
- **Ranks / passives / triggers:** **Max exp** fills `CurrentExp`; **Max rank/tier** promotes along `NextPerkId` when the next template exists in the save. Difficulty **ExpMult** scales perk MaxExp.
- Parameter names: `I*` = integer, `F*` = float, `B*` = bool (validated on edit)
- Backpack/vest **qty is editable**; **Add stack** searches the item catalog
- **Copy to selected / all others**: inventory, augs, implants, augment effects, ranks, pact/ultimate, other perks, stats
- Clear curse (`CurseData` → `{}`), instant-finish training, heal non-augment wounds

### Cargo
- Filter by name/id, store, **newest N stacks on ShipCargo[0]** (new loot is appended at the end of that tab)
- Empty table shows **No results** plus how many stacks remain and **Clear filter**
- Set stack qty (`Count` may exceed `Max`; the game can split)
- **Add filtered IDs to always-recycle** then **Move always-recycle list → recycler**, or **Move filtered → recycler**
- **Fridge auto-move** (rotten / expired):
  - Rotten = item id contains `rotten`
  - Expired = `ExpireComponent` with `IsStarted=True`, not frozen, and `ExpireDate` **before** current `SpaceTime.Time`
  - Already-in-fridge items are skipped; on move `IsFrozen=True`
- Spawn: catalog search + scrollable list; template/thin spawn; **Spawn each from filter**; give-one-of-each
- Storage table shows **Width × Height = capacity** (Magnum tabs / recycler+fridge / shuttle). Ship cargo tabs are often already huge (e.g. 8×1910). Grow **Height** on smaller stores if you need more cells — never shrinks after deletes.

### Projects
- Equipment / Mercenary / Class lists: **Instant-finish selected** or **Instant-finish all projects** (sets `FinishTime = StartTime` for the current list)
- Equipment: delete junk to free the ~10 project cap; delete finished
- Mercenary: copy buffed kit from one DevelopId to others
- Class: edit Applied/Upcoming mods JSON; copy mods

### Unlocks
- View merc / class / production / ship perk unlock lists
- **Restore full unlocks** from `data/unlockBaseline.json` (extracted from a late-game save)

### Factions / Difficulty / World
- Faction power, reputation, tech, alliance
- Difficulty preset groups
- Travel, SpaceTime, Debug; RaidMetadata when `IsInDungeon` is True

### Raw
- Component list + inferred schema + truncated JSON (use for risky experiments like Rank→Talent)

## Sample saves

Sample `slot_*_session.dat` files are **not** included in this repo (they are large). Use your own campaign saves from the game folder.

Floor/mob entities are **not** in session files; only `RaidMetadata` exists for raids.

## Catalogs

- `data/quasimorph Item name.txt` — display names
- `data/spawnableItems.txt` — spawnable non-quest ids (includes extras like `lens` and custom gear found in sample saves)
- `data/questItems.txt` — protected quest ids (excluded from spawn lists)
- `data/talentLibrary.json` — clean templates for all 15 talents
- `data/pactLibrary.json` — complete 1.0+ pact ultimates (skull ↔ perk id, display names, wiki effects)
- `data/wiki-scrape-progress.json` — resumable wiki scrape checkpoint (list diffs + per-page status)
- `data/mercClasses.json` — mercenary class roster from [Mercenary Classes](https://quasimorph.wiki.gg/wiki/Mercenary_Classes)
- `data/classPerkLibrary.json` — per-perk wiki pages (InternalName, trigger, ExpNeed, tier effects, cooldown) via `npm run scrape:classes`
- `data/class-perk-scrape-progress.json` — resumable checkpoint for perk page scrapes
- `data/unlockBaseline.json` — full unlock snapshot from a late-game save

Rebuild pacts from the wiki (current **1.0+** List of Pacts only):
1. `npm run scrape:pacts` — re-reads the live list each run, reports **added/removed** pacts, scrapes new links; ignores pre-1.0 sections
2. `npm run build:pacts` — writes only **complete** current entries to `data/pactLibrary.json`

Class + perk pages: `npm run scrape:classes` (resumable; opens each perk like [Berserkgang](https://quasimorph.wiki.gg/wiki/Berserkgang) for InternalName / effects / exp needs)

Helpers: `npm run scrape:pacts:status`, `npm run scrape:pacts:retry`

**Note:** Difficulty `ExpMult` affects how much experience is required to level Rank / Passive / Trigger perks. The `MaxExp` values stored on perks in a save already reflect that run’s difficulty.

On save load, any non-quest item ids present in inventories/cargo but missing from the spawnable list are **merged into the catalog** for that session.

## Not in scope (yet)

- Full equipment project mods UI
- Stations / missions / shippings editors
- Dungeon floor entities (not stored in session saves)
- Full in-editor “absorb pact” simulation (use inventory + game for new pacts)
