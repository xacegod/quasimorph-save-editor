/**
 * Build pact/ultimate library from complete wiki scrape pages only.
 * Skips Pre-0.9.9 / legacy, missing pages, and incomplete entries.
 *
 * Usage:
 *   node scripts/scrape-wiki-pacts.mjs   # optional refresh
 *   node scripts/build-pact-library.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "pactLibrary.json");
const PROGRESS = path.join(ROOT, "data", "wiki-scrape-progress.json");
const NAMES = path.join(ROOT, "quasimorph Item name.txt");

function isCompletePage(page) {
  if (!page || page.status !== "ok") return false;
  if (!page.perkId || !page.skullId) return false;
  if (!page.effect || String(page.effect).trim().length < 8) return false;
  return true;
}

function loadNameHints() {
  /** @type {Map<string, string>} skullId -> display name from item catalog */
  const bySkull = new Map();
  try {
    const text = fs.readFileSync(NAMES, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(.+?) (skull_[A-Za-z0-9_]+) (exact|documented)\b/);
      if (!m) continue;
      const name = m[1].trim();
      const skullId = m[2];
      if (!bySkull.has(skullId) || name.length > bySkull.get(skullId).length) {
        bySkull.set(skullId, name);
      }
    }
  } catch {
    /* optional */
  }
  return bySkull;
}

function main() {
  const progress = JSON.parse(fs.readFileSync(PROGRESS, "utf8"));
  const allow = new Set(progress.titles || []);
  const nameHints = loadNameHints();

  const pacts = [];
  let skipped = 0;
  for (const page of Object.values(progress.pages || {})) {
    if (allow.size && page.wikiTitle && !allow.has(page.wikiTitle)) {
      skipped++;
      continue;
    }
    if (page.status === "skipped-legacy" || page.status === "missing" || page.status === "incomplete") {
      skipped++;
      continue;
    }
    if (!isCompletePage(page)) {
      skipped++;
      continue;
    }

    const hint = nameHints.get(page.skullId);
    const displayName = page.wikiTitle || hint || page.perkId;
    pacts.push({
      perkId: page.perkId,
      skullId: page.skullId,
      displayName,
      wikiTitle: page.wikiTitle,
      effect: page.effect,
      tier: page.tier || null,
      charge: page.charge || null,
      source: "wiki",
      Parameters: [],
      AIParameters: [],
      PerkId: page.perkId,
      NextPerkId: {},
      LevelUpActionType: "None",
      CurrentExp: "0",
      ExpPerAction: "0",
      MaxExp: "0",
      PerkType: "Ultimate",
    });
  }

  pacts.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const library = {
    source: "data/wiki-scrape-progress.json (complete current List of Pacts only)",
    builtAt: new Date().toISOString(),
    stats: {
      pacts: pacts.length,
      skippedIncompleteOrLegacy: skipped,
      withWikiTitle: pacts.filter((p) => p.wikiTitle).length,
      withEffect: pacts.filter((p) => p.effect).length,
    },
    pacts,
  };
  fs.writeFileSync(OUT, JSON.stringify(library, null, 2));
  console.log(
    `Wrote ${OUT}: ${pacts.length} complete pacts (skipped ${skipped} incomplete/missing/legacy)`
  );
}

main();
