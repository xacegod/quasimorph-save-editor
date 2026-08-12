/**
 * Magnum stations (MGSC.Stations).
 */
import { getComponent } from "./parse.js";

export function getStationsRoot(data) {
  return getComponent(data, "MGSC.Stations");
}

export function getStations(data) {
  return getStationsRoot(data)?.Values || [];
}

export function stationSummary(s) {
  const stash = s?.Stash?.Items?.length || 0;
  const internal = s?.InternalStorage?.Items?.length || 0;
  return {
    id: s.Id || "?",
    owner: s.OwnerFactionId || "",
    bram: s.BramfaturaId || "",
    space: s.SpaceObjectId || "",
    immune: s.ImmuneToAttack === "True",
    uncapturable: s.UncapturableByDefault === "True",
    stash,
    internal,
    population: s.Population || "",
  };
}

export function filterStations(list, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) => {
    const hay = [s.Id, s.OwnerFactionId, s.BramfaturaId, s.SpaceObjectId].map((x) => String(x || "").toLowerCase());
    return hay.some((h) => h.includes(q));
  });
}

export function setStationOwner(station, factionId) {
  station.OwnerFactionId = String(factionId || "");
}

export function setStationImmune(station, on) {
  station.ImmuneToAttack = on ? "True" : "False";
}

export function setStationUncapturable(station, on) {
  station.UncapturableByDefault = on ? "True" : "False";
}

export function clearStationStash(station) {
  if (station?.Stash && Array.isArray(station.Stash.Items)) {
    const n = station.Stash.Items.length;
    station.Stash.Items = [];
    return n;
  }
  return 0;
}

export function clearStationInternal(station) {
  if (station?.InternalStorage && Array.isArray(station.InternalStorage.Items)) {
    const n = station.InternalStorage.Items.length;
    station.InternalStorage.Items = [];
    return n;
  }
  return 0;
}
