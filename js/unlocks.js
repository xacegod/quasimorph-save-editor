/**
 * Unlocks + Magnum projects.
 */
import { getComponent, deepClone } from "./parse.js";
import { findMercByDevelopId, copyMercSections, COPY_SECTIONS } from "./merc.js";

const EQUIP_TYPES = new Set(["Armor", "Helmet", "Boots", "Leggings", "RangeWeapon", "MeleeWeapon"]);

let unlockBaseline = null;

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

export function instantFinishProject(p) {
  if (p.StartTime != null) p.FinishTime = p.StartTime;
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
