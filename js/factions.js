/**
 * Faction editor helpers.
 */
import { getComponent } from "./parse.js";

export function getFactions(data) {
  return getComponent(data, "MGSC.Factions")?.Values || [];
}

export function uniqueFieldValues(factions, field) {
  const set = new Set();
  for (const f of factions) {
    const v = f[field];
    if (v == null) continue;
    if (typeof v === "object") set.add("{}");
    else set.add(String(v));
  }
  return [...set].sort();
}

export function bulkSet(factions, field, value) {
  for (const f of factions) f[field] = String(value);
}
