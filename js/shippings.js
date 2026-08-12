/**
 * Magnum shippings (MGSC.Shippings).
 */
import { getComponent } from "./parse.js";
import { getSpaceTime } from "./world.js";

export function getShippingsRoot(data) {
  return getComponent(data, "MGSC.Shippings");
}

export function getShippings(data) {
  return getShippingsRoot(data)?.Values || [];
}

export function shippingSummary(s) {
  const items = s.Items || [];
  const ids = items.map((it) => it?.Content?.Id).filter(Boolean);
  return {
    from: s.DepartureStationId || "",
    to: s.DeliveryStationId || "",
    start: s.StartTime || "",
    delivery: s.DeliveryDate || "",
    itemCount: items.length,
    sampleIds: ids.slice(0, 5),
  };
}

export function filterShippings(list, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) => {
    const ids = (s.Items || []).map((it) => String(it?.Content?.Id || "").toLowerCase());
    const hay = [s.DepartureStationId, s.DeliveryStationId, ...ids].map((x) => String(x || "").toLowerCase());
    return hay.some((h) => h.includes(q));
  });
}

export function deleteShippings(data, toDelete) {
  const root = getShippingsRoot(data);
  if (!root?.Values) return 0;
  const set = new Set(toDelete);
  const before = root.Values.length;
  root.Values = root.Values.filter((s) => !set.has(s));
  return before - root.Values.length;
}

/** Set DeliveryDate to current SpaceTime (or StartTime). */
export function forceArriveShippings(data, list) {
  const t = getSpaceTime(data)?.Time;
  let n = 0;
  for (const s of list) {
    s.DeliveryDate = t != null ? String(t) : s.StartTime || "0";
    n++;
  }
  return n;
}

export function clearAllShippings(data) {
  const root = getShippingsRoot(data);
  if (!root?.Values) return 0;
  const n = root.Values.length;
  root.Values = [];
  return n;
}
