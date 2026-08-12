/**
 * Node smoke tests for catalogs + equip buff + BOM round-trip.
 * Usage: node scripts/smoke-test.mjs
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function loadJsonAsDataUrl(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel));
  return "data:application/json;base64," + Buffer.from(raw).toString("base64");
}

async function main() {
  const { parseSaveText, serializeSave } = await import(pathToFileURL(path.join(ROOT, "js/parse.js")).href);
  const unlocks = await import(pathToFileURL(path.join(ROOT, "js/unlocks.js")).href);

  // BOM round-trip
  const tiny = { SaveVersion: "50", IsInDungeon: "False", Components: [] };
  const ser = serializeSave(tiny);
  assert(ser.charCodeAt(0) === 0xfeff, "serialize should start with BOM");
  const round = parseSaveText(ser);
  assert(round.SaveVersion === "50", "round-trip SaveVersion");

  await unlocks.loadEquipProjectLibrary(await loadJsonAsDataUrl("data/equipProjectLibrary.json"));
  assert(unlocks.getEquipProjectLibrary().size > 0, "equip library loaded");
  const helmet = unlocks.bestEquipModTemplate("Helmet");
  assert(helmet?.AppliedModifications?.length > 0, "helmet buff profile");

  const fixture = {
    SaveVersion: "50",
    IsInDungeon: "False",
    Components: [
      {
        Type: "MGSC.MagnumProjects",
        Content: {
          Values: [
            {
              ProjectType: "Helmet",
              DevelopId: "military_power_helmet_1",
              StartTime: "1",
              FinishTime: "1",
              IsInDevelopment: "False",
              ModificationsCount: "0",
              UpcomingModificationsCount: "0",
              ModifyStartPrice: "0",
              AppliedModifications: [],
              UpcomingModifications: [],
              CachedItems: [],
            },
          ],
        },
      },
      { Type: "MGSC.MagnumProgression", Content: { _purchasedPerks: [], _departments: {} } },
    ],
  };

  const ok = unlocks.applyEquipBuffMods(fixture, {
    sourceDevelopId: helmet.DevelopId,
    targetIds: ["military_power_helmet_1", "common_sneakers_1"],
  });
  assert(ok.updated === 1, "updated helmet");
  assert(ok.skipped.some((s) => s.includes("common_sneakers_1")), "skip boots vs helmet");
  const h = unlocks.getProjects(fixture).find((p) => p.DevelopId === "military_power_helmet_1");
  assert(h.AppliedModifications.length > 0, "mods applied");

  const skipAmbiguous = unlocks.applyEquipBuffMods(fixture, {
    sourceDevelopId: helmet.DevelopId,
    targetIds: ["mystery_item_xyz"],
    createMissing: true,
  });
  assert(skipAmbiguous.skipped.length >= 1, "unknown type skipped without explicit ProjectType");

  // catalog files exist
  for (const f of [
    "data/pactLibrary.json",
    "data/techLibrary.json",
    "data/mercClasses.json",
    "data/equipProjectLibrary.json",
    "data/unlockBaseline.json",
  ]) {
    assert(fs.existsSync(path.join(ROOT, f)), `missing ${f}`);
  }

  console.log("smoke-test OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
