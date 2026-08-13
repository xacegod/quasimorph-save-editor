/**
 * Mercenary class roster + class perk wiki details.
 */
/** @type {Map<string, object>} classId -> class info */
const byId = new Map();
/** @type {Map<string, object>} internalName / PerkId -> perk wiki info */
const perkByInternal = new Map();
/** @type {Map<string, object>} wiki title -> perk wiki info */
const perkByTitle = new Map();
/** @type {object[]} */
let classList = [];

/** Save ids that map to a wiki classIdGuess (Martian Mech Inf is `martian_mech` in sessions). */
const CLASS_ID_ALIASES = {
  martian_mech: "martian_mech_inf",
};

export function canonicalClassId(classId) {
  if (!classId) return classId;
  const s = String(classId);
  return CLASS_ID_ALIASES[s] || CLASS_ID_ALIASES[s.toLowerCase()] || s;
}

export async function loadMercClasses(
  classUrl = "data/mercClasses.json",
  perkUrl = "data/classPerkLibrary.json"
) {
  try {
    const [classRes, perkRes] = await Promise.all([
      fetch(classUrl),
      fetch(perkUrl).catch(() => null),
    ]);
    if (!classRes.ok) throw new Error(String(classRes.status));
    const data = await classRes.json();
    classList = data.classes || [];
    byId.clear();
    for (const c of classList) {
      if (c.classIdGuess) byId.set(c.classIdGuess, c);
    }
    for (const [alias, canon] of Object.entries(CLASS_ID_ALIASES)) {
      const info = byId.get(canon);
      if (info) byId.set(alias, info);
    }

    perkByInternal.clear();
    perkByTitle.clear();
    if (perkRes?.ok) {
      const perkData = await perkRes.json();
      const list = perkData.perks || [];
      for (const p of list) {
        if (p.internalName) perkByInternal.set(p.internalName, p);
        if (p.wikiTitle) perkByTitle.set(p.wikiTitle, p);
      }
      // Prefer byInternalName map if present
      for (const [id, p] of Object.entries(perkData.byInternalName || {})) {
        perkByInternal.set(id, p);
      }
    }
  } catch (e) {
    console.warn("merc classes not loaded", e);
    classList = [];
    byId.clear();
  }
  return classList.length;
}

export function getMercClasses() {
  return classList;
}

export function mercClassInfo(classId) {
  if (!classId) return null;
  return (
    byId.get(classId) ||
    byId.get(String(classId).toLowerCase()) ||
    byId.get(canonicalClassId(classId)) ||
    null
  );
}

export function mercClassLabel(classId) {
  const info = mercClassInfo(classId);
  if (!info) return classId || "";
  const canon = info.classIdGuess;
  if (canon && canon !== classId) return `${info.wikiTitle} (${classId} → ${canon})`;
  return `${info.wikiTitle} (${classId})`;
}

function baseInternalName(perkIdOrTitle) {
  return String(perkIdOrTitle || "").replace(/_(basic|advanced|master|legend)$/i, "");
}

function wikiTierFromPerkId(perkId) {
  const m = String(perkId || "").match(/_(basic|advanced|master|legend)$/i);
  if (!m) return null;
  const t = m[1].toLowerCase();
  if (t === "basic") return "1";
  if (t === "advanced") return "2";
  if (t === "master") return "3";
  if (t === "legend") return "4";
  return null;
}

export function classPerkInfo(perkIdOrTitle) {
  if (!perkIdOrTitle) return null;
  return (
    perkByInternal.get(perkIdOrTitle) ||
    perkByInternal.get(baseInternalName(perkIdOrTitle)) ||
    perkByTitle.get(perkIdOrTitle) ||
    null
  );
}

export function classPerkSummary(perkIdOrTitle) {
  const p = classPerkInfo(perkIdOrTitle);
  if (!p) return null;
  const bits = [];
  if (p.mainClass) bits.push(p.mainClass);
  if (p.perkTrigger) bits.push(p.perkTrigger);
  if (p.expGain) bits.push(p.expGain);
  const tierKey = wikiTierFromPerkId(perkIdOrTitle);
  const tierEffect = tierKey ? p.effects?.[tierKey] : null;
  if (tierEffect) {
    bits.push(`This tier: ${tierEffect}`);
  } else {
    const e1 = p.effects?.["1"];
    const e4 = p.effects?.["4"];
    if (e1) bits.push(`T1: ${e1}`);
    if (e4 && e4 !== e1) bits.push(`T4: ${e4}`);
  }
  const cd = tierKey ? p.cooldown?.[tierKey] : null;
  if (cd) bits.push(`Cooldown ${cd}`);
  return bits.join(" · ");
}

function truncateFlavor(s, max = 72) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function humanizePerkId(perkId) {
  const id = String(perkId || "");
  const m = id.match(/^(.*?)(?:_(basic|advanced|master|legend))?$/i);
  const base = (m?.[1] || id).replace(/_/g, " ");
  const titled = base.replace(/\b\w/g, (c) => c.toUpperCase());
  const tier = m?.[2] ? m[2].toLowerCase() : null;
  return tier ? `${titled} [${tier}]` : titled;
}

/**
 * Compact human label for Passive/Trigger dropdowns.
 * Example: "Berserkgang · Trigger · Regen +10… [Eclipse Blades] (berserkgang_legend)"
 */
