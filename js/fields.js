/**
 * Shared field controls: bool dropdowns, observed enums, numeric inputs, hover help.
 */

export const BOOL_OPTIONS = ["True", "False"];

/** Known non-numeric enums (current value is always added). */
export const KNOWN_ENUMS = {
  State: ["None", "Training"],
  LookDirection: ["Down", "Up", "Left", "Right"],
  MovementState: ["Normal"],
  CurrentSlotType: ["Primary", "Secondary", "Additional"],
  Gender: ["Male", "Female"],
  CreatureClass: ["Human"],
  CreatureAlliance: ["PlayerAlliance"],
  PerkType: ["Talent", "Rank", "Ultimate", "Passive", "Trigger"],
  TimeScale: ["X1", "X2", "X4", "Paused"],
  EvacRules: ["ByChip"],
  DeathPenalty: ["RestartStage"],
  RevivePenalty: ["NoPenalty"],
  DropPenalty: ["None"],
  StartingEquip: ["High", "Medium", "Low"],
  CurrentAlliance: ["Hexarchy", "Empire", "Rebels", "Corporation", "Resistance", "Pirates", "Legion"],
  FactionType: ["Corp", "Tezctlan", "Xiomara", "CivilRes", "Pirates", "Shedu"],
};

export const FIELD_HELP = {
  BaseHealth: "Base max HP before perk/aug bonuses. Stored as a string number.",
  BaseActionPoints: "Action points per turn (string number).",
  BaseLosLevel: "Line-of-sight / vision radius.",
  BaseMeleeAccuracy: "Melee hit multiplier (e.g. 1.4).",
  BaseRangeAccuracy: "Ranged hit multiplier.",
  BaseDodge: "Dodge multiplier.",
  StarvationLimit: "Max satiety/starvation meter.",
  PainThresholdLimit: "Pain meter cap.",
  IgnoreStarvation: "If True, starvation does not apply.",
  IgnoreInfection: "If True, infection does not apply.",
  IgnorePain: "If True, pain stun does not apply.",
  HasSecondChance: "Class/perk second-chance flag.",
  HasUltimate: "True when a pact ultimate is active. Pair with one Ultimate perk + skull item. Prefer absorb / Breaking the Pact in-game for full pact flow; editor Remove clears these fields.",
  UpgradePerksCount: "How many perk upgrades this merc has taken.",
  WeaponDistanceBonus: "Extra weapon range baked onto the creature. Copy this with perks/stats — perk Parameters alone often do not apply until the game rewrites it.",
  CanFly: "If True, this merc can fly. Often baked from augs/perks; copy it with stats/perks.",
  AugResistBonusMult: "Augment resistance bonus multiplier (Steel Without etc.). Baked field; copy with stats/perks.",
  AugResistDebuffMult: "Augment resistance penalty multiplier. Baked field; copy with stats/perks.",
  ReceiveWoundChanceMult: "Incoming wound chance multiplier. Often class/perk baked.",
  AttackWoundChanceMult: "Outgoing wound chance multiplier.",
  PactCooldownBonus: "Pact cooldown multiplier baked from passives such as Possession.",
  PerksMaxHealth: "Extra max HP from rank/perks, added on top of BaseHealth.",
  CoverHitChanceBonus: "Bonus chance to hit targets in cover.",
  CoverBlockChanceBonus: "Bonus chance for cover to block hits.",
  QmorphResistBonus: "Quasimorphosis resist bonus.",
  Immobile: "If True, this creature cannot move.",
  _pactLevel: "Pact progress with a bramfatura. Ultimates come from pacts, not class ranks.",
  UltimateSkullItemId: "Skull item id for the active pact (e.g. skull_mercury_the_world). Empty {} = none. Changing this alone does not fully activate a new pact — absorb the skull in-game.",
  State: "None = idle. Training = in Magnum training; use Instant-finish to set end time = start.",
  "_value": "Current HP. Keep as a string.",
  MaxValue: "Current max HP including bonuses.",
  _invulnerability: "Debug-style invuln on this creature.",
  ExpMult: "Scales experience gains / perk leveling cost. Lower values mean more MaxExp is needed to rank up perks. The MaxExp stored on each perk already reflects this run's difficulty.",
  PlayerReputation: "Your standing with this faction (can be negative).",
  Power: "Faction world power.",
  CurrentTechLevel: "Faction tech tier.",
  TechExp: "Progress toward next tech level.",
  CurrentAlliance: "Diplomatic bloc.",
  Width: "Grid columns. Capacity = Width × Height. Grow-only.",
  Height: "Grid rows. Capacity = Width × Height. Never shrinks after deletes.",
};

export function isBoolish(v) {
  return v === "True" || v === "False" || v === true || v === false;
}

export function isNumericString(v) {
  if (typeof v === "number") return true;
  if (typeof v !== "string") return false;
  return /^-?\d+(\.\d+)?$/.test(v.trim());
}

export function helpAttr(key, extra) {
  const t = extra || FIELD_HELP[key] || "";
  return t ? ` title="${escapeAttr(t)}"` : "";
}

export function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function labelWithHelp(text, help) {
  const span = document.createElement("label");
  span.innerHTML = help
    ? `${escapeAttr(text)} <abbr class="help" title="${escapeAttr(help)}">?</abbr>`
    : escapeAttr(text);
  return span;
}

/**
 * Mutating control for obj[key]. Uses dropdown for bools and known/observed enums.
 */
export function attachField(row, obj, key, { onChange, extraEnums = [], help } = {}) {
  const val = obj[key];
  const hint = help || FIELD_HELP[key];
  if (hint) row.title = hint;

  if (val !== null && typeof val === "object") {
    const pre = document.createElement("pre");
    pre.className = "json-mini";
    pre.textContent = JSON.stringify(val, null, 2).slice(0, 400);
    row.appendChild(pre);
    return;
  }

  if (isBoolish(val)) {
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="True">True</option><option value="False">False</option>`;
    sel.value = val === true || val === "True" ? "True" : "False";
    sel.addEventListener("change", () => {
      obj[key] = sel.value;
      onChange?.();
    });
    row.appendChild(sel);
    return;
  }

  const known = [...(KNOWN_ENUMS[key] || []), ...extraEnums];
  const unique = [...new Set(known.map(String))];
  if (unique.length && !isNumericString(val)) {
    if (val != null && !unique.includes(String(val))) unique.unshift(String(val));
    const sel = document.createElement("select");
    for (const opt of unique) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    sel.value = val == null ? unique[0] : String(val);
    sel.addEventListener("change", () => {
      obj[key] = sel.value;
      onChange?.();
    });
    row.appendChild(sel);
    return;
  }

  const input = document.createElement("input");
  input.type = isNumericString(val) ? "number" : "text";
  input.step = "any";
  input.value = val == null ? "" : String(val);
  input.addEventListener("change", () => {
    obj[key] = input.value;
    onChange?.();
  });
  row.appendChild(input);
}

export function fieldRow(obj, key, opts = {}) {
  const row = document.createElement("div");
  row.className = "field-row";
  row.appendChild(labelWithHelp(key, opts.help || FIELD_HELP[key]));
  attachField(row, obj, key, opts);
  return row;
}
