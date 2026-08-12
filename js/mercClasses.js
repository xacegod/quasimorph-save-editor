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
  return byId.get(classId) || byId.get(String(classId).toLowerCase()) || null;
}

export function mercClassLabel(classId) {
  const info = mercClassInfo(classId);
  if (!info) return classId || "";
  return `${info.wikiTitle} (${classId})`;
}

export function classPerkInfo(perkIdOrTitle) {
  if (!perkIdOrTitle) return null;
  return (
    perkByInternal.get(perkIdOrTitle) ||
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
  const e1 = p.effects?.["1"];
  const e4 = p.effects?.["4"];
  if (e1) bits.push(`T1: ${e1}`);
  if (e4 && e4 !== e1) bits.push(`T4: ${e4}`);
  return bits.join(" · ");
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
