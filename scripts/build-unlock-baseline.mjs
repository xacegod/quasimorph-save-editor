/**
 * Refresh data/unlockBaseline.json from the richest local slot_*_session.dat.
 * Usage: node scripts/build-unlock-baseline.mjs [slot_2_session.dat]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "unlockBaseline.json");

function loadSave(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function score(data) {
  const merc = data.Components?.find((c) => c.Type === "MGSC.Mercenaries")?.Content;
  const cargo = data.Components?.find((c) => c.Type === "MGSC.MagnumCargo")?.Content;
  const prog = data.Components?.find((c) => c.Type === "MGSC.MagnumProgression")?.Content;
  return (
    (merc?.UnlockedMercenaries?.length || 0) +
    (merc?.UnlockedClasses?.length || 0) +
    (cargo?.UnlockedProductionItems?.length || 0) +
    (prog?._purchasedPerks?.length || 0)
  );
}

function extract(data, file) {
  const merc = data.Components?.find((c) => c.Type === "MGSC.Mercenaries")?.Content;
  const cargo = data.Components?.find((c) => c.Type === "MGSC.MagnumCargo")?.Content;
  const prog = data.Components?.find((c) => c.Type === "MGSC.MagnumProgression")?.Content;
  return {
    SaveVersion: data.SaveVersion,
    sourceFile: path.basename(file),
    builtAt: new Date().toISOString(),
    UnlockedMercenaries: JSON.parse(JSON.stringify(merc?.UnlockedMercenaries || [])),
    UnlockedClasses: JSON.parse(JSON.stringify(merc?.UnlockedClasses || [])),
    UnlockedProductionItems: JSON.parse(JSON.stringify(cargo?.UnlockedProductionItems || [])),
    purchasedPerks: JSON.parse(JSON.stringify(prog?._purchasedPerks || [])),
  };
}

function main() {
  const arg = process.argv[2];
  let file;
  if (arg) {
    file = path.isAbsolute(arg) ? arg : path.join(ROOT, arg);
  } else {
    const files = fs
      .readdirSync(ROOT)
      .filter((f) => /^slot_\d+_session\.dat$/i.test(f))
      .map((f) => path.join(ROOT, f));
    if (!files.length) {
      console.error("No slot_*_session.dat found");
      process.exit(1);
    }
    let best = null;
    let bestScore = -1;
    for (const f of files) {
      const data = loadSave(f);
      const s = score(data);
      if (s > bestScore) {
        best = f;
        bestScore = s;
      }
    }
    file = best;
  }

  const data = loadSave(file);
  const out = extract(data, file);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT} from ${path.basename(file)} SaveVersion=${out.SaveVersion}`);
  console.log(
    `  mercs ${out.UnlockedMercenaries.length}, classes ${out.UnlockedClasses.length}, production ${out.UnlockedProductionItems.length}, perks ${out.purchasedPerks.length}`
  );
}

main();
