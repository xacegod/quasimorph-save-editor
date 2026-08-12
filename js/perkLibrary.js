/**
 * Talent + pact (ultimate) libraries. One talent and one ultimate per merc.
 */
import { deepClone } from "./parse.js";
import { collectPerkCatalogByType, setUltimateSkull } from "./merc.js";

/** @type {Map<string, object>} */
const talentLib = new Map();
/** @type {Map<string, object>} perkId -> ultimate template (+ meta) */
const pactLib = new Map();

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

export async function loadPactLibrary(url = "data/pactLibrary.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.pacts || [];
    pactLib.clear();
    for (const p of list) {
      const id = p.PerkId || p.perkId;
      if (!id) continue;
      pactLib.set(id, {
        ...p,
        PerkId: id,
        PerkType: "Ultimate",
        Parameters: p.Parameters || [],
        AIParameters: p.AIParameters || [],
        NextPerkId: p.NextPerkId ?? {},
        LevelUpActionType: p.LevelUpActionType || "None",
        CurrentExp: p.CurrentExp || "0",
        ExpPerAction: p.ExpPerAction || "0",
        MaxExp: p.MaxExp || "0",
      });
    }
  } catch (e) {
    console.warn("pact library not loaded", e);
  }
  return pactLib.size;
}

export function getTalentLibrary() {
  return talentLib;
}

export function getPactLibrary() {
  return pactLib;
}

export function talentTemplate(perkId) {
  const t = talentLib.get(perkId);
  return t ? deepClone(t) : null;
}

export function pactTemplate(perkId) {
  const t = pactLib.get(perkId);
  if (!t) return null;
  const clone = deepClone(t);
  // Strip catalog meta from the perk object written into the save
  delete clone.perkId;
  delete clone.skullId;
  delete clone.displayName;
  delete clone.wikiTitle;
  delete clone.effect;
  delete clone.tier;
  delete clone.charge;
  delete clone.source;
  clone.PerkId = perkId;
  clone.PerkType = "Ultimate";
  return clone;
}

export function pactMeta(perkId) {
  return pactLib.get(perkId) || null;
}

export function pactLabel(perkId) {
  const m = pactLib.get(perkId);
  if (!m) return perkId;
  const name = m.displayName || m.wikiTitle || perkId;
  return name === perkId ? perkId : `${name} (${perkId})`;
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

/** Pact library + Ultimate perks already present in the open save (save fills real Parameters). */
export function mergedUltimateCatalog(data) {
  const map = new Map();
  for (const [id, p] of pactLib) map.set(id, deepClone(p));
  for (const [id, p] of collectPerkCatalogByType(data, "Ultimate")) {
    const base = map.get(id);
    if (base) {
      // Prefer real parameter shapes from the save over empty library stubs
      map.set(id, {
        ...base,
        ...deepClone(p),
        displayName: base.displayName,
        wikiTitle: base.wikiTitle,
        effect: base.effect,
        skullId: base.skullId || `skull_${id}`,
        tier: base.tier,
        charge: base.charge,
      });
    } else {
      map.set(id, deepClone(p));
    }
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

/**
 * Replace any Ultimate perk(s) with the chosen one and sync skull / HasUltimate.
 * Game allows one pact ultimate.
 */
export function setUltimate(merc, perkId, data = null) {
  if (!merc?.CreatureData) return false;
  const fromSave = data ? collectPerkCatalogByType(data, "Ultimate").get(perkId) : null;
  const tmpl = fromSave ? deepClone(fromSave) : pactTemplate(perkId);
  if (!tmpl) return false;
  tmpl.PerkType = "Ultimate";
  tmpl.PerkId = perkId;
  const kept = (merc.CreatureData.Perks || []).filter((p) => p.PerkType !== "Ultimate");
  merc.CreatureData.Perks = [...kept, tmpl];
  const meta = pactLib.get(perkId);
  const skullId = meta?.skullId || `skull_${perkId}`;
  if (data) setUltimateSkull(data, merc, skullId);
  else {
    merc.CreatureData.UltimateSkullItemId = skullId;
    merc.CreatureData.HasUltimate = "True";
  }
  return true;
}

export function clearUltimate(merc, data = null) {
  if (!merc?.CreatureData) return;
  merc.CreatureData.Perks = (merc.CreatureData.Perks || []).filter((p) => p.PerkType !== "Ultimate");
  if (data) setUltimateSkull(data, merc, "");
  else {
    merc.CreatureData.UltimateSkullItemId = {};
    merc.CreatureData.HasUltimate = "False";
  }
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
