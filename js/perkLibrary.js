/**
 * Built-in mercenary talent (trait) library. Game normally allows one talent;
 * this editor can stack all of them. Parameter values stay strings.
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

export function addTalent(merc, perkId, data = null) {
  const tmpl = talentTemplate(perkId) || (data ? collectPerkCatalogByType(data, "Talent").get(perkId) : null);
  if (!tmpl || !merc?.CreatureData) return false;
  if (!merc.CreatureData.Perks) merc.CreatureData.Perks = [];
  if (merc.CreatureData.Perks.some((p) => p.PerkId === perkId)) return false;
  merc.CreatureData.Perks.push(deepClone(tmpl));
  return true;
}

export function addAllTalents(merc) {
  let n = 0;
  for (const id of talentLib.keys()) {
    if (addTalent(merc, id)) n++;
  }
  return n;
}

export function paramValueKey(param) {
  if (param.ValType === "Float") return "FloatVal";
  if (param.ValType === "Boolean") return "BoolVal";
  return "IntVal";
}
