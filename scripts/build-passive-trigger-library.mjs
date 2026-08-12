/**
 * Harvest Passive/Trigger perk shapes from local slot_*_session.dat files.
 * Usage: node scripts/build-passive-trigger-library.mjs
 * Writes: data/passiveTriggerLibrary.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "passiveTriggerLibrary.json");

function loadSave(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function score(p) {
  return (p.Parameters?.length || 0) * 10 + (parseInt(p.MaxExp, 10) || 0);
}

function main() {
  const files = fs
    .readdirSync(ROOT)
    .filter((f) => /^slot_\d+_session\.dat$/i.test(f))
    .map((f) => path.join(ROOT, f));

  /** @type {Map<string, object>} */
  const byId = new Map();
  const sources = [];

  for (const file of files) {
    const data = loadSave(file);
    const mercs = data.Components?.find((c) => c.Type === "MGSC.Mercenaries")?.Content?.Values || [];
    let n = 0;
    for (const m of mercs) {
      for (const p of m.CreatureData?.Perks || []) {
        if (p.PerkType !== "Passive" && p.PerkType !== "Trigger") continue;
        if (!p.PerkId) continue;
        n++;
        const tmpl = {
          PerkId: p.PerkId,
          PerkType: p.PerkType,
          MaxExp: p.MaxExp ?? "0",
          CurrentExp: "0",
          NextPerkId: p.NextPerkId ?? {},
          IsAvailable: p.IsAvailable ?? "True",
          Parameters: JSON.parse(JSON.stringify(p.Parameters || [])),
        };
        const prev = byId.get(p.PerkId);
        if (!prev || score(tmpl) > score(prev)) byId.set(p.PerkId, tmpl);
      }
    }
    sources.push({ file: path.basename(file), passiveTrigger: n });
  }

  const perks = [...byId.values()].sort(
    (a, b) => a.PerkType.localeCompare(b.PerkType) || a.PerkId.localeCompare(b.PerkId)
  );

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: "local slot_*_session.dat CreatureData.Perks (Passive/Trigger)",
        builtAt: new Date().toISOString(),
        stats: { perks: perks.length, sources },
        perks,
        byPerkId: Object.fromEntries(perks.map((p) => [p.PerkId, p])),
      },
      null,
      2
    )
  );
  console.log(`Wrote ${OUT} (${perks.length} perks)`);
  for (const s of sources) console.log(`  ${s.file}: ${s.passiveTrigger}`);
}

main();
