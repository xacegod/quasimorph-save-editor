/**
 * One-level undo snapshot for destructive bulk edits.
 */
import { deepClone } from "./parse.js";

let snapshot = null;
let label = "";

export function pushUndo(data, reason = "edit") {
  if (!data) return;
  try {
    snapshot = deepClone(data);
    label = reason;
  } catch (e) {
    console.warn("undo snapshot failed", e);
    snapshot = null;
    label = "";
  }
}

export function canUndo() {
  return !!snapshot;
}

export function undoLabel() {
  return label;
}

/** Restore last snapshot into `stateData` root (mutates Components / flags in place). */
export function applyUndo(stateData) {
  if (!snapshot || !stateData) return null;
  const prev = snapshot;
  const reason = label;
  snapshot = null;
  label = "";
  stateData.SaveVersion = prev.SaveVersion;
  stateData.IsInDungeon = prev.IsInDungeon;
  stateData.Components = prev.Components;
  for (const k of Object.keys(prev)) {
    if (k === "SaveVersion" || k === "IsInDungeon" || k === "Components") continue;
    stateData[k] = prev[k];
  }
  return reason;
}

export function clearUndo() {
  snapshot = null;
  label = "";
}
