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
/** @type {Record<string, string>} ProjectType -> DevelopId */
let bestByTypeIndex = {};

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
    bestByTypeIndex = data.bestByType || {};
  } catch (e) {
    console.warn("equip project library not loaded", e);
    equipLib.clear();
    bestByTypeIndex = {};
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

export function copyEquipMods(source, targets, { includeCached = false } = {}) {
  let n = 0;
  for (const t of targets) {
    if (t === source) continue;
    t.AppliedModifications = deepClone(source.AppliedModifications || []);
    t.UpcomingModifications = deepClone(source.UpcomingModifications || []);
    t.ModificationsCount = String(t.AppliedModifications.length);
    t.UpcomingModificationsCount = String((t.UpcomingModifications || []).length);
    if (includeCached) t.CachedItems = deepClone(source.CachedItems || []);
    n++;
  }
  return n;
}

function modTemplateScore(p) {
  let s = (p.AppliedModifications?.length || 0) * 1000;
  for (const m of p.AppliedModifications || []) {
    const v = parseFloat(m.Value);
    if (!Number.isNaN(v)) s += Math.abs(v);
  }
  return s;
}

/** Modded templates only, best-first within each ProjectType. */
export function listModdedEquipTemplates() {
  return [...equipLib.values()]
    .filter((p) => (p.AppliedModifications || []).length > 0)
    .sort(
      (a, b) =>
        a.ProjectType.localeCompare(b.ProjectType) ||
        modTemplateScore(b) - modTemplateScore(a) ||
        a.DevelopId.localeCompare(b.DevelopId)
    );
}

/** Highest-scoring buffed template for a ProjectType (Helmet, Armor, …). */
export function bestEquipModTemplate(projectType) {
  const indexed = bestByTypeIndex[projectType];
  if (indexed && equipLib.has(indexed)) return deepClone(equipLib.get(indexed));
  let best = null;
  let bestScore = -1;
  for (const p of equipLib.values()) {
    if (p.ProjectType !== projectType) continue;
    const s = modTemplateScore(p);
    if (s <= 0) continue;
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best ? deepClone(best) : null;
}

/** One ★ profile per ProjectType (for buff UI defaults). */
export function listBestBuffProfiles() {
  const types = ["Helmet", "Armor", "Boots", "Leggings", "RangeWeapon", "MeleeWeapon"];
  return types.map((t) => bestEquipModTemplate(t)).filter(Boolean);
}

/**
 * True when id could be melee or range (caller should force ProjectType).
 */
export function equipTypeAmbiguous(itemId) {
  const s = String(itemId || "").toLowerCase();
  if (!s) return false;
  const melee =
    /(sword|knife|blade|axe|club|mace|fist|staff|pipe|wrench|crowbar|maul|poleaxe|sickle|baton|dagger|spear|hammer)/.test(s);
  const range =
    /(pistol|smg|assault|shotgun|sniper|marksman|hmg|minigun|crossbow|flamethrower|rifle|rail|plasma|laser|disc|launcher|thrower)/.test(
      s
    );
  return melee && range;
}

/**
 * Guess Magnum ProjectType from an item id (library first, then name heuristics).
 * @returns {string|null}
 */
export function inferEquipProjectType(itemId) {
  const known = equipLib.get(itemId)?.ProjectType;
  if (known) return known;
  const s = String(itemId || "").toLowerCase();
  if (!s) return null;
  if (equipTypeAmbiguous(itemId)) return null;
  if (/(helmet|gasmask|mask|hat|hood|cap)(_|$)/.test(s) || s.includes("_helmet") || s.includes("_gasmask") || s.includes("_mask")) {
    return "Helmet";
  }
  if (/(boots|sneakers|shoes)(_|$)/.test(s) || s.includes("_boots") || s.includes("_sneakers")) return "Boots";
  if (/(pants|leggings)(_|$)/.test(s) || s.includes("_pants") || s.includes("_leggings")) return "Leggings";
  if (
    /(armor|vest|shirt|coat|exoskeleton|plate|jacket|suit)(_|$)/.test(s) ||
    s.includes("_armor") ||
    s.includes("_vest") ||
    s.includes("_shirt") ||
    s.includes("exoskeleton")
  ) {
    return "Armor";
  }
  if (
    /(sword|knife|blade|axe|club|mace|fist|staff|pipe|wrench|crowbar|maul|poleaxe|sickle|baton|dagger|spear|hammer)(_|$)/.test(s) ||
    s.includes("_sword") ||
    s.includes("_knife") ||
    s.includes("_blade") ||
    s.includes("_axe")
  ) {
    return "MeleeWeapon";
  }
  if (
    /(pistol|smg|assault|shotgun|sniper|marksman|hmg|minigun|crossbow|flamethrower|rifle|rail|plasma|laser|disc|launcher|thrower)(_|$)/.test(
      s
    ) ||
    s.includes("_pistol") ||
    s.includes("_smg") ||
    s.includes("_assault") ||
    s.includes("_shotgun") ||
    s.includes("_sniper") ||
    s.includes("_minigun") ||
    s.includes("_hmg")
  ) {
    return "RangeWeapon";
  }
  return null;
}

function bareEquipProject(projectType, developId, mods) {
  const applied = deepClone(mods || []);
  return {
    ProjectType: projectType,
    DevelopId: developId,
    StartTime: "0",
    FinishTime: "0",
    IsInDevelopment: "False",
    ModificationsCount: String(applied.length),
    UpcomingModificationsCount: "0",
    ModifyStartPrice: "0",
    AppliedModifications: applied,
    UpcomingModifications: [],
    CachedItems: [],
  };
}

/**
 * Stamp buff mods from a typed template onto target item ids / projects.
 * Same ProjectType only (Helmet → Helmet, etc.). Does not copy CachedItems.
 *
 * @param {object} data save root
 * @param {{ sourceDevelopId?: string, projectType?: string, explicitProjectType?: string, targetIds?: string[], targets?: object[], force?: boolean, createMissing?: boolean }} opts
 * @returns {{ ok: boolean, message: string, updated: number, created: number, skipped: string[] }}
 */
export function applyEquipBuffMods(data, opts = {}) {
  const {
    sourceDevelopId = "",
    projectType = "",
    explicitProjectType = "",
    targetIds = [],
    targets = [],
    force = false,
    createMissing = true,
  } = opts;

  let source = sourceDevelopId ? equipProjectTemplate(sourceDevelopId) : null;
  if (!source && projectType) source = bestEquipModTemplate(projectType);
  if (!source) {
    return { ok: false, message: "No buffed template (pick a modded source or type)", updated: 0, created: 0, skipped: [] };
  }
  if (!(source.AppliedModifications || []).length) {
    return { ok: false, message: `${source.DevelopId} has no AppliedModifications`, updated: 0, created: 0, skipped: [] };
  }

  const type = source.ProjectType;
  const root = getComponent(data, "MGSC.MagnumProjects");
  if (!root) return { ok: false, message: "MagnumProjects missing", updated: 0, created: 0, skipped: [] };
  if (!Array.isArray(root.Values)) root.Values = [];

  const skipped = [];
  let updated = 0;
  let created = 0;

  const stamp = (project) => {
    project.AppliedModifications = deepClone(source.AppliedModifications || []);
    project.UpcomingModifications = [];
    project.ModificationsCount = String(project.AppliedModifications.length);
    project.UpcomingModificationsCount = "0";
    instantFinishProject(project);
  };

  for (const p of targets) {
    if (!p) continue;
    if (p.ProjectType !== type) {
      skipped.push(`${p.DevelopId} (${p.ProjectType} ≠ ${type})`);
      continue;
    }
    stamp(p);
    updated++;
  }

  for (const rawId of targetIds) {
    const id = String(rawId || "").trim();
    if (!id) continue;
    const inferred = inferEquipProjectType(id);
    if (equipTypeAmbiguous(id) && !explicitProjectType) {
      skipped.push(`${id} (ambiguous melee/range — set ProjectType)`);
      continue;
    }
    if (!inferred && !explicitProjectType && createMissing) {
      skipped.push(`${id} (unknown type — set ProjectType)`);
      continue;
    }
    if (inferred && inferred !== type) {
      skipped.push(`${id} (looks like ${inferred}, buff is ${type})`);
      continue;
    }
    if (explicitProjectType && explicitProjectType !== type) {
      skipped.push(`${id} (forced type ${explicitProjectType} ≠ buff ${type})`);
      continue;
    }
    const existing = root.Values.find((p) => p.DevelopId === id && EQUIP_TYPES.has(p.ProjectType));
    if (existing) {
      if (existing.ProjectType !== type) {
        skipped.push(`${id} (existing project is ${existing.ProjectType})`);
        continue;
      }
      stamp(existing);
      updated++;
      continue;
    }
    if (!createMissing) {
      skipped.push(`${id} (not in projects)`);
      continue;
    }
    if (!force) {
      const caps = getEquipProjectCaps(data);
      const counts = countEquipProjects(data);
      const fake = { ProjectType: type };
      if (isWeaponProject(fake) && caps.weapons > 0 && counts.weapons >= caps.weapons) {
        skipped.push(`${id} (weapon cap ${counts.weapons}/${caps.weapons})`);
        continue;
      }
      if (isArmorProject(fake) && caps.armor > 0 && counts.armor >= caps.armor) {
        skipped.push(`${id} (armor cap ${counts.armor}/${caps.armor})`);
        continue;
      }
    }
    const project = bareEquipProject(type, id, source.AppliedModifications);
    root.Values.push(project);
    created++;
  }

  const message = `Buff from ${source.DevelopId} (${type}): updated ${updated}, created ${created}${
    skipped.length ? `, skipped ${skipped.length}` : ""
  }`;
  return { ok: updated + created > 0, message, updated, created, skipped };
}

/** Apply a buff source (or best-of-type) to every equipment project of that type. */
export function applyBuffToAllOfType(data, projectType, sourceDevelopId = "") {
  const list = getProjects(data).filter((p) => p.ProjectType === projectType);
  return applyEquipBuffMods(data, {
    sourceDevelopId: sourceDevelopId || bestEquipModTemplate(projectType)?.DevelopId || "",
    projectType,
    targets: list,
  });
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
