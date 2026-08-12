/**
 * Magnum technology tree unlocks (_purchasedPerks).
 */
import { getComponent, deepClone } from "./parse.js";

/** @type {Map<string, object>} */
const byId = new Map();
/** @type {object[]} */
let techList = [];
/** @type {object[]} */
let trees = [];

export async function loadTechLibrary(url = "data/techLibrary.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    techList = data.techs || [];
    trees = data.trees || [];
    byId.clear();
    for (const t of techList) {
      if (t.internalName) byId.set(t.internalName, t);
    }
    for (const [id, t] of Object.entries(data.byInternalName || {})) {
      byId.set(id, t);
    }
  } catch (e) {
    console.warn("tech library not loaded", e);
    techList = [];
    byId.clear();
  }
  return techList.length;
}

export function getTechLibrary() {
  return techList;
}

export function getTechTrees() {
  return trees;
}

export function techInfo(id) {
  return byId.get(id) || null;
}

export function techLabel(id) {
  const t = techInfo(id);
  if (!t) return id || "";
  const mod = t.module || t.department;
  return mod ? `${t.wikiTitle} · ${mod} (${id})` : `${t.wikiTitle} (${id})`;
}

export function techSummary(id) {
  const t = techInfo(id);
  if (!t) return null;
  const bits = [];
  if (t.module) bits.push(t.module);
  if (t.department) bits.push(t.department);
  if (t.effect) bits.push(t.effect);
  return bits.join(" · ");
}

export function getPurchasedPerks(data) {
  const prog = getComponent(data, "MGSC.MagnumProgression");
  if (!prog) return [];
  if (!Array.isArray(prog._purchasedPerks)) prog._purchasedPerks = [];
  return prog._purchasedPerks;
}

export function setPurchasedPerks(data, ids) {
  const prog = getComponent(data, "MGSC.MagnumProgression");
  if (!prog) return false;
  prog._purchasedPerks = [...new Set(ids.filter(Boolean))];
  return true;
}

export function addPurchasedPerk(data, id) {
  const list = getPurchasedPerks(data);
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

export function removePurchasedPerk(data, id) {
  const prog = getComponent(data, "MGSC.MagnumProgression");
  if (!prog || !Array.isArray(prog._purchasedPerks)) return false;
  const before = prog._purchasedPerks.length;
  prog._purchasedPerks = prog._purchasedPerks.filter((x) => x !== id);
  return prog._purchasedPerks.length !== before;
}

/** Unlock every tech present in the wiki library. */
export function unlockAllTechs(data) {
  const ids = techList.map((t) => t.internalName).filter(Boolean);
  const existing = new Set(getPurchasedPerks(data));
  let n = 0;
  for (const id of ids) {
    if (!existing.has(id)) {
      existing.add(id);
      n++;
    }
  }
  setPurchasedPerks(data, [...existing]);
  return n;
}

export function unlockTechsByModule(data, moduleName) {
  const ids = techList
    .filter((t) => t.module === moduleName || t.department === moduleName)
    .map((t) => t.internalName)
    .filter(Boolean);
  let n = 0;
  for (const id of ids) {
    if (addPurchasedPerk(data, id)) n++;
  }
  return n;
}

export function filterTechs(query = "", module = "") {
  const q = String(query || "").trim().toLowerCase();
  return techList.filter((t) => {
    if (module && t.module !== module && t.department !== module) return false;
    if (!q) return true;
    const hay = [t.wikiTitle, t.internalName, t.effect, t.module, t.department, t.subtitle]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function cloneTechList() {
  return deepClone(techList);
}
