/**
 * Rank + perk parameter defaults for editor hints / Reset.
 */
import { deepClone } from "./parse.js";

/** @type {Map<string, object>} */
const ranks = new Map();
/** @type {Map<string, object>} */
const defaults = new Map();
/** @type {Record<string, string>} */
let paramLabels = {};
/** @type {Record<string, { base: string, tiers: Record<string, string> }>} */
let byBase = {};

export async function loadRankLibrary(url = "data/rankLibrary.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    ranks.clear();
    for (const r of data.ranks || []) {
      if (r.PerkId) ranks.set(r.PerkId, r);
    }
  } catch (e) {
    console.warn("rank library not loaded", e);
  }
  return ranks.size;
}

export async function loadPerkDefaults(url = "data/perkDefaults.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    defaults.clear();
    for (const [id, p] of Object.entries(data.perks || {})) {
      defaults.set(id, p);
    }
    paramLabels = data.paramLabels || {};
    byBase = data.byBase || {};
  } catch (e) {
    console.warn("perk defaults not loaded", e);
  }
  return defaults.size;
}

export function rankMeta(perkId) {
  return ranks.get(perkId) || null;
}

export function rankLabel(perkId) {
  const m = rankMeta(perkId);
  if (!m) return perkId || "";
  return `${m.displayName} (${perkId})`;
}

export function perkDefaultTemplate(perkId) {
  const t = defaults.get(perkId);
  return t ? deepClone(t) : null;
}

export function basePerkId(perkId) {
  return String(perkId || "").replace(/_(basic|advanced|master|legend)$/i, "");
}

export function perkTierSuffix(perkId) {
  const m = String(perkId || "").match(/_(basic|advanced|master|legend)$/i);
  return m ? m[1].toLowerCase() : null;
}

/** Map wiki Effect_1..4 → basic/advanced/master/legend when possible. */
export function wikiTierKey(perkId) {
  const t = perkTierSuffix(perkId);
  if (t === "basic") return "1";
  if (t === "advanced") return "2";
  if (t === "master") return "3";
  if (t === "legend") return "4";
  return null;
}

export function paramLabel(name) {
  if (!name) return "";
  return paramLabels[name] || humanizeParamName(name);
}

function humanizeParamName(name) {
  const s = String(name);
  const body = s.replace(/^[IFB]/, "");
  const spaced = body.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  if (s.startsWith("I")) return `${spaced} (int)`;
  if (s.startsWith("F")) return `${spaced} (float)`;
  if (s.startsWith("B")) return `${spaced} (bool)`;
  return spaced;
}

export function defaultParamValue(perkId, paramName) {
  const tmpl = defaults.get(perkId);
  if (!tmpl) return null;
  const list = [...(tmpl.Parameters || []), ...(tmpl.AIParameters || [])];
  const p = list.find((x) => x.Name === paramName);
  if (!p) return null;
  return p.IntVal ?? p.FloatVal ?? p.BoolVal ?? null;
}

export function formatDefaultHint(perkId, param) {
  const def = defaultParamValue(perkId, param?.Name);
  if (def == null) return "";
  const cur = param.IntVal ?? param.FloatVal ?? param.BoolVal;
  if (String(cur) === String(def)) return `default ${def}`;
  return `default ${def}`;
}

/** Reset one parameter to the library default (if known). */
export function resetParamToDefault(perkId, param) {
  const tmpl = defaults.get(perkId);
  if (!tmpl || !param?.Name) return false;
  const list = [...(tmpl.Parameters || []), ...(tmpl.AIParameters || [])];
  const src = list.find((x) => x.Name === param.Name);
  if (!src) return false;
  param.ValType = src.ValType;
  delete param.IntVal;
  delete param.FloatVal;
  delete param.BoolVal;
  if (src.IntVal != null) param.IntVal = src.IntVal;
  if (src.FloatVal != null) param.FloatVal = src.FloatVal;
  if (src.BoolVal != null) param.BoolVal = src.BoolVal;
  return true;
}

/** Replace all Parameters/AIParameters on a perk from defaults (keeps PerkId). */
export function resetPerkToDefaults(perk) {
  const tmpl = perkDefaultTemplate(perk?.PerkId);
  if (!tmpl || !perk) return false;
  perk.Parameters = tmpl.Parameters || [];
  perk.AIParameters = tmpl.AIParameters || [];
  if (tmpl.MaxExp != null) perk.MaxExp = tmpl.MaxExp;
  if (tmpl.ExpPerAction != null) perk.ExpPerAction = tmpl.ExpPerAction;
  if (tmpl.NextPerkId !== undefined) perk.NextPerkId = tmpl.NextPerkId;
  if (tmpl.LevelUpActionType) perk.LevelUpActionType = tmpl.LevelUpActionType;
  return true;
}

export function getRankLibrary() {
  return ranks;
}

export function getPerkDefaults() {
  return defaults;
}

export function getPerkFamilies() {
  return byBase;
}

const TIER_ORDER = ["legend", "master", "advanced", "basic", "bare"];

/**
 * Pick a concrete PerkId + template for a wiki internalName.
 * Prefer library / save templates the user already gathered.
 * @param {string} baseInternalName
 * @param {{ preference?: string, extraCatalog?: Map<string, object>, tierIds?: Record<string,string> }} [opts]
 */
export function resolveClassPerkTemplate(baseInternalName, opts = {}) {
  const base = String(baseInternalName || "");
  if (!base) return null;
  const preference = opts.preference || "highest";
  const extra = opts.extraCatalog || new Map();
  const wikiTiers = opts.tierIds || {};
  const fam = byBase[base] || byBase[base.toLowerCase()] || { base, tiers: {} };
  const candidates = [];

  const pushId = (id, tier) => {
    if (!id || candidates.some((c) => c.id === id)) return;
    candidates.push({ id, tier: tier || perkTierSuffix(id) || "bare" });
  };

  for (const [tier, id] of Object.entries(wikiTiers)) pushId(id, tier);
  for (const [tier, id] of Object.entries(fam.tiers || {})) pushId(id, tier);
  pushId(base, "bare");
  pushId(base.toLowerCase(), "bare");
  for (const t of ["basic", "advanced", "master", "legend"]) {
    pushId(`${base}_${t}`, t);
    pushId(`${base.toLowerCase()}_${t}`, t);
  }

  const hasTemplate = (id) => defaults.has(id) || extra.has(id);

  let chosen = null;
  if (preference !== "highest" && TIER_ORDER.includes(preference)) {
    chosen =
      candidates.find((c) => c.tier === preference && hasTemplate(c.id)) ||
      candidates.find((c) => c.tier === preference) ||
      null;
  }
  if (!chosen) {
    for (const tier of TIER_ORDER) {
      const hit = candidates.find((c) => c.tier === tier && hasTemplate(c.id));
      if (hit) {
        chosen = hit;
        break;
      }
    }
  }
  if (!chosen) chosen = candidates.find((c) => hasTemplate(c.id)) || candidates[0] || null;
  if (!chosen) return null;

  const tmpl = perkDefaultTemplate(chosen.id) || (extra.has(chosen.id) ? deepClone(extra.get(chosen.id)) : null);
  return {
    perkId: chosen.id,
    tier: chosen.tier,
    template: tmpl,
    fromLibrary: !!tmpl,
  };
}
