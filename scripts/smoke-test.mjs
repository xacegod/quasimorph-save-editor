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

  const mercMod = await import(pathToFileURL(path.join(ROOT, "js/merc.js")).href);
  const perkLib = await import(pathToFileURL(path.join(ROOT, "js/perkLibrary.js")).href);
  const classMod = await import(pathToFileURL(path.join(ROOT, "js/mercClasses.js")).href);

  await classMod.loadMercClasses(await loadJsonAsDataUrl("data/mercClasses.json"), "data:application/json,{}");
  const inf = classMod.mercClassInfo("martian_mech");
  assert(inf?.classIdGuess === "martian_mech_inf", "martian_mech aliases to infantry");
  assert(classMod.canonicalClassId("martian_mech") === "martian_mech_inf", "canonical infantry id");

  const source = {
    MercClassId: "martian_mech",
    CreatureData: {
      BaseHealth: "930",
      CanFly: "True",
      WeaponDistanceBonus: "6",
      AugResistBonusMult: "1.5",
      HasSecondChance: "True",
      UpgradePerksCount: "25",
      Health: { MaxValue: "960", _value: "960" },
      MeleeDamage: { minDmg: "53" },
      Perks: [
        {
          PerkId: "talent_tactical_reload",
          PerkType: "Talent",
          Parameters: [
            { Name: "IConstReload", ValType: "Int", IntVal: "1" },
            { Name: "IWeaponDistance", ValType: "Int", IntVal: "6" },
          ],
          AIParameters: [],
        },
        {
          PerkId: "rank_5",
          PerkType: "Rank",
          Parameters: [{ Name: "IMaxHealth", ValType: "Int", IntVal: "300" }],
          AIParameters: [],
        },
      ],
    },
  };
  const dest = {
    MercClassId: "unit_317",
    CreatureData: {
      BaseHealth: "100",
      CanFly: "False",
      WeaponDistanceBonus: "2",
      AugResistBonusMult: "1",
      HasSecondChance: "False",
      UpgradePerksCount: "0",
      Health: { MaxValue: "100", _value: "100" },
      MeleeDamage: { minDmg: "10" },
      Perks: [
        {
          PerkId: "talent_tactical_reload",
          PerkType: "Talent",
          Parameters: [{ Name: "IConstReload", ValType: "Int", IntVal: "1" }],
          AIParameters: [],
        },
      ],
    },
  };
  const copied = mercMod.copyMercSections(source, [dest], [
    "classId",
    "talents",
    "rankPerks",
    "otherPerks",
    "pactUltimate",
    "stats",
  ]);
  assert(copied === 1, "copyMercSections count");
  assert(dest.MercClassId === "martian_mech", "class copied as-is");
  assert(dest.CreatureData.CanFly === "True", "CanFly baked bonus copied");
  assert(dest.CreatureData.WeaponDistanceBonus === "6", "WeaponDistanceBonus copied");
  assert(dest.CreatureData.BaseHealth === "930", "BaseHealth copied");
  assert(dest.CreatureData.Perks.length === 2, "exact perk list");
  assert(
    dest.CreatureData.Perks[0].Parameters.some((p) => p.Name === "IWeaponDistance" && p.IntVal === "6"),
    "custom talent param copied as-is"
  );

  const perk = { PerkId: "talent_tactical_reload", PerkType: "Talent", Parameters: [], AIParameters: [] };
  const added = perkLib.addPerkParameter(perk, "IQMorphGain", "-3");
  assert(added.ok && perk.Parameters[0].IntVal === "-3", "addPerkParameter int");
  const grafted = perkLib.addPerkParameter(
    perk,
    { Name: "FIncomeCritMult", ValType: "Float", FloatVal: "-0.5" },
    "-0.8"
  );
  assert(grafted.ok && perk.Parameters[1].FloatVal === "-0.8", "graft float param");
  assert(perkLib.removePerkParameter(perk, "IQMorphGain"), "removePerkParameter");
  assert(perk.Parameters.length === 1, "one param left");

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
