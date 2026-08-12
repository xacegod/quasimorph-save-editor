/**
 * Build editor metadata for ranks + perk parameter defaults from local saves,
 * and enrich mercClasses.json (correct MercClassId + blurbs).
 *
 * Usage: node scripts/build-perk-meta.mjs
 *
 * Reads any slot_*_session.dat in the project root (gitignored).
 * Writes:
 *   data/rankLibrary.json
 *   data/perkDefaults.json
 *   updates data/mercClasses.json classIdGuess / description when possible
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const API = "https://quasimorph.wiki.gg/api.php";

const CLASS_ID_OVERRIDES = {
  "Co.B.R.A.": "cobra",
  "Co.B.R.A": "cobra",
  "Unit 317": "unit_317",
  "Martian Mech Inf": "martian_mech_inf",
  "Angels of Spades": "angels_of_spades",
  "Scouts of Hades": "scouts_of_hades",
  "Eclipse Blades": "eclipse_blades",
  "Tifton's Elite": "tifton_elite",
  "Tunnel Rats": "tunnel_rats",
  "Phoenix Brigade": "phoenix_brigade",
  "Spaceborn Ghosts": "spaceborn_ghosts",
  "Terror Pack": "terror_pack",
  "Valkyrie Squad": "valkyrie_squad",
  "Golem Group": "golem_group",
  Tongkong: "tongkong",
};

/** Wiki display names + bonus text (numbers may lag game builds — prefer save Parameters). */
const RANK_WIKI = [
  { PerkId: "rank_0", displayName: "Rookie", wikiBonuses: "none" },
  {
    PerkId: "rank_1",
    displayName: "Squaddie",
    wikiBonuses: "Health +10, Starvation limit +150 (wiki; live Parameters may differ)",
  },
  {
    PerkId: "rank_2",
    displayName: "Sergeant",
    wikiBonuses: "Health +10, Starvation limit +250, Heal wound +10% (wiki; live Parameters may differ)",
  },
  {
    PerkId: "rank_3",
    displayName: "Captain",
    wikiBonuses:
      "Health +10, Starvation limit +250, Heal wound +10%, Dodge +5%, Pain threshold +2 (wiki; live Parameters may differ)",
  },
  {
    PerkId: "rank_4",
    displayName: "Colonel",
    wikiBonuses:
      "Health +10, Starvation limit +250, Heal wound +10%, Dodge +5%, Pain threshold +4, Receive wound chance -10% (wiki; live Parameters may differ)",
  },
  {
    PerkId: "rank_5",
    displayName: "Commander",
    wikiBonuses:
      "Max mercenary rank (Commander). Full bonuses at this tier: prior rank stats + negate one lethal hit (BSecondChance). Max rank jumps here from any lower rank_*.",
  },
];

