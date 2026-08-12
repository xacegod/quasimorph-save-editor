/**
 * Built-in mercenary talent (trait) library. Game allows one talent per merc;
 * setting a talent replaces any existing Talent perk. Parameter values stay strings.
 */
import { deepClone } from "./parse.js";
import { collectPerkCatalogByType } from "./merc.js";

/** @type {Map<string, object>} */
const talentLib = new Map();

export async function loadPerkLibrary(url = "data/talentLibrary.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const list = await res.json();
    talentLib.clear();
    for (const p of list) {
      if (p?.PerkId) talentLib.set(p.PerkId, p);
    }
  } catch (e) {
    console.warn("talent library not loaded", e);
  }
  return talentLib.size;
}

export function getTalentLibrary() {
  return talentLib;
}

export function talentTemplate(perkId) {
  const t = talentLib.get(perkId);
  return t ? deepClone(t) : null;
}

/** Library first, then any extra Talent perks found in the open save. */
export function mergedTalentCatalog(data) {
  const map = new Map();
  for (const [id, p] of talentLib) map.set(id, deepClone(p));
  for (const [id, p] of collectPerkCatalogByType(data, "Talent")) {
    if (!map.has(id)) map.set(id, p);
  }
  return map;
}

/** Replace any existing Talent perk(s) with the chosen one (game allows a single talent). */
export function setTalent(merc, perkId, data = null) {
  const tmpl = talentTemplate(perkId) || (data ? collectPerkCatalogByType(data, "Talent").get(perkId) : null);
  if (!tmpl || !merc?.CreatureData) return false;
  const kept = (merc.CreatureData.Perks || []).filter((p) => p.PerkType !== "Talent");
  merc.CreatureData.Perks = [...kept, deepClone(tmpl)];
  return true;
}

export function paramValueKey(param) {
  if (param.ValType === "Float") return "FloatVal";
  if (param.ValType === "Boolean") return "BoolVal";
  return "IntVal";
}

/** True when the perk uses CurrentExp toward MaxExp (leveling chain). */
export function perkHasExp(p) {
  const max = parseInt(p?.MaxExp, 10);
  return Number.isFinite(max) && max > 0;
}
