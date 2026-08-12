/**
 * Talent + pact (ultimate) libraries.
 * Talent: character-tied, not a leveling chain; stacking often works.
 * Ultimate: one pact; prefer absorb/break in-game for full flow.
 */
import { deepClone } from "./parse.js";
import { collectPerkCatalogByType, setUltimateSkull, getMercenaries, listPerks } from "./merc.js";

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

/** Replace any existing Talent perk(s) with the chosen one. */
export function setTalent(merc, perkId, data = null) {
  const tmpl = talentTemplate(perkId) || (data ? collectPerkCatalogByType(data, "Talent").get(perkId) : null);
  if (!tmpl || !merc?.CreatureData) return false;
  const kept = (merc.CreatureData.Perks || []).filter((p) => p.PerkType !== "Talent");
  merc.CreatureData.Perks = [...kept, deepClone(tmpl)];
  return true;
}

/** Stack another Talent (game UI normally allows one; multiple in the save often still work). */
export function addTalent(merc, perkId, data = null) {
  const tmpl = talentTemplate(perkId) || (data ? collectPerkCatalogByType(data, "Talent").get(perkId) : null);
  if (!tmpl || !merc?.CreatureData) return false;
  if (!merc.CreatureData.Perks) merc.CreatureData.Perks = [];
  if (merc.CreatureData.Perks.some((p) => p.PerkId === perkId)) return false;
  merc.CreatureData.Perks.push(deepClone(tmpl));
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
  const kind = inferParamKind(param);
  if (kind === "Float") return "FloatVal";
  if (kind === "Boolean") return "BoolVal";
  return "IntVal";
}

/** Infer Int / Float / Boolean from ValType and name prefix (I*, F*, B*). */
export function inferParamKind(param) {
  const name = String(param?.Name || "");
  const vt = String(param?.ValType || "");
  if (vt === "Boolean" || name.startsWith("B") || param?.BoolVal === "True" || param?.BoolVal === "False") {
    return "Boolean";
  }
  if (vt === "Float" || name.startsWith("F") || param?.FloatVal != null) return "Float";
  if (vt === "Int" || name.startsWith("I") || param?.IntVal != null) return "Int";
  if (param?.FloatVal != null) return "Float";
  if (param?.BoolVal != null) return "Boolean";
  return "Int";
}

export function paramTypeHint(param) {
  const kind = inferParamKind(param);
  const name = param?.Name || "";
  if (kind === "Int") return `${name}: Integer (IntVal) — whole number only`;
  if (kind === "Float") return `${name}: Float (FloatVal) — numeric, e.g. 0.25 or -0.5`;
  return `${name}: Boolean (True/False)`;
}

/**
 * Validate and normalize a parameter value as a string for the save.
 * @returns {{ ok: true, value: string, kind: string } | { ok: false, message: string, kind: string }}
 */
export function validateParamValue(param, raw) {
  const kind = inferParamKind(param);
  const s = String(raw ?? "").trim();
  if (kind === "Boolean") {
    if (s === "True" || s === "False") return { ok: true, value: s, kind };
    return { ok: false, message: "Must be True or False", kind };
  }
  if (kind === "Int") {
    if (!/^-?\d+$/.test(s)) {
      return { ok: false, message: "Must be an integer (e.g. 2, -1)", kind };
    }
    return { ok: true, value: String(parseInt(s, 10)), kind };
  }
  // Float
  if (s === "" || s === "." || s === "-" || s === "-.") {
    return { ok: false, message: "Must be a number (float)", kind };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return { ok: false, message: "Must be a number (float)", kind };
  }
  return { ok: true, value: s, kind };
}

export function applyParamValue(param, raw) {
  const result = validateParamValue(param, raw);
  if (!result.ok) return result;
  const kind = result.kind;
  param.ValType = kind === "Float" ? "Float" : kind === "Boolean" ? "Boolean" : "Int";
  if (kind === "Boolean") {
    param.BoolVal = result.value;
    delete param.IntVal;
    delete param.FloatVal;
  } else if (kind === "Float") {
    param.FloatVal = result.value;
    delete param.IntVal;
    delete param.BoolVal;
  } else {
    param.IntVal = result.value;
    delete param.FloatVal;
    delete param.BoolVal;
  }
  return result;
}

/** True when the perk uses CurrentExp toward MaxExp (leveling chain). */
export function perkHasExp(p) {
  const max = parseInt(p?.MaxExp, 10);
  return Number.isFinite(max) && max > 0;
}

/** Set CurrentExp = MaxExp (does not auto-promote to NextPerkId). */
export function maxPerkExp(p) {
  if (!perkHasExp(p)) return false;
  p.CurrentExp = String(p.MaxExp);
  return true;
}

export function perkNextId(p) {
  return typeof p?.NextPerkId === "string" && p.NextPerkId ? p.NextPerkId : null;
}

/** Follow NextPerkId using templates found in the open save; returns the highest available perk. */
export function resolveMaxRankPerk(perk, data) {
  const map = new Map();
  if (data) {
    for (const m of getMercenaries(data)) {
      for (const p of listPerks(m)) {
        if (p.PerkId && !map.has(p.PerkId)) map.set(p.PerkId, deepClone(p));
      }
    }
  }
  if (perk?.PerkId && !map.has(perk.PerkId)) map.set(perk.PerkId, deepClone(perk));

  let cur = deepClone(perk);
  const visited = new Set();
  while (perkNextId(cur) && !visited.has(cur.PerkId)) {
    visited.add(cur.PerkId);
    const next = map.get(cur.NextPerkId);
    if (!next) break;
    cur = deepClone(next);
  }
  return cur;
}

export function canPromotePerk(perk, data) {
  const maxed = resolveMaxRankPerk(perk, data);
  return maxed?.PerkId && maxed.PerkId !== perk.PerkId;
}

/** Replace perk at index with the end of its NextPerkId chain (e.g. rank_4 → rank_5). */
export function promotePerkToMaxRank(merc, perkIndex, data) {
  const list = merc?.CreatureData?.Perks;
  if (!Array.isArray(list) || perkIndex < 0 || perkIndex >= list.length) return null;
  const current = list[perkIndex];
  const maxed = resolveMaxRankPerk(current, data);
  if (!maxed || maxed.PerkId === current.PerkId) return null;
  // Preserve type if promoting within same family
  list[perkIndex] = maxed;
  return maxed;
}