const PARAM_LABELS = {
  IDuration: "Duration (turns)",
  ICooldown: "Cooldown (turns)",
  IActivation: "Activation cost / threshold",
  IHealthRegen: "Health regen",
  IPainRegen: "Pain regeneration",
  IMaxHealth: "Max health bonus",
  IAddedAP: "Extra AP",
  IRevealRange: "Reveal / detection range",
  IEnemyStunDuration: "Enemy stun duration",
  IEnemyCount: "Affected enemies",
  IPlacementRange: "Placement range",
  ITurretHealth: "Deployable health",
  IAddedPistolRange: "Pistol range bonus",
  IStarvStanceBonus: "Starvation stance / limit bonus",
  IWeaponDistance: "Weapon distance",
  IEnemyHuntBonus: "Enemy hunt bonus",
  IResists: "Resistances",
  IKiloDmgThreshold: "Weight damage threshold",
  FDamage: "Damage multiplier",
  FPierce: "Pierce chance / mult",
  FRangeAccuracy: "Ranged accuracy",
  FScatter: "Scatter (negative = tighter)",
  FCritChance: "Crit chance",
  FDodge: "Dodge chance",
  FPistolAccuracy: "Pistol accuracy",
  FTurretDamage: "Deployable damage",
  FEquipmentWeight: "Equipment weight",
  FNoiseSuppression: "Noise suppression / no-sound chance",
  FFixateAddedChance: "Wound heal / fixate chance",
  FFixateHumanAddedChance: "Organic wound heal chance",
  FWoundChance: "Receive wound chance (negative = safer)",
  FGrenadeDamage: "Grenade / explosion damage",
  FWeaponDurability: "Weapon durability",
  FEquipWeaponWeight: "Equipped weapon weight",
  FWeightMeleeDmgIncrease: "Melee damage from weight",
  FMissingHealthDamageIncrease: "Damage from missing health",
  FIncomeCritMult: "Incoming crit multiplier",
  FExplosionIncomeDamageMult: "Incoming explosion damage",
  BSecondChance: "Negate one lethal hit",
  BFixAllHumanWounds: "Stabilize organic wounds",
  BIgnoreInfection: "Ignore infection",
  BIgnorePain: "Ignore pain",
  BBackstabResistIgnore: "Ignore backstab resist",
  BThirdWeaponSlot: "Third weapon slot",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("format", "json");
  const res = await fetch(u, {
    headers: { "User-Agent": "QuasimorphSaveEditor/1.0 (perk meta build)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function findMercs(obj, out = []) {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (const x of obj) findMercs(x, out);
    return out;
  }
  if (obj.CreatureData?.Perks) out.push(obj);
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") findMercs(v, out);
  }
  return out;
}

function clonePerkTemplate(p) {
  return {
    PerkId: p.PerkId,
    PerkType: p.PerkType,
    Parameters: JSON.parse(JSON.stringify(p.Parameters || [])),
    AIParameters: JSON.parse(JSON.stringify(p.AIParameters || [])),
    NextPerkId: p.NextPerkId ?? {},
    LevelUpActionType: p.LevelUpActionType || "None",
    CurrentExp: "0",
    ExpPerAction: p.ExpPerAction || "0",
    MaxExp: p.MaxExp || "0",
  };
}

function templateScore(p) {
  // Prefer pristine copies (CurrentExp 0) with more parameters.
  const exp = parseInt(p.CurrentExp, 10) || 0;
  return (p.Parameters?.length || 0) * 10 + (p.AIParameters?.length || 0) - Math.min(exp, 50);
}

function loadPerkTemplatesFromSaves() {
  const files = fs
    .readdirSync(ROOT)
    .filter((f) => /^slot_\d+_session\.dat$/i.test(f))
    .map((f) => path.join(ROOT, f));
  const byId = new Map();
  const classIds = new Set();
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const data = JSON.parse(raw);
    for (const m of findMercs(data)) {
      if (typeof m.MercClassId === "string") classIds.add(m.MercClassId);
      for (const p of m.CreatureData.Perks || []) {
        if (!p?.PerkId) continue;
        const next = clonePerkTemplate(p);
        const prev = byId.get(p.PerkId);
        if (!prev || templateScore(next) > templateScore(prev)) byId.set(p.PerkId, next);
      }
    }
  }
  return { byId, classIds: [...classIds].sort(), files: files.map((f) => path.basename(f)) };
}

