/**
 * Mercenary editing: stats, perks, inventory, copy-to-others, curse, training, wounds.
 */
import { getComponent, deepClone } from "./parse.js";
import { displayName } from "./catalog.js";

/** Core combat stats shown first in the editor. Copied with the Stats section. */
export const CORE_STAT_FIELDS = [
  "BaseHealth",
  "BaseActionPoints",
  "BaseLosLevel",
  "BaseMeleeAccuracy",
  "BaseRangeAccuracy",
  "BaseDodge",
  "StarvationLimit",
  "PainThresholdLimit",
  "PainThresholdBase",
  "PainThresholdRegen",
  "IgnoreStarvation",
  "IgnoreInfection",
  "IgnoreAddiction",
  "IgnoreThrowback",
  "IgnorePain",
  "HasSecondChance",
  "HasUltimate",
  "UpgradePerksCount",
];

/**
 * Baked CreatureData bonuses the game actually uses in combat.
 * These are often written when a merc is active; perk Parameters alone are not enough.
 * Copied with Stats, and also with any perk section.
 */
export const BONUS_STAT_FIELDS = [
  "BaseOverallDmgMult",
  "BaseOverallDodgeMult",
  "OverallResistMult",
  "GrenadeDamageMult",
  "QmorphDamageMult",
  "ReceiveWoundChanceMult",
  "AttackWoundChanceMult",
  "MeleeStunChance",
  "MeleeStunDuration",
  "MeleeThrowbackChance",
  "ReceiveAmputationChance",
  "QmorphResistBonus",
  "WeaponDistanceBonus",
  "CoverHitChanceBonus",
  "CoverBlockChanceBonus",
  "AugResistBonusMult",
  "AugResistDebuffMult",
  "PactCooldownBonus",
  "PerksMaxHealth",
  "PerksMaxPain",
  "PerksPainMult",
  "PerksMaxStarvation",
  "CanFly",
  "Immobile",
  "IgnoreByMonsters",
  "CanBeAllyPushed",
  "IsPushBlocked",
];

export const STAT_FIELDS = [...CORE_STAT_FIELDS, ...BONUS_STAT_FIELDS];

export const EQUIP_SLOTS = [
  "PrimarySlot",
  "SecondarySlot",
  "AdditionalSlot",
  "ServoArmSlot",
  "ArmStumpSlot",
  "BareHandsSlot",
  "BackpackSlot",
  "VestSlot",
  "ArmorSlot",
  "HelmetSlot",
  "LeggingsSlot",
  "BootsSlot",
];

export function getMercenaries(data) {
  return getComponent(data, "MGSC.Mercenaries")?.Values || [];
}

export function mercLabel(m) {
  return `${m.AgentName || "?"} · ${m.ProfileId || ""} · ${m.MercClassId || ""} [${m.State || "None"}]`;
}

export function listPerks(m) {
  return m?.CreatureData?.Perks || [];
}

export function collectPerkCatalog(data) {
  const map = new Map();
  for (const m of getMercenaries(data)) {
    for (const p of listPerks(m)) {
      if (p.PerkId && !map.has(p.PerkId)) map.set(p.PerkId, deepClone(p));
    }
  }
  return map;
}

