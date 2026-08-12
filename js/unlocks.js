/**
 * Unlocks + Magnum projects (equipment / merc / class).
 */
import { getComponent, deepClone } from "./parse.js";
import { findMercByDevelopId, copyMercSections, COPY_SECTIONS } from "./merc.js";
import { getPurchasedPerks, addPurchasedPerk } from "./tech.js";

export const EQUIP_TYPES = new Set(["Armor", "Helmet", "Boots", "Leggings", "RangeWeapon", "MeleeWeapon"]);
export const WEAPON_TYPES = new Set(["RangeWeapon", "MeleeWeapon"]);
export const ARMOR_TYPES = new Set(["Armor", "Helmet", "Boots", "Leggings"]);

/** Wiki tech contributions to Weaponry / Arsenal project slots. */
const WEAPON_SLOT_TECHS = [
  { id: "weaponstation_department", add: 2 },
  { id: "wpst_upg_more_weapons", add: 2 },
  { id: "wpst_upg_more_weapons_2", add: 4 },
];
const ARMOR_SLOT_TECHS = [
  { id: "armorstation_department", add: 4 },
  { id: "armst_upg_more_armors", add: 4 },
  { id: "armst_upg_more_armors_2", add: 8 },
];

let unlockBaseline = null;
/** @type {Map<string, object>} */
const equipLib = new Map();

export async function loadUnlockBaseline(url = "data/unlockBaseline.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    unlockBaseline = await res.json();
  } catch {
    unlockBaseline = null;
  }
  return unlockBaseline;
}

export function getUnlockBaseline() {
  return unlockBaseline;
}

export async function loadEquipProjectLibrary(url = "data/equipProjectLibrary.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    equipLib.clear();
    for (const p of data.projects || []) {
      if (p?.DevelopId) equipLib.set(p.DevelopId, p);
    }
  } catch (e) {
    console.warn("equip project library not loaded", e);
    equipLib.clear();
  }
  return equipLib.size;
}

export function getEquipProjectLibrary() {
  return equipLib;
}

export function equipProjectTemplate(developId) {
  const t = equipLib.get(developId);
  return t ? deepClone(t) : null;
}

export function getUnlockLists(data) {
  const merc = getComponent(data, "MGSC.Mercenaries");
  const cargo = getComponent(data, "MGSC.MagnumCargo");
  const prog = getComponent(data, "MGSC.MagnumProgression");
  return {
    UnlockedMercenaries: merc?.UnlockedMercenaries || [],
    UnlockedClasses: merc?.UnlockedClasses || [],
    UnlockedProductionItems: cargo?.UnlockedProductionItems || [],
    purchasedPerks: prog?._purchasedPerks || [],
  };
}

export function restoreFullUnlocks(data) {
  if (!unlockBaseline) throw new Error("Unlock baseline not loaded (need data/unlockBaseline.json from slot 2)");
  const merc = getComponent(data, "MGSC.Mercenaries");
  const cargo = getComponent(data, "MGSC.MagnumCargo");
  const prog = getComponent(data, "MGSC.MagnumProgression");
  if (merc) {
    merc.UnlockedMercenaries = deepClone(unlockBaseline.UnlockedMercenaries);
    merc.UnlockedClasses = deepClone(unlockBaseline.UnlockedClasses);
  }
  if (cargo) cargo.UnlockedProductionItems = deepClone(unlockBaseline.UnlockedProductionItems);
  if (prog) prog._purchasedPerks = deepClone(unlockBaseline.purchasedPerks);
  return getUnlockLists(data);
}

export function getProjects(data) {
  return getComponent(data, "MGSC.MagnumProjects")?.Values || [];
}

export function filterProjects(projects, tab) {
  if (tab === "equipment") return projects.filter((p) => EQUIP_TYPES.has(p.ProjectType));
  if (tab === "mercenary") return projects.filter((p) => p.ProjectType === "Mercenary");
  if (tab === "class") return projects.filter((p) => p.ProjectType === "MercenaryClass");
  return projects;
}

export function isWeaponProject(p) {
  return WEAPON_TYPES.has(p?.ProjectType);
}

export function isArmorProject(p) {
  return ARMOR_TYPES.has(p?.ProjectType);
}

function sumSlotTechs(purchased, techs) {
  const set = new Set(purchased);
  let n = 0;
  for (const t of techs) {
    if (set.has(t.id)) n += t.add;
  }
  return n;
}

/** Estimated Magnum project slot caps from Weaponry / Arsenal techs. */
export function getEquipProjectCaps(data) {
  const purchased = getPurchasedPerks(data);
  return {
    weapons: sumSlotTechs(purchased, WEAPON_SLOT_TECHS),
    armor: sumSlotTechs(purchased, ARMOR_SLOT_TECHS),
    weaponsMax: WEAPON_SLOT_TECHS.reduce((s, t) => s + t.add, 0),
    armorMax: ARMOR_SLOT_TECHS.reduce((s, t) => s + t.add, 0),
  };
}

