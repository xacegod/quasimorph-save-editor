/**
 * Difficulty preset editor.
 */
import { getComponent } from "./parse.js";

export const DIFFICULTY_GROUPS = [
  {
    title: "Death / Evac / Penalties",
    fields: ["DeathGift", "EvacRules", "DeathPenalty", "RevivePenalty", "DropPenalty", "LosePerks", "LoseRank", "LoseMissionOnEvacuation", "EquipRepairAfterMission"],
  },
  {
    title: "Combat multipliers",
    fields: ["EnemyHealth", "EnemyDamageMult", "EnemyResistance", "EnemyLos", "EnemyActionPoint", "EnemyDodgeMult", "QmorphLevelGrowth", "QmorphStatsAffect", "MonsterPoints"],
  },
  {
    title: "Economy / Progression",
    fields: ["ExpMult", "FactionGrowthSpeed", "FactionReputation", "MissionRewardPoints", "BarterValue", "ItemPoints", "MagnumCraftingTime", "SmoothProgression", "ForbidKillFaction"],
  },
  {
    title: "Start conditions",
    fields: ["StartingEquip", "StartingMercCount", "StartingClassesCount", "RndMercsAtStart", "RndClassesAtStart", "RndStartingEquip", "RndStartLocation", "Tutorial"],
  },
  {
    title: "Misc",
    fields: ["Id", "BackpacksSize", "ItemsStackSize", "KilledMobsItemsCondition", "MissionStageCountMod", "ImmutableDifficulty", "RndEventsEnabled", "RndEventsChance", "ProcMissionFrequency", "WeightSatietyDrainMult", "SpendAPAtElevator"],
  },
];

export function getDifficultyPreset(data) {
  return getComponent(data, "MGSC.Difficulty")?.Preset || null;
}

export function isBoolish(v) {
  return v === "True" || v === "False";
}
