/**
 * Travel / Time / Debug / Raid panels.
 */
import { getComponent } from "./parse.js";

export function getTravel(data) {
  return getComponent(data, "MGSC.TravelMetadata");
}

export function getSpaceTime(data) {
  return getComponent(data, "MGSC.SpaceTime");
}

export function getDebug(data) {
  return getComponent(data, "MGSC.DebugData");
}

export function getRaid(data) {
  return getComponent(data, "MGSC.RaidMetadata");
}

export function isInDungeon(data) {
  return data?.IsInDungeon === "True" || data?.IsInDungeon === true;
}
