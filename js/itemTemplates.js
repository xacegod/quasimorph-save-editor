/**
 * Infer PickupItem templates from items present in the loaded save.
 */
import { deepClone } from "./parse.js";

/** @type {Map<string, object>} id -> PickupItem wrapper */
const byId = new Map();
/** @type {Map<string, object>} signature -> sample PickupItem */
const bySig = new Map();
/** Persistent union across loads */
const unionById = new Map();
const unionBySig = new Map();

function sigOf(item) {
  const comps = (item?.Content?._components || []).map((c) => c.Type.replace(/^MGSC\./, "")).sort();
  return comps.join("+") || "(none)";
}

function walkItems(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) walkItems(x, visit);
    return;
  }
  if (node.Type === "MGSC.PickupItem" && node.Content) visit(node);
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") walkItems(v, visit);
  }
}

export function indexItemsFromSave(data) {
  byId.clear();
  bySig.clear();
  walkItems(data, (item) => {
    const id = item.Content.Id;
    if (!id) return;
    const preferNonCustom = !String(id).endsWith("_custom");
    const existing = byId.get(id);
    if (!existing || (preferNonCustom && String(existing.Content.Id).endsWith("_custom"))) {
      byId.set(id, item);
    }
    const sig = sigOf(item);
    if (!bySig.has(sig)) bySig.set(sig, item);
    // union
    if (!unionById.has(id) || preferNonCustom) unionById.set(id, item);
    if (!unionBySig.has(sig)) unionBySig.set(sig, item);
  });
  return { uniqueIds: byId.size, signatures: bySig.size, unionIds: unionById.size };
}

function newInstanceId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sanitizeClone(item, { id, qty, pos }) {
  const clone = deepClone(item);
  if (id) clone.Content.Id = id;
  clone.Content.ExaminedItem = "True";
  if (pos != null) clone.Content.InventoryPos = pos;
  if (qty != null) {
    clone.Content.StackCount = String(qty);
    for (const c of clone.Content._components || []) {
      if (c.Type === "MGSC.StackableItemComponent") {
        c.Content.Count = String(qty);
        // Allow Count > Max (game splits stacks)
      }
      if (c.Type === "MGSC.WeaponComponent" && c.Content) {
        if (c.Content.InstanceId) c.Content.InstanceId = newInstanceId();
        c.Content.CurrentAmmo = "0";
        c.Content.LastReloadAmount = "0";
      }
    }
  } else {
    for (const c of clone.Content._components || []) {
      if (c.Type === "MGSC.WeaponComponent" && c.Content?.InstanceId) {
        c.Content.InstanceId = newInstanceId();
      }
    }
  }
  return clone;
}

function findTemplate(sig) {
  return bySig.get(sig) || unionBySig.get(sig) || null;
}

