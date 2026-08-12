/**
 * Magnum cargo: filter, qty, stacks, spawn, destroy, storage height, auto-recycle/fridge.
 */
import { getComponent, deepClone } from "./parse.js";
import { displayName, isQuestItem, getSpawnableIds } from "./catalog.js";
import { createItemFromTemplates, clonePickupItem } from "./itemTemplates.js";

const RECYCLE_LIST_KEY = "qm_always_recycle_ids";

export function getCargo(data) {
  return getComponent(data, "MGSC.MagnumCargo");
}

export function getGameTime(data) {
  return getComponent(data, "MGSC.SpaceTime")?.Time || "0";
}

export function loadRecycleList() {
  try {
    return JSON.parse(localStorage.getItem(RECYCLE_LIST_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveRecycleList(ids) {
  localStorage.setItem(RECYCLE_LIST_KEY, JSON.stringify([...new Set(ids)]));
}

function parsePos(pos) {
  if (!pos || typeof pos !== "string") return { x: 0, y: 0 };
  const [x, y] = pos.split(/\s+/).map(Number);
  return { x: x || 0, y: y || 0 };
}

function formatPos(x, y) {
  return `${x} ${y}`;
}

export function ensureHeight(store, neededCells) {
  const w = Math.max(1, parseInt(store.Width, 10) || 8);
  const h = Math.max(1, parseInt(store.Height, 10) || 1);
  const capacity = w * h;
  if (neededCells <= capacity) return;
  const newH = Math.ceil(neededCells / w);
  if (newH > h) store.Height = String(newH);
}

export function growHeight(store, extraRows) {
  const h = Math.max(1, parseInt(store.Height, 10) || 1);
  store.Height = String(h + Math.max(1, extraRows | 0));
}

function occupiedCells(store) {
  const set = new Set();
  for (const it of store.Items || []) {
    const { x, y } = parsePos(it.Content?.InventoryPos);
    const width = Math.max(1, parseInt(it.Content?.InventoryWidthSize, 10) || 1);
    for (let i = 0; i < width; i++) set.add(`${x + i},${y}`);
  }
  return set;
}

export function findFreePos(store, itemWidth = 1) {
  const w = Math.max(1, parseInt(store.Width, 10) || 8);
  let h = Math.max(1, parseInt(store.Height, 10) || 1);
  const occ = occupiedCells(store);
  const width = Math.max(1, itemWidth | 0);

  for (let attempt = 0; attempt < 3; attempt++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x <= w - width; x++) {
        let ok = true;
        for (let i = 0; i < width; i++) {
          if (occ.has(`${x + i},${y}`)) {
            ok = false;
            break;
          }
        }
        if (ok) return formatPos(x, y);
      }
    }
    // grow height and retry
    h += Math.max(8, Math.ceil((store.Items?.length || 1) / w) || 8);
    store.Height = String(h);
  }
  // last resort
  const y = h;
  store.Height = String(y + 1);
  return formatPos(0, y);
}

export function listCargoEntries(data) {
  const cargo = getCargo(data);
  if (!cargo) return [];
  const rows = [];
  const pushStore = (storeKey, store, storeIndex = null) => {
    if (!store?.Items) return;
    store.Items.forEach((item, itemIndex) => {
      const id = item.Content?.Id || "";
      const stackComp = (item.Content?._components || []).find((c) => c.Type === "MGSC.StackableItemComponent");
      rows.push({
        storeKey,
        storeIndex,
        itemIndex,
        item,
        id,
        name: displayName(id),
        stack: item.Content?.StackCount || "1",
        count: stackComp?.Content?.Count,
        max: stackComp?.Content?.Max,
        pos: item.Content?.InventoryPos,
        quest: isQuestItem(id),
        store,
      });
    });
  };

  (cargo.ShipCargo || []).forEach((s, i) => pushStore(`ShipCargo[${i}]`, s, i));
  pushStore("RecyclingStorage", cargo.RecyclingStorage);
  pushStore("FridgeStorage", cargo.FridgeStorage);
  return rows;
}

export function filterCargoRows(rows, { query = "", store = "", hideQuest = false, onlyQuest = false, newestCargo0 = 0 } = {}) {
  const q = query.trim().toLowerCase();
  let out = rows;
  if (newestCargo0 > 0) {
    // Game appends new loot at the end of ShipCargo[0]. Take those stacks first, then apply text filter.
    out = out.filter((r) => r.storeKey === "ShipCargo[0]").slice(-newestCargo0);
  } else if (store) {
    out = out.filter((r) => r.storeKey === store || (store === "ShipCargo" && r.storeKey.startsWith("ShipCargo")));
  }
  return out.filter((r) => {
    if (hideQuest && r.quest) return false;
    if (onlyQuest && !r.quest) return false;
    if (!q) return true;
    return r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
  });
}

export function uniqueIdsFromRows(rows) {
  return [...new Set(rows.map((r) => r.id).filter(Boolean))];
}

function getStackComp(item) {
  return (item.Content?._components || []).find((c) => c.Type === "MGSC.StackableItemComponent");
}

export function setItemQuantity(item, qty) {
  const n = String(qty);
  item.Content.StackCount = n;
  const sc = getStackComp(item);
  if (sc) sc.Content.Count = n;
  // Count may exceed Max — do not clamp
}

export function deleteRows(rows, { keepQuest = true } = {}) {
  // Group by store and delete high indices first
  const byStore = new Map();
  for (const r of rows) {
    if (keepQuest && r.quest) continue;
    if (!byStore.has(r.store)) byStore.set(r.store, []);
    byStore.get(r.store).push(r.itemIndex);
  }
  let deleted = 0;
  for (const [store, indices] of byStore) {
    const sorted = [...new Set(indices)].sort((a, b) => b - a);
    for (const i of sorted) {
      if (i >= 0 && i < store.Items.length) {
        store.Items.splice(i, 1);
        deleted++;
      }
    }
  }
  return deleted;
}

export function copyStack(row, times = 1) {
  const store = row.store;
  let n = 0;
  for (let i = 0; i < times; i++) {
    const width = parseInt(row.item.Content?.InventoryWidthSize, 10) || 1;
    const pos = findFreePos(store, width);
    const clone = clonePickupItem(row.item, pos);
    store.Items.push(clone);
    n++;
  }
  return n;
}

export function spawnItem(data, id, { qty = 1, count = 1, thin = false, storeIndex = 0 } = {}) {
  const cargo = getCargo(data);
  if (!cargo?.ShipCargo?.length) throw new Error("No ShipCargo");
  const store = cargo.ShipCargo[storeIndex] || cargo.ShipCargo[0];
  const report = { exact: 0, family: 0, fallback: 0, thin: 0 };
  for (let i = 0; i < count; i++) {
    const { item, method } = createItemFromTemplates(id, { qty, thin, pos: "0 0" });
    const width = parseInt(item.Content.InventoryWidthSize, 10) || 1;
    item.Content.InventoryPos = findFreePos(store, width);
    if (!thin) setItemQuantity(item, qty);
    else item.Content.StackCount = String(qty);
    store.Items.push(item);
    report[method] = (report[method] || 0) + 1;
  }
  return report;
}

export function giveOneOfEachIds(data, ids, { storeIndex = 0, qty = 1, onProgress } = {}) {
  const report = { total: ids.length, exact: 0, family: 0, fallback: 0, thin: 0 };
  ids.forEach((id, i) => {
    const r = spawnItem(data, id, { qty, count: 1, thin: false, storeIndex });
    for (const k of Object.keys(r)) report[k] = (report[k] || 0) + r[k];
    if (onProgress && i % 50 === 0) onProgress(i + 1, ids.length);
  });
  return report;
}

export function giveOneOfEach(data, { storeIndex = 0, onProgress } = {}) {
  const ids = getSpawnableIds().filter((id) => !isQuestItem(id));
  return giveOneOfEachIds(data, ids, { storeIndex, qty: 1, onProgress });
}

function moveItemBetweenStores(fromStore, itemIndex, toStore, { freeze = false, gameTime } = {}) {
  const item = fromStore.Items[itemIndex];
  if (!item) return false;
  fromStore.Items.splice(itemIndex, 1);
  const width = parseInt(item.Content?.InventoryWidthSize, 10) || 1;
  // ensure capacity
  const need = (toStore.Items?.length || 0) + 1;
  const w = Math.max(1, parseInt(toStore.Width, 10) || 8);
  const h = Math.max(1, parseInt(toStore.Height, 10) || 1);
  if (need > w * h) toStore.Height = String(Math.ceil(need / w) + 2);
  item.Content.InventoryPos = findFreePos(toStore, width);
  if (freeze) {
    for (const c of item.Content._components || []) {
      if (c.Type === "MGSC.ExpireComponent" && c.Content) {
        c.Content.IsFrozen = "True";
        c.Content.LastFreezeTickTime = String(gameTime || c.Content.LastFreezeTickTime || "0");
      }
    }
  }
  toStore.Items.push(item);
  return true;
}

export function moveMatchingToRecycler(data, idList, { keepQuest = true } = {}) {
  const cargo = getCargo(data);
  if (!cargo) return 0;
  const set = new Set(idList);
  let moved = 0;
  for (const store of cargo.ShipCargo || []) {
    for (let i = store.Items.length - 1; i >= 0; i--) {
      const id = store.Items[i].Content?.Id;
      if (keepQuest && isQuestItem(id)) continue;
      if (!set.has(id)) continue;
      if (moveItemBetweenStores(store, i, cargo.RecyclingStorage)) moved++;
    }
  }
  return moved;
}

export function spoilReason(item, gameTime) {
  const id = item.Content?.Id || "";
  if (/rotten/i.test(id)) return `id "${id}" contains "rotten"`;
  const ex = (item.Content?._components || []).find((c) => c.Type === "MGSC.ExpireComponent");
  if (!ex?.Content) return null;
  if (ex.Content.IsFrozen === "True") return null;
  if (ex.Content.IsStarted !== "True") return null;
  try {
    if (BigInt(ex.Content.ExpireDate || "0") < BigInt(gameTime || "0")) {
      return `ExpireDate ${ex.Content.ExpireDate} is before game time ${gameTime} (timer already started)`;
    }
  } catch {
    return null;
  }
  return null;
}

function isSpoiled(item, gameTime) {
  return Boolean(spoilReason(item, gameTime));
}

export function moveSpoilablesToFridge(data, { keepQuest = true } = {}) {
  const cargo = getCargo(data);
  if (!cargo) return 0;
  const time = getGameTime(data);
  let moved = 0;
  for (const store of cargo.ShipCargo || []) {
    for (let i = store.Items.length - 1; i >= 0; i--) {
      const item = store.Items[i];
      const id = item.Content?.Id;
      if (keepQuest && isQuestItem(id)) continue;
      if (!isSpoiled(item, time)) continue;
      if (moveItemBetweenStores(store, i, cargo.FridgeStorage, { freeze: true, gameTime: time })) moved++;
    }
  }
  return moved;
}

export function moveRowsToStore(rows, destStore, { freeze = false, gameTime } = {}) {
  // Sort by store then index descending
  const sorted = [...rows].sort((a, b) => {
    if (a.store !== b.store) return 0;
    return b.itemIndex - a.itemIndex;
  });
  let moved = 0;
  const seen = new Set();
  for (const r of sorted) {
    const key = `${r.storeKey}:${r.itemIndex}`;
    // re-find item by identity after previous splices — use item ref
    const idx = r.store.Items.indexOf(r.item);
    if (idx < 0 || seen.has(r.item)) continue;
    seen.add(r.item);
    if (moveItemBetweenStores(r.store, idx, destStore, { freeze, gameTime })) moved++;
  }
  return moved;
}

const STORE_HELP = {
  "ShipCargo[0]": "Magnum cargo tab 0 (general / first hold). This is usually the huge dump. Capacity = Width × Height cells.",
  "ShipCargo[1]": "Magnum cargo tab 1 (often weapons). Same Width×Height grid as other tabs.",
  "ShipCargo[2]": "Magnum cargo tab 2 (often armor).",
  "ShipCargo[3]": "Magnum cargo tab 3 (often ammo/chips).",
  "ShipCargo[4]": "Magnum cargo tab 4.",
  "ShipCargo[5]": "Magnum cargo tab 5.",
  "ShipCargo[6]": "Magnum cargo tab 6.",
  RecyclingStorage: "Recycler grid on the ship. Small by default (e.g. 8×5). Grow Height so more junk fits.",
  FridgeStorage: "Fridge grid. Small by default (e.g. 8×4). Grow Height to auto-store more spoilables.",
};

export function listStorageSizes(data) {
  const cargo = getCargo(data);
  const prog = getComponent(data, "MGSC.MagnumProgression");
  const rows = [];
  if (!cargo) return rows;
  const push = (key, store, group, help) => {
    if (!store) return;
    const width = parseInt(store.Width, 10) || 0;
    const height = parseInt(store.Height, 10) || 0;
    rows.push({
      key,
      label: key,
      group,
      help: help || STORE_HELP[key] || "",
      store,
      width: store.Width,
      height: store.Height,
      capacity: width * height,
      items: store.Items?.length || 0,
    });
  };
  (cargo.ShipCargo || []).forEach((s, i) => push(`ShipCargo[${i}]`, s, "Magnum cargo tabs"));
  push("RecyclingStorage", cargo.RecyclingStorage, "Ship utilities");
  push("FridgeStorage", cargo.FridgeStorage, "Ship utilities");

  for (const dep of prog?._departments || []) {
    const c = dep.Content || {};
    const depName = String(dep.Type || "").replace(/^MGSC\./, "");
    for (const [k, v] of Object.entries(c)) {
      if (v && typeof v === "object" && v.Height != null && Array.isArray(v.Items)) {
        push(
          `${depName}.${k}`,
          v,
          "Departments (shuttle / capsule)",
          k.includes("Shuttle")
            ? "Shuttle trade hold. Raise Height so the shuttle can carry much more."
            : "Department item grid. Capacity = Width × Height."
        );
      }
    }
  }
  return rows;
}

export function setStoreHeight(store, height) {
  const h = Math.max(1, parseInt(height, 10) || 1);
  const cur = Math.max(1, parseInt(store.Height, 10) || 1);
  // grow-only
  if (h > cur) store.Height = String(h);
  return store.Height;
}