export function classPerkDropdownLabel(perkId) {
  if (!perkId) return "";
  const p = classPerkInfo(perkId);
  const tier = wikiTierFromPerkId(perkId);
  if (!p) return `${humanizePerkId(perkId)} (${perkId})`;

  const bits = [p.wikiTitle || humanizePerkId(perkId)];
  if (p.mainClass) bits.push(p.mainClass);
  const effect =
    (tier && p.effects?.[tier]) ||
    p.effects?.["4"] ||
    p.effects?.["1"] ||
    p.perkTrigger ||
    "";
  if (effect) bits.push(truncateFlavor(effect, 56));
  if (p.mercClasses?.length) {
    bits.push(`[${p.mercClasses.slice(0, 2).join(", ")}${p.mercClasses.length > 2 ? "…" : ""}]`);
  }
  return `${bits.join(" · ")} (${perkId})`;
}

/** Extra searchable flavor strings for a perk id. */
export function classPerkSearchText(perkId) {
  const p = classPerkInfo(perkId);
  if (!p) return [humanizePerkId(perkId)];
  return [
    p.wikiTitle,
    p.mainClass,
    p.perkTrigger,
    p.expGain,
    ...(p.mercClasses || []),
    ...Object.values(p.effects || {}),
    humanizePerkId(perkId),
  ].filter(Boolean);
}


/** List of perk labels for a class (enriched when scrape finished). */
export function mercClassPerkLabels(classId) {
  const info = mercClassInfo(classId);
  if (!info) return [];
  const list = info.perks || info.wikiPerks || [];
  return list.map((p) => {
    const title = p.wikiTitle || p.Name || p.name;
    const id = p.internalName;
    if (id && title) return `${title} (${id})`;
    return title || id || "?";
  });
}

/** Base internal names for wiki class Passive/Trigger perks. */
export function mercClassPerkBases(classId) {
  const info = mercClassInfo(classId);
  if (!info) return [];
  return (info.perks || [])
    .map((p) => p.internalName)
    .filter(Boolean)
    .map((id) => baseInternalName(id));
}

function stubClassPerk(wikiPerk, perkId) {
  const type = /trigger/i.test(wikiPerk?.mainClass || "") ? "Trigger" : "Passive";
  return {
    Parameters: [],
    AIParameters: [],
    PerkId: perkId,
    NextPerkId: {},
    LevelUpActionType: "None",
    CurrentExp: "0",
    ExpPerAction: "0",
    MaxExp: "0",
    PerkType: type,
  };
}

/**
 * Change MercClassId and optionally swap wiki class Passive/Trigger perks.
 * Keeps Talent, Ultimate, Rank, and any Passive/Trigger not on the old class roster.
 *
 * @param {object} merc
 * @param {string} classId
 * @param {{
 *   replaceClassPerks?: boolean,
 *   tierPreference?: string,
 *   resolveTemplate?: (base: string, wikiPerk: object) => { perkId: string, template?: object|null, fromLibrary?: boolean },
 * }} [opts]
 */
export function applyMercClass(merc, classId, opts = {}) {
  if (!merc?.CreatureData || !classId) {
    return { ok: false, message: "Missing merc or class id" };
  }
  const nextInfo = mercClassInfo(classId);
  if (!nextInfo) {
    return { ok: false, message: `Unknown class id: ${classId}` };
  }

  const prevId = typeof merc.MercClassId === "string" ? merc.MercClassId : "";
  const replace = opts.replaceClassPerks !== false;
  const resolveTemplate = opts.resolveTemplate;

  const oldBases = new Set(mercClassPerkBases(prevId));
  const newPerksMeta = nextInfo.perks || [];

  merc.MercClassId = classId;

  if (!replace) {
    return {
      ok: true,
      classId,
      prevId,
      replacedPerks: false,
      added: [],
      removed: [],
      stubs: [],
      message: `Class set to ${nextInfo.wikiTitle} (${classId}); kept existing passives/triggers`,
    };
  }

  const kept = [];
  const removed = [];
  for (const p of merc.CreatureData.Perks || []) {
    if (p.PerkType !== "Passive" && p.PerkType !== "Trigger") {
      kept.push(p);
      continue;
    }
    const base = baseInternalName(p.PerkId);
    // Drop old-class roster perks; keep custom / stacked extras
    if (prevId && oldBases.has(base)) {
      removed.push(p.PerkId);
      continue;
    }
    // Also drop if already in the new class roster (will re-add at chosen tier)
    if (newPerksMeta.some((w) => baseInternalName(w.internalName) === base)) {
      removed.push(p.PerkId);
      continue;
    }
    kept.push(p);
  }

  const added = [];
  const stubs = [];
  const seenBases = new Set();
  for (const wikiPerk of newPerksMeta) {
    const base = wikiPerk.internalName;
    if (!base) continue;
    const baseKey = baseInternalName(base);
    if (seenBases.has(baseKey.toLowerCase())) continue;
    seenBases.add(baseKey.toLowerCase());

    let resolved = resolveTemplate
      ? resolveTemplate(base, wikiPerk)
      : { perkId: base, template: null, fromLibrary: false };
    if (!resolved?.perkId) resolved = { perkId: base, template: null, fromLibrary: false };

    let perkObj = resolved.template;
    if (!perkObj) {
      perkObj = stubClassPerk(wikiPerk, resolved.perkId);
      stubs.push(resolved.perkId);
    } else {
      perkObj = {
        ...perkObj,
        PerkId: resolved.perkId,
        PerkType: perkObj.PerkType || stubClassPerk(wikiPerk, resolved.perkId).PerkType,
      };
    }
    kept.push(perkObj);
    added.push(resolved.perkId);
  }

  merc.CreatureData.Perks = kept;
  const stubNote = stubs.length ? `; ${stubs.length} without param templates (empty Parameters)` : "";
  return {
    ok: true,
    classId,
    prevId,
    replacedPerks: true,
    added,
    removed,
    stubs,
    message: `Class → ${nextInfo.wikiTitle}: +${added.length} class perks, −${removed.length} old${stubNote}`,
  };
}
