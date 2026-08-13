import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let text = fs.readFileSync(path.join(ROOT, "..", "slot_2_session.dat"), "utf8");
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
const mercs = JSON.parse(text).Components.find((c) => c.Type === "MGSC.Mercenaries").Content.Values;

function fxSummary(m) {
  const fx = m.CreatureData?.EffectsController?.Effects || [];
  return fx.map((e) => ({
    Type: e.Type,
    ID: e.Content?.ID,
    FromAugment: e.Content?.FromAugment,
    keys: e.Content ? Object.keys(e.Content) : [],
    snippet: JSON.stringify(e).slice(0, 220),
  }));
}

function augSummary(m) {
  return JSON.stringify(m.CreatureData?.AugmentationMap);
}

function woundSummary(m) {
  return JSON.stringify(m.CreatureData?.WoundSlotMap);
}

const firstFx = fxSummary(mercs[0]);
console.log("first effects count", firstFx.length);
for (const e of firstFx) {
  console.log("-", e.Type, "id="+e.ID, "fromAug="+e.FromAugment, e.snippet);
}

console.log("\n=== effect type counts ===");
for (let i = 0; i < mercs.length; i++) {
  const fx = fxSummary(mercs[i]);
  const types = {};
  for (const e of fx) types[e.Type] = (types[e.Type] || 0) + 1;
  const augEq = augSummary(mercs[i]) === augSummary(mercs[0]);
  const woundEq = woundSummary(mercs[i]) === woundSummary(mercs[0]);
  console.log(i, mercs[i].AgentName, "fx", fx.length, types, "augEq", augEq, "woundEq", woundEq);
}

console.log("\n=== first vs merc2 effect Types+IDs ===");
const a = fxSummary(mercs[0]);
const b = fxSummary(mercs[2]);
console.log("first types", a.map((e) => e.Type + ":" + e.ID).join(", "));
console.log("merc2 types", b.map((e) => e.Type + ":" + e.ID).join(", "));

// dump ImplicitAugEffect / fly-related
console.log("\n=== looking for fly/wing/jet in first creature ===");
const blob = JSON.stringify(mercs[0].CreatureData);
for (const word of ["Fly", "fly", "Wing", "Jet", "Hover", "Levit"]) {
  const idx = blob.indexOf(word);
  if (idx >= 0) console.log("found", word, "at", idx, blob.slice(Math.max(0, idx - 80), idx + 80));
}

console.log("\n=== steel_without params first ===");
const sw = mercs[0].CreatureData.Perks.find((p) => p.PerkId.includes("steel_without"));
console.log(JSON.stringify(sw, null, 2));