function nextEffectId(effects) {
  let max = 0;
  for (const e of effects) {
    const n = parseInt(e.Content?.ID, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function remapAugmentEffects(effects, idStart) {
  const idMap = new Map();
  let next = idStart;
  const cloned = deepClone(effects);
  for (const e of cloned) {
    if (e.Content?.ID != null) {
      const old = String(e.Content.ID);
      const neu = String(next++);
      idMap.set(old, neu);
      e.Content.ID = neu;
    }
  }
  for (const e of cloned) {
    for (const key of ["SubEffects", "BonusEffects", "PenaltyEffects"]) {
      if (Array.isArray(e.Content?.[key])) {
        e.Content[key] = e.Content[key].map((id) => idMap.get(String(id)) || id);
      }
    }
  }
  return cloned;
}

function isAugmentEffect(e) {
  if (!e?.Type) return false;
  if (e.Type === "MGSC.ImplicitAugEffect") return true;
  if (e.Type.includes("WoundEffect") && e.Content?.FromAugment === "True") return true;
  return false;
}

function isCoreEffect(e) {
  return (
    e.Type === "MGSC.StarvationEffect" ||
    e.Type === "MGSC.PainThreshold" ||
    e.Type === "MGSC.CurseEffect"
  );
}

export const COPY_SECTIONS = [
  { id: "inventory", label: "Inventory (backpack + equipment)", help: "Deep-clones backpack, vest, and all equipment slots onto the target. Target name/id is kept." },
  { id: "augments", label: "AugmentationMap", help: "Cyborg/body-part slots (BattleCyborgArm → part id)." },
  { id: "woundsockets", label: "WoundSlotMap (implants)", help: "Implant sockets per body slot." },
  { id: "augeffects", label: "Augment effects", help: "FromAugment wound effects + ImplicitAugEffect. IDs are remapped." },
  { id: "classId", label: "Merc class", help: "Copies MercClassId as it currently is (e.g. martian_mech / Martian Mech Inf). Does not change name, gender, or portrait." },
  { id: "rankPerks", label: "Class ranks", help: "PerkType Rank as currently on the source (including custom parameter values). Not reconstructed from defaults." },
  { id: "pactUltimate", label: "Pact / ultimate", help: "Ultimate perk + HasUltimate + skull, copied as they currently are. Prefer absorb/remove via items in-game for full pact flow." },
  { id: "talents", label: "Talents (traits)", help: "PerkType Talent entries as they currently are, including extra parameters you added and edited values." },
  { id: "otherPerks", label: "Passives / triggers", help: "Passive and Trigger perks as they currently are (class or extra). Includes custom parameter mixes." },
  { id: "stats", label: "Stats", help: "Combat stats and baked bonus fields (CanFly, WeaponDistanceBonus, aug resist, …) as they currently are. Does not copy name/gender." },
];

export const PERK_GROUPS = [
  {
    id: "Rank",
    title: "Class ranks",
    types: ["Rank"],
    help: "PerkType <code>Rank</code> — mercenary hierarchy (<code>rank_0</code> Rookie … <code>rank_5</code> Commander). Lower ranks exist; <strong>Max rank</strong> always applies <code>rank_5</code> with the full Commander bonuses (does not require intermediate ranks in the save). You can still Set a specific lower rank from the list.",
  },
  {
    id: "Ultimate",
    title: "Pact ultimates",
    types: ["Ultimate"],
    help: "PerkType <code>Ultimate</code> — one active pact per merc. <strong>Fully reliable here:</strong> edit/remove the ultimate already on the merc (Remove clears skull + <code>HasUltimate</code>; same idea as the in-game Breaking the Pact item). <strong>To gain a different pact:</strong> put the skull in inventory and absorb it in-game — library Set/replace can sync ids for the current ultimate, but full pact activation (banes/charge/etc.) is meant to come from absorb.",
  },
  {
    id: "Talent",
    title: "Talents (traits)",
    types: ["Talent"],
    help: "PerkType <code>Talent</code> — character-tied, <strong>not</strong> a leveling chain (<code>MaxExp</code> stays 0). Game UI normally allows <strong>one</strong>; stacking many Talents in the save has been observed to work. Use Set/replace for a clean single talent, or Add (stack) to keep several. Do not confuse with Rank (class) or Passive (can level).",
  },
  {
    id: "Other",
    title: "Passives and triggers",
    types: ["Passive", "Trigger"],
    help: "PerkType <code>Passive</code> / <code>Trigger</code> — most flexible. Can be class-gained or character-gained; many use exp toward <code>NextPerkId</code>. <strong>Max exp</strong> / <strong>Max tier</strong> available when the save has the next perk template. Difficulty <code>ExpMult</code> scales MaxExp. Remix <code>Parameters</code> only with a valid <code>PerkId</code>. Name prefixes: <code>I*</code> int, <code>F*</code> float, <code>B*</code> bool.",
  },
];

export function perksOfTypes(m, types) {
  const set = new Set(types);
  return (m?.CreatureData?.Perks || []).filter((p) => set.has(p.PerkType));
}

export function replacePerksOfTypes(merc, types, newPerks) {
  const set = new Set(types);
  const kept = (merc.CreatureData.Perks || []).filter((p) => !set.has(p.PerkType));
  merc.CreatureData.Perks = [...kept, ...newPerks.map((p) => deepClone(p))];
}

export function collectPerkCatalogByType(data, perkType) {
  const map = new Map();
  for (const m of getMercenaries(data)) {
    for (const p of listPerks(m)) {
      if (p.PerkType === perkType && p.PerkId && !map.has(p.PerkId)) map.set(p.PerkId, deepClone(p));
    }
  }
  return map;
}

export function collectSkullIds(data) {
  const set = new Set();
  const mercRoot = getComponent(data, "MGSC.Mercenaries");
  for (const x of mercRoot?.MercToUltimateSkulls || []) {
    if (typeof x.Value === "string") set.add(x.Value);
  }
  for (const m of getMercenaries(data)) {
    const id = m.CreatureData?.UltimateSkullItemId;
    if (typeof id === "string" && id) set.add(id);
  }
  return [...set].sort();
}

export function setUltimateSkull(data, merc, skullId) {
  const cd = merc.CreatureData;
  if (!cd) return;
  if (!skullId) {
    cd.UltimateSkullItemId = {};
    cd.HasUltimate = "False";
  } else {
    cd.UltimateSkullItemId = skullId;
    cd.HasUltimate = "True";
  }
  const root = getComponent(data, "MGSC.Mercenaries");
  if (!root) return;
  if (!Array.isArray(root.MercToUltimateSkulls)) root.MercToUltimateSkulls = [];
  const key = merc.ProfileId;
  const row = root.MercToUltimateSkulls.find((x) => x.Key === key);
  if (!skullId) {
    root.MercToUltimateSkulls = root.MercToUltimateSkulls.filter((x) => x.Key !== key);
  } else if (row) {
    row.Value = skullId;
  } else {
    root.MercToUltimateSkulls.push({ Key: key, Value: skullId });
  }
}

function copyScalarFields(src, dest, fields) {
  for (const f of fields) {
    if (src[f] !== undefined) dest[f] = deepClone(src[f]);
  }
}

const PERK_COPY_SECTIONS = ["rankPerks", "talents", "otherPerks", "pactUltimate"];

/**
 * Copy selected sections from source merc onto targets (replace same fields).
 * Perks and stats are cloned as they currently are — not rebuilt from library defaults.
 */
export function copyMercSections(source, targets, sections, data = null) {
  const set = new Set(sections);
  let count = 0;
  const copyAnyPerks = PERK_COPY_SECTIONS.some((id) => set.has(id));
  const copyAllPerks = PERK_COPY_SECTIONS.every((id) => set.has(id));

  for (const dest of targets) {
    if (dest === source) continue;
    const sc = source.CreatureData;
    const dc = dest.CreatureData;
    if (!sc || !dc) continue;

    if (set.has("classId") && source.MercClassId !== undefined) {
      dest.MercClassId = source.MercClassId;
    }
    if (set.has("inventory") && sc.Inventory) {
      dc.Inventory = deepClone(sc.Inventory);
    }
    if (set.has("augments") && sc.AugmentationMap) {
      dc.AugmentationMap = deepClone(sc.AugmentationMap);
    }
    if (set.has("woundsockets") && sc.WoundSlotMap) {
      dc.WoundSlotMap = deepClone(sc.WoundSlotMap);
    }
    if (copyAllPerks) {
      dc.Perks = deepClone(sc.Perks || []);
    } else {
      if (set.has("rankPerks")) {
        replacePerksOfTypes(dest, ["Rank"], perksOfTypes(source, ["Rank"]));
      }
      if (set.has("talents")) {
        replacePerksOfTypes(dest, ["Talent"], perksOfTypes(source, ["Talent"]));
      }
      if (set.has("otherPerks")) {
        replacePerksOfTypes(dest, ["Passive", "Trigger"], perksOfTypes(source, ["Passive", "Trigger"]));
      }
      if (set.has("pactUltimate")) {
        replacePerksOfTypes(dest, ["Ultimate"], perksOfTypes(source, ["Ultimate"]));
      }
    }
    if (set.has("pactUltimate")) {
      if (sc.HasUltimate !== undefined) dc.HasUltimate = sc.HasUltimate;
      if (sc.UltimateSkullItemId !== undefined) dc.UltimateSkullItemId = deepClone(sc.UltimateSkullItemId);
      if (source._pactLevel !== undefined) dest._pactLevel = source._pactLevel;
      const skull = typeof sc.UltimateSkullItemId === "string" ? sc.UltimateSkullItemId : "";
      if (data) setUltimateSkull(data, dest, skull);
    }
    if (set.has("stats")) {
      copyScalarFields(sc, dc, CORE_STAT_FIELDS);
      if (sc.Health) dc.Health = deepClone(sc.Health);
      if (sc.MeleeDamage) dc.MeleeDamage = deepClone(sc.MeleeDamage);
      if (sc.ResistSheet) dc.ResistSheet = deepClone(sc.ResistSheet);
      if (source._pactLevel !== undefined) dest._pactLevel = source._pactLevel;
    }
    if (set.has("stats") || copyAnyPerks) {
      copyScalarFields(sc, dc, BONUS_STAT_FIELDS);
      if (!set.has("stats")) {
        if (sc.Health) dc.Health = deepClone(sc.Health);
        if (sc.MeleeDamage) dc.MeleeDamage = deepClone(sc.MeleeDamage);
        if (sc.UpgradePerksCount !== undefined) dc.UpgradePerksCount = deepClone(sc.UpgradePerksCount);
        if (sc.HasSecondChance !== undefined) dc.HasSecondChance = deepClone(sc.HasSecondChance);
      }
    }
    if (set.has("augeffects") && sc.EffectsController?.Effects && dc.EffectsController?.Effects) {
      const destEffects = dc.EffectsController.Effects;
      const core = destEffects.filter(isCoreEffect);
      const nonAugNonCore = destEffects.filter((e) => !isCoreEffect(e) && !isAugmentEffect(e));
      const srcAug = sc.EffectsController.Effects.filter(isAugmentEffect);
      const remapped = remapAugmentEffects(srcAug, nextEffectId([...core, ...nonAugNonCore]));
      dc.EffectsController.Effects = [...core, ...nonAugNonCore, ...remapped];
    }
    count++;
  }
  return count;
}

export function clearCurse(merc) {
  if (merc?.CreatureData) merc.CreatureData.CurseData = {};
}

export function clearCurseAll(data) {
  for (const m of getMercenaries(data)) clearCurse(m);
}

export function instantFinishTraining(merc) {
  if (merc.State === "Training" && merc.StateStartTime != null) {
    merc.StateEndTime = merc.StateStartTime;
  }
}

export function instantFinishAllTraining(data) {
  let n = 0;
  for (const m of getMercenaries(data)) {
    if (m.State === "Training") {
      instantFinishTraining(m);
      n++;
    }
  }
  return n;
}

/** Remove non-augment wound effects (heal). Keep FromAugment and core effects. */
export function healWounds(merc) {
  const fx = merc?.CreatureData?.EffectsController?.Effects;
  if (!Array.isArray(fx)) return 0;
  const before = fx.length;
  merc.CreatureData.EffectsController.Effects = fx.filter(
    (e) => isCoreEffect(e) || isAugmentEffect(e) || !String(e.Type || "").includes("WoundEffect")
  );
  if (merc.CreatureData.Immunity) merc.CreatureData.Immunity = [];
  return before - merc.CreatureData.EffectsController.Effects.length;
}

export function healAllWounds(data) {
  let n = 0;
  for (const m of getMercenaries(data)) n += healWounds(m);
  return n;
}

export function inventorySummary(m) {
  const inv = m?.CreatureData?.Inventory;
  if (!inv) return [];
  const rows = [];
  const push = (slot, store, it, itemIndex, editable) => {
    const stackComp = (it.Content?._components || []).find((c) => c.Type === "MGSC.StackableItemComponent");
    rows.push({
      slot,
      store,
      item: it,
      itemIndex,
      editable,
      id: it.Content?.Id,
      name: displayName(it.Content?.Id),
      stack: it.Content?.StackCount,
      count: stackComp?.Content?.Count,
      max: stackComp?.Content?.Max,
      stackable: Boolean(stackComp),
    });
  };
  for (const slot of EQUIP_SLOTS) {
    const store = inv[slot];
    (store?.Items || []).forEach((it, i) => push(slot, store, it, i, false));
  }
  for (const storeName of ["BackpackStore", "VestStore"]) {
    const store = inv[storeName];
    (store?.Items || []).forEach((it, i) => push(storeName, store, it, i, true));
  }
  return rows;
}

export function getInventoryStore(m, storeName) {
  return m?.CreatureData?.Inventory?.[storeName] || null;
}

export function findMercByDevelopId(data, developId) {
  const mercs = getMercenaries(data);
  return mercs.find(
    (m) =>
      m.ProfileId === developId ||
      m.ProfileId === `${developId}_custom` ||
      (m.ProfileId || "").replace(/_custom$/, "") === developId
  );
}
