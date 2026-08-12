/**
 * Item catalogs: spawnable IDs, quest exclusions, display names.
 */

let spawnableIds = [];
let questIds = new Set();
/** @type {Map<string, string>} id -> display name */
const idToName = new Map();
/** @type {Map<string, string[]>} display name -> ids */
const nameToIds = new Map();

export function isQuestItem(id) {
  if (!id) return false;
  const lower = String(id).toLowerCase();
  if (lower.includes("quest")) return true;
  return questIds.has(id) || questIds.has(lower);
}

export function displayName(id) {
  return idToName.get(id) || id;
}

export function getSpawnableIds() {
  return spawnableIds;
}

export function getQuestIds() {
  return [...questIds];
}

export function searchCatalog(query, limitOrOpts = 50) {
  const opts = typeof limitOrOpts === "number" ? { limit: limitOrOpts, offset: 0 } : limitOrOpts || {};
  const limit = opts.limit ?? 80;
  const offset = opts.offset ?? 0;
  const q = (query || "").trim().toLowerCase();
  const matched = [];
  for (const id of spawnableIds) {
    const name = displayName(id);
    if (!q || id.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
      matched.push({ id, name });
    }
  }
  return {
    items: matched.slice(offset, offset + limit),
    total: matched.length,
    offset,
    hasMore: offset + limit < matched.length,
  };
}

function parseNameLine(line) {
  // "Display Name item_id exact|documented ..."
  const m = line.match(/^(.+?) (\S+) (exact|documented)\b/);
  if (!m) return null;
  return { name: m[1].trim(), id: m[2] };
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.text();
}

export async function loadCatalogs({ spawnableUrl = "data/spawnableItems.txt", questUrl = "data/questItems.txt", namesUrl = "data/quasimorph Item name.txt" } = {}) {
  const [spawnText, questText, namesText] = await Promise.all([
    fetchText(spawnableUrl).catch(() => ""),
    fetchText(questUrl).catch(() => ""),
    fetchText(namesUrl).catch(() => ""),
  ]);

  spawnableIds = spawnText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  questIds = new Set(
    questText
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^\*/, ""))
      .filter(Boolean)
  );

  idToName.clear();
  nameToIds.clear();
  for (const line of namesText.split(/\r?\n/)) {
    if (!line || line.startsWith("display_name")) continue;
    const parsed = parseNameLine(line);
    if (!parsed) continue;
    idToName.set(parsed.id, parsed.name);
    if (!nameToIds.has(parsed.name)) nameToIds.set(parsed.name, []);
    nameToIds.get(parsed.name).push(parsed.id);
  }

  // If spawnable file empty, fall back to name catalog ids
  if (!spawnableIds.length) {
    spawnableIds = [...idToName.keys()].filter((id) => !isQuestItem(id));
  }

  return {
    spawnableCount: spawnableIds.length,
    questCount: questIds.size,
    nameCount: idToName.size,
  };
}

/**
 * Union item Ids found in a loaded save into the spawnable catalog (quest items excluded).
 * Walks PickupItem nodes in cargo, merc inventories, etc.
 * @returns {number} how many new ids were added
 */
export function mergeSpawnableFromSave(data) {
  if (!data) return 0;
  const seen = new Set(spawnableIds);
  const added = [];
  function walk(o) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x);
      return;
    }
    if (o.Type === "MGSC.PickupItem" && o.Content?.Id) {
      const id = String(o.Content.Id);
      if (id && !seen.has(id) && !isQuestItem(id)) {
        seen.add(id);
        added.push(id);
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walk(v);
    }
  }
  walk(data);
  if (!added.length) return 0;
  spawnableIds = [...seen].sort((a, b) => a.localeCompare(b));
  return added.length;
}

/** Allow manual file drop when file:// can't fetch. */
export async function loadCatalogFromFiles({ spawnableFile, questFile, namesFile }) {
  if (spawnableFile) {
    spawnableIds = (await spawnableFile.text())
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (questFile) {
    questIds = new Set(
      (await questFile.text())
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/^\*/, ""))
        .filter(Boolean)
    );
  }
  if (namesFile) {
    const namesText = await namesFile.text();
    idToName.clear();
    for (const line of namesText.split(/\r?\n/)) {
      if (!line || line.startsWith("display_name")) continue;
      const parsed = parseNameLine(line);
      if (!parsed) continue;
      idToName.set(parsed.id, parsed.name);
    }
  }
}