function familySignature(id) {
  const s = id.toLowerCase();
  if (s.endsWith("_chip") || s.includes("_chip")) return "DatadiskComponent";
  if (s.includes("_ammo") || /grenade$|_grenade_/.test(s) || s.endsWith("_grenade")) {
    return "AllowPutInVestItemComp+ExpireComponent+StackableItemComponent";
  }
  if (s.startsWith("skull_")) return "BreakableItemComponent+SkullComponent";
  if (s.includes("backpack")) return "BreakableItemComponent+ExtendedHeightComp";
  if (s.includes("vest") || s.includes("armor") || s.includes("helmet") || s.includes("pants") || s.includes("boots") || s.includes("mask") || s.includes("hat") || s.includes("shirt") || s.includes("coat") || s.includes("cap")) {
    return "BreakableItemComponent";
  }
  if (s.includes("grenade_launcher") || s.includes("rocketlauncher") || s.includes("rocket_launcher")) {
    return "BreakableItemComponent+LauncherComponent+WeaponComponent";
  }
  if (
    /_(pistol|smg|assault|shotgun|sniper|marksman|hmg|minigun|knife|blade|axe|club|mace|fist|sword|staff|pipe|wrench|crowbar|maul|poleaxe|sickle|crossbow|flamethrower|thrower|launcher)_?\d*/.test(s) ||
    s.includes("_pistol") ||
    s.includes("_smg") ||
    s.includes("_assault") ||
    s.includes("_shotgun") ||
    s.includes("_sniper") ||
    s.includes("_knife") ||
    s.includes("_blade") ||
    s.includes("_axe")
  ) {
    return "BreakableItemComponent+WeaponComponent";
  }
  if (s.startsWith("cyborg_") || s.includes("cyborg_") || s.startsWith("mars_cyborg") || s.includes("_hand") || s.includes("_wrist") || s.includes("_leg") || s.includes("_feet") || s.includes("_knee") || s.includes("_guts") || s.includes("_chest") || s.includes("_head")) {
    // Prefer augmentation+weapon if available
    if (findTemplate("AugmentationComponent+BreakableItemComponent+WeaponComponent") && (s.includes("hand") || s.includes("machinegun") || s.includes("blade") || s.includes("drill") || s.includes("claw"))) {
      return "AugmentationComponent+BreakableItemComponent+WeaponComponent";
    }
    if (findTemplate("AugmentationComponent")) return "AugmentationComponent";
  }
  // Implants / bio mods often have empty _components
  const looksStackableJunk =
    /container|ammo|chip|disk|parts|_kit|grenade|mine|bottle|pack|rags|plates|wire|food|meat|syringe|pills_|bandage|module|software|unit|cargo|tank|ore_|biomass|schematic|samples/.test(
      s
    );
  if (!looksStackableJunk && findTemplate("(none)")) return "(none)";
  // stackable families
  const candidates = [
    "AllowPutInVestItemComp+ExpireComponent+StackableItemComponent",
    "ExpireComponent+StackableItemComponent",
    "AllowPutInVestItemComp+StackableItemComponent",
    "ExpireComponent+StackableItemComponent+UsableItemComponent",
    "AllowPutInVestItemComp+ExpireComponent+StackableItemComponent+UsableItemComponent",
  ];
  for (const c of candidates) {
    if (findTemplate(c)) return c;
  }
  return null;
}

export function createThinItem(id, qty = 1, pos = "0 0") {
  return {
    Type: "MGSC.PickupItem",
    Content: {
      StackCount: String(qty),
      _components: [],
      Id: id,
      SingleWeight: "0.1",
      InventoryWidthSize: "1",
      ExaminedItem: "True",
      LockCounter: "0",
      IsUseRestricted: "False",
      InventoryPos: pos,
    },
  };
}

/**
 * @returns {{ item: object, method: 'exact'|'family'|'thin'|'fallback' }}
 */
export function createItemFromTemplates(id, { qty = 1, pos = "0 0", thin = false } = {}) {
  if (thin) {
    return { item: createThinItem(id, qty, pos), method: "thin" };
  }
  const exact = byId.get(id) || unionById.get(id);
  if (exact) {
    return { item: sanitizeClone(exact, { id, qty, pos }), method: "exact" };
  }
  const fam = familySignature(id);
  const tmpl = fam ? findTemplate(fam) : null;
  if (tmpl) {
    return { item: sanitizeClone(tmpl, { id, qty, pos }), method: "family" };
  }
  // fallback: most common stackable
  const fallback =
    findTemplate("AllowPutInVestItemComp+ExpireComponent+StackableItemComponent") ||
    findTemplate("ExpireComponent+StackableItemComponent") ||
    [...bySig.values()][0] ||
    [...unionBySig.values()][0];
  if (fallback) {
    return { item: sanitizeClone(fallback, { id, qty, pos }), method: "fallback" };
  }
  return { item: createThinItem(id, qty, pos), method: "thin" };
}

export function getTemplateStats() {
  return {
    byId: byId.size,
    bySig: bySig.size,
    unionById: unionById.size,
    unionBySig: unionBySig.size,
    signatures: [...bySig.keys()],
  };
}

export function clonePickupItem(item, pos) {
  return sanitizeClone(item, { pos: pos ?? item.Content.InventoryPos });
}