function cleanWiki(s) {
  return String(s || "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^|\]]+)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/'''|''/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseClassBlurbs(wikitext) {
  const blurbs = {};
  let current = null;
  for (const line of wikitext.split(/\n/)) {
    const h3 = line.match(/^===\s*([^=].*?)\s*===\s*$/);
    if (h3) {
      current = h3[1].trim();
      continue;
    }
    if (!current) continue;
    const q = line.match(/^"(.+)"\s*-\s*/);
    if (q && !blurbs[current]) blurbs[current] = cleanWiki(q[1]).slice(0, 400);
  }
  return blurbs;
}

function basePerkId(perkId) {
  return String(perkId || "").replace(/_(basic|advanced|master|legend)$/i, "");
}

function perkTier(perkId) {
  const m = String(perkId || "").match(/_(basic|advanced|master|legend)$/i);
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  const { byId, classIds, files } = loadPerkTemplatesFromSaves();
  console.log(`Loaded ${byId.size} perk templates from ${files.join(", ") || "(no saves)"}`);
  console.log(`MercClassIds seen: ${classIds.join(", ") || "(none)"}`);

  // Rank library
  const ranks = RANK_WIKI.map((w) => {
    const tmpl = byId.get(w.PerkId);
    return {
      ...w,
      NextPerkId: tmpl?.NextPerkId ?? (w.PerkId === "rank_5" ? {} : `rank_${Number(w.PerkId.slice(5)) + 1}`),
      LevelUpActionType: tmpl?.LevelUpActionType || "AnyKill",
      MaxExp: tmpl?.MaxExp || (w.PerkId === "rank_5" ? "0" : null),
      ExpPerAction: tmpl?.ExpPerAction || null,
      Parameters: tmpl?.Parameters || [],
      AIParameters: tmpl?.AIParameters || [],
      defaultsFrom: tmpl ? "save" : "wiki-only",
      source: "https://quasimorph.wiki.gg/wiki/Rank",
    };
  });

  fs.writeFileSync(
    path.join(DATA, "rankLibrary.json"),
    JSON.stringify(
      {
        source: "https://quasimorph.wiki.gg/wiki/Rank + local save templates",
        builtAt: new Date().toISOString(),
        note: "Display names from wiki. Parameter defaults from local saves when present (preferred over wiki text).",
        ranks,
      },
      null,
      2
    )
  );
  console.log(`Wrote data/rankLibrary.json (${ranks.length} ranks, ${ranks.filter((r) => r.defaultsFrom === "save").length} with save defaults)`);

  // Perk defaults (all non-talent templates from saves; talents already in talentLibrary)
  const perks = {};
  const byBase = {};
  for (const [id, p] of byId) {
    if (p.PerkType === "Talent") continue;
    perks[id] = p;
    const base = basePerkId(id);
    const tier = perkTier(id) || "bare";
    if (!byBase[base]) byBase[base] = { base, tiers: {} };
    byBase[base].tiers[tier] = id;
  }

  fs.writeFileSync(
    path.join(DATA, "perkDefaults.json"),
    JSON.stringify(
      {
        source: files.length ? `local saves: ${files.join(", ")}` : "empty — re-run with slot_*_session.dat present",
        builtAt: new Date().toISOString(),
        note: "Default Parameters/AIParameters/MaxExp/NextPerkId snapshots for Reset in the editor. Values are from a real save (difficulty ExpMult may already be applied to MaxExp).",
        paramLabels: PARAM_LABELS,
        stats: { perkIds: Object.keys(perks).length, bases: Object.keys(byBase).length },
        perks,
        byBase,
      },
      null,
      2
    )
  );
  console.log(`Wrote data/perkDefaults.json (${Object.keys(perks).length} perks)`);

  // Enrich mercClasses.json
  const classesPath = path.join(DATA, "mercClasses.json");
  if (fs.existsSync(classesPath)) {
    let blurbs = {};
    try {
      const j = await api({ action: "parse", page: "Mercenary_Classes", prop: "wikitext" });
      blurbs = parseClassBlurbs(j.parse?.wikitext?.["*"] || "");
      await sleep(300);
    } catch (e) {
      console.warn("Could not fetch class blurbs:", e.message);
    }

    const data = JSON.parse(fs.readFileSync(classesPath, "utf8"));
    for (const c of data.classes || []) {
      const id = CLASS_ID_OVERRIDES[c.wikiTitle] || c.classIdGuess;
      c.classIdGuess = id;
      if (blurbs[c.wikiTitle]) c.description = blurbs[c.wikiTitle];
      // Attach known save tier ids under each wiki perk when matching base
      for (const p of c.perks || []) {
        if (!p.internalName) continue;
        const fam = byBase[p.internalName];
        if (fam) p.tierIds = { ...fam.tiers };
      }
    }
    data.note =
      "classIdGuess matches MercClassId in saves. description from wiki. perks[].tierIds from local saves when available.";
    data.metaBuiltAt = new Date().toISOString();
    fs.writeFileSync(classesPath, JSON.stringify(data, null, 2));
    console.log(`Updated data/mercClasses.json (ids + descriptions + tierIds)`);
  }

  // Keep scrape overrides in sync note
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
