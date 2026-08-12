/**
 * Build equipment Magnum project templates from local slot_*_session.dat files.
 * Prefers copies with the most AppliedModifications (your heavily modded gear).
 * Strips CachedItems from the shipped library (keeps Pages size down).
 *
 * Usage: node scripts/build-equip-project-library.mjs
 *
 * Writes: data/equipProjectLibrary.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "equipProjectLibrary.json");

const EQUIP_TYPES = ["Armor", "Helmet", "Boots", "Leggings", "RangeWeapon", "MeleeWeapon"];

function loadSave(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function score(p) {
  let s = (p.AppliedModifications?.length || 0) * 1000;
  for (const m of p.AppliedModifications || []) {
    const v = parseFloat(m.Value);
    if (!Number.isNaN(v)) s += Math.abs(v);
  }
  s += (parseInt(p.ModificationsCount, 10) || 0);
  return s;
}

function cloneTemplate(p, { stripCached = true } = {}) {
  return {
    ProjectType: p.ProjectType,
    DevelopId: p.DevelopId,
    StartTime: p.StartTime || "0",
    FinishTime: p.FinishTime || p.StartTime || "0",
    IsInDevelopment: "False",
    ModificationsCount: String(p.AppliedModifications?.length || 0),
    UpcomingModificationsCount: "0",
    ModifyStartPrice: p.ModifyStartPrice || "0",
    AppliedModifications: JSON.parse(JSON.stringify(p.AppliedModifications || [])),
    UpcomingModifications: [],
    CachedItems: stripCached ? [] : JSON.parse(JSON.stringify(p.CachedItems || [])),
  };
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
    const vals = data.Components?.find((c) => c.Type === "MGSC.MagnumProjects")?.Content?.Values || [];
    let n = 0;
    for (const p of vals) {
      if (!EQUIP_TYPES.includes(p.ProjectType) || !p.DevelopId) continue;
      n++;
      const next = cloneTemplate(p, { stripCached: true });
      // Preserve score using original CachedItems length lightly via ModificationsCount already
      const prev = byId.get(p.DevelopId);
      if (!prev || score(p) > score(prev)) byId.set(p.DevelopId, next);
    }
    sources.push({ file: path.basename(file), equipmentProjects: n });
  }

  const projects = [...byId.values()].sort(
    (a, b) => a.ProjectType.localeCompare(b.ProjectType) || a.DevelopId.localeCompare(b.DevelopId)
  );
  const withMods = projects.filter((p) => (p.AppliedModifications || []).length > 0);

  /** @type {Record<string, string>} */
  const bestByType = {};
  for (const type of EQUIP_TYPES) {
    const best = withMods.filter((p) => p.ProjectType === type).sort((a, b) => score(b) - score(a))[0];
    if (best) bestByType[type] = best.DevelopId;
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: "local slot_*_session.dat MagnumProjects (equipment)",
        builtAt: new Date().toISOString(),
        note: "Templates for Add/buff in Projects. CachedItems stripped. bestByType = strongest mod profile per ProjectType. Weapon/armor slot caps come from MagnumProgression techs.",
        stats: {
          projects: projects.length,
          withMods: withMods.length,
          sources,
        },
        bestByType,
        projects,
        byDevelopId: Object.fromEntries(projects.map((p) => [p.DevelopId, p])),
      },
      null,
      2
    )
  );

  console.log(`Wrote ${OUT}`);
  console.log(`${projects.length} templates (${withMods.length} with AppliedModifications)`);
  console.log("bestByType", bestByType);
  for (const s of sources) console.log(`  ${s.file}: ${s.equipmentProjects} equip projects`);
}

main();