export function countEquipProjects(data) {
  const list = getProjects(data);
  return {
    weapons: list.filter(isWeaponProject).length,
    armor: list.filter(isArmorProject).length,
  };
}

/** Unlock Arsenal/Weaponry + “more projects” techs (raises in-game slot caps). */
export function unlockMaxEquipProjectSlots(data) {
  let n = 0;
  for (const t of [...WEAPON_SLOT_TECHS, ...ARMOR_SLOT_TECHS]) {
    if (addPurchasedPerk(data, t.id)) n++;
  }
  return n;
}

export function instantFinishProject(p) {
  if (p.StartTime != null) p.FinishTime = p.StartTime;
  p.IsInDevelopment = "False";
}

export function instantFinishProjects(projects) {
  for (const p of projects) instantFinishProject(p);
  return projects.length;
}

export function deleteProjects(data, toDelete) {
  const root = getComponent(data, "MGSC.MagnumProjects");
  if (!root?.Values) return 0;
  const set = new Set(toDelete);
  const before = root.Values.length;
  root.Values = root.Values.filter((p) => !set.has(p));
  return before - root.Values.length;
}

/**
 * Add or replace an equipment project from a template.
 * @returns {{ ok: boolean, message: string, project?: object }}
 */
export function addEquipProject(data, developId, { replace = false, force = false } = {}) {
  const tmpl = equipProjectTemplate(developId);
  if (!tmpl) return { ok: false, message: `No template for ${developId}` };
  const root = getComponent(data, "MGSC.MagnumProjects");
  if (!root) return { ok: false, message: "MagnumProjects missing" };
  if (!Array.isArray(root.Values)) root.Values = [];

  const existingIdx = root.Values.findIndex((p) => p.DevelopId === developId && EQUIP_TYPES.has(p.ProjectType));
  if (existingIdx >= 0) {
    if (!replace) return { ok: false, message: `${developId} already in projects (use Replace)` };
    root.Values[existingIdx] = deepClone(tmpl);
    instantFinishProject(root.Values[existingIdx]);
    return { ok: true, message: `Replaced ${developId}`, project: root.Values[existingIdx] };
  }

  if (!force) {
    const caps = getEquipProjectCaps(data);
    const counts = countEquipProjects(data);
    if (isWeaponProject(tmpl) && caps.weapons > 0 && counts.weapons >= caps.weapons) {
      return {
        ok: false,
        message: `Weapon project cap ${counts.weapons}/${caps.weapons}. Unlock more Weaponry slots or use Force add.`,
      };
    }
    if (isArmorProject(tmpl) && caps.armor > 0 && counts.armor >= caps.armor) {
      return {
        ok: false,
        message: `Armor project cap ${counts.armor}/${caps.armor}. Unlock more Arsenal slots or use Force add.`,
      };
    }
  }

  const project = deepClone(tmpl);
  instantFinishProject(project);
  root.Values.push(project);
  return { ok: true, message: `Added ${developId}`, project };
}

export function copyEquipMods(source, targets) {
  let n = 0;
  for (const t of targets) {
    if (t === source) continue;
    t.AppliedModifications = deepClone(source.AppliedModifications || []);
    t.UpcomingModifications = deepClone(source.UpcomingModifications || []);
    t.ModificationsCount = String(t.AppliedModifications.length);
    t.UpcomingModificationsCount = String((t.UpcomingModifications || []).length);
    t.CachedItems = deepClone(source.CachedItems || []);
    n++;
  }
  return n;
}

export function copyClassMods(source, targets) {
  let n = 0;
  for (const t of targets) {
    if (t === source) continue;
    t.AppliedModifications = deepClone(source.AppliedModifications || []);
    t.UpcomingModifications = deepClone(source.UpcomingModifications || []);
    t.ModificationsCount = source.ModificationsCount;
    t.UpcomingModificationsCount = source.UpcomingModificationsCount;
    n++;
  }
  return n;
}

/** Copy buffed merc CreatureData kit matching a Mercenary project DevelopId. */
export function copyMercKitFromProject(data, sourceProject, targetProjects) {
  const sourceMerc = findMercByDevelopId(data, sourceProject.DevelopId);
  if (!sourceMerc) throw new Error(`No merc found for ${sourceProject.DevelopId}`);
  const targets = [];
  for (const p of targetProjects) {
    const m = findMercByDevelopId(data, p.DevelopId);
    if (m && m !== sourceMerc) targets.push(m);
  }
  const sections = COPY_SECTIONS.map((s) => s.id);
  return copyMercSections(sourceMerc, targets, sections, data);
}
