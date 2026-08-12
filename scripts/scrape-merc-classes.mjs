/**
 * Scrape Mercenary Classes + each class perk page (PerkInfobox).
 *
 * Example perk page: https://quasimorph.wiki.gg/wiki/Berserkgang
 * Extracts InternalName, trigger, exp needs, tier effects, cooldown, etc.
 *
 * Resumable: data/class-perk-scrape-progress.json
 *
 * Usage:
 *   node scripts/scrape-merc-classes.mjs
 *   node scripts/scrape-merc-classes.mjs --status
 *   node scripts/scrape-merc-classes.mjs --force
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_CLASSES = path.join(ROOT, "data", "mercClasses.json");
const OUT_PERKS = path.join(ROOT, "data", "classPerkLibrary.json");
const PROGRESS = path.join(ROOT, "data", "class-perk-scrape-progress.json");
const API = "https://quasimorph.wiki.gg/api.php";
const PAGE = "Mercenary_Classes";

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const statusOnly = args.has("--status");

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("format", "json");
  let delay = 1500;
  for (;;) {
    const res = await fetch(u, {
      headers: { "User-Agent": "QuasimorphSaveEditor/1.0 (class perk scrape)" },
    });
    if (res.status === 429) {
      console.log(`  rate-limited, waiting ${Math.round(delay / 1000)}s…`);
      await sleep(delay);
      delay = Math.min(delay * 1.8, 60000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

function slugifyClass(name) {
  return String(name)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
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

function parseClasses(wikitext) {
  const classes = [];
  let section = null;
  for (const line of wikitext.split(/\n/)) {
    const h3 = line.match(/^===\s*([^=].*?)\s*===\s*$/);
    if (h3) {
      if (section && section !== "unused") {
        const wikiTitle = h3[1].trim();
        classes.push({
          wikiTitle,
          classIdGuess: CLASS_ID_OVERRIDES[wikiTitle] || slugifyClass(wikiTitle),
          section,
        });
      }
      continue;
    }
    const h2 = line.match(/^==\s*([^=].*?)\s*==\s*$/);
    if (h2) {
      const t = h2[1];
      if (/Starting Classes/i.test(t)) section = "starting";
      else if (/Unlockable Classes/i.test(t)) section = "unlockable";
      else if (/Unused/i.test(t)) section = "unused";
      else section = null;
    }
  }
  return classes;
}

async function cargoPerkNamesForClass(className) {
  const fields = "_pageName=Name,Mainclass,Perk_ID,Effect_1,Effect_4,PerkTrigger,ExpGain,Mercclass";
  const tryWhere = async (where) => {
    const j = await api({
      action: "cargoquery",
      tables: "Perks",
      fields,
      where,
      limit: "30",
    });
    if (j.error) return null;
    return (j.cargoquery || []).map((r) => r.title || {}).filter((t) => t.Name);
  };
  const safe = className.replace(/"/g, "");
  return (
    (await tryWhere(`Mercclass HOLDS "${safe}"`)) ||
    (await tryWhere(`Mercclass LIKE "%${safe}%"`)) ||
    []
  );
}

function extractTemplate(wikitext, name) {
  const re = new RegExp(`\\{\\{\\s*${name}\\b`, "i");
  const start = wikitext.search(re);
  if (start < 0) return null;
  let i = start + 2;
  let depth = 1;
  while (i < wikitext.length && depth > 0) {
    if (wikitext.startsWith("{{", i)) {
      depth++;
      i += 2;
      continue;
    }
    if (wikitext.startsWith("}}", i)) {
      depth--;
      i += 2;
      continue;
    }
    i++;
  }
  if (depth !== 0) return null;
  // body between first | after template name and final }}
  const full = wikitext.slice(start, i);
  const pipe = full.indexOf("|");
  if (pipe < 0) return "";
  return full.slice(pipe, full.length - 2);
}

function parsePerkInfobox(wikiTitle, wikitext) {
  const out = {
    wikiTitle,
    status: "ok",
    internalName: null,
    perkIdNumeric: null,
    mainClass: null,
    mercClasses: [],
    perkTrigger: null,
    expGain: null,
    expNeed: {},
    effects: {},
    cost: null,
    cooldown: {},
    details: null,
    rawInfobox: {},
  };

  const body = extractTemplate(wikitext, "PerkInfobox");
  if (body == null) {
    out.status = "incomplete";
    out.note = "No PerkInfobox found";
    return out;
  }

  for (const line of body.split(/\n/)) {
    const m = line.match(/^\s*\|\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out.rawInfobox[m[1]] = m[2].trim();
  }

  const get = (...keys) => {
    for (const k of keys) {
      for (const [ik, v] of Object.entries(out.rawInfobox)) {
        if (ik.toLowerCase() === k.toLowerCase() && v) return v;
      }
    }
    return null;
  };

  out.internalName = cleanWiki(get("InternalName", "Internal Name")) || null;
  out.perkIdNumeric = cleanWiki(get("Perk_ID", "PerkID")) || null;
  out.mainClass = cleanWiki(get("Mainclass", "MainClass")) || null;
  out.perkTrigger = cleanWiki(get("PerkTrigger")) || null;
  out.expGain = cleanWiki(get("ExpGain")) || null;
  out.cost = cleanWiki(get("Cost")) || null;

  const mercRaw = get("Mercclass", "MercClass") || "";
  out.mercClasses = [...mercRaw.matchAll(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1].trim());
  if (!out.mercClasses.length && mercRaw) out.mercClasses = [cleanWiki(mercRaw)].filter(Boolean);

  for (const [k, v] of Object.entries(out.rawInfobox)) {
    const en = k.match(/^ExpNeed_(\d+)$/i);
    if (en) out.expNeed[en[1]] = cleanWiki(v);
    const ef = k.match(/^Effect_(\d+)$/i);
    if (ef) out.effects[ef[1]] = cleanWiki(v);
    if (/^Cooldown/i.test(k)) {
      const tier = k.match(/_(\d+)$/);
      out.cooldown[tier ? tier[1] : "1"] = cleanWiki(v);
    }
  }

  const details = wikitext.match(/==\s*Details\s*==([\s\S]*?)(?:\n==|$)/i);
  if (details) out.details = cleanWiki(details[1]).slice(0, 500);

  if (!out.internalName) {
    out.status = "incomplete";
    out.note = "Missing InternalName";
  }
  return out;
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS, "utf8"));
  } catch {
    return { updatedAt: null, pages: {} };
  }
}

function saveProgress(progress) {
  progress.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(PROGRESS), { recursive: true });
  fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
}

function isCompletePerk(page) {
  return page?.status === "ok" && page.internalName;
}

async function scrapePerkPage(title) {
  const page = await api({
    action: "parse",
    page: title,
    prop: "wikitext",
    disablelimitreport: "1",
  });
  if (page.error) {
    const msg = page.error.info || page.error.code || "missing";
    const missing = /doesn't exist|missingtitle/i.test(msg);
    return {
      wikiTitle: title,
      status: missing ? "missing" : "error",
      error: msg,
    };
  }
  return parsePerkInfobox(title, page.parse?.wikitext?.["*"] || "");
}

async function main() {
  console.log(`Fetching ${PAGE}…`);
  const j = await api({ action: "parse", page: PAGE, prop: "wikitext" });
  const classes = parseClasses(j.parse?.wikitext?.["*"] || "");
  console.log(`Found ${classes.length} classes`);

  // Collect perk page titles from cargo
  const perkTitles = new Set();
  for (const c of classes) {
    process.stdout.write(`Cargo ${c.wikiTitle}… `);
    const rows = await cargoPerkNamesForClass(c.wikiTitle);
    c.perkPages = rows.map((r) => r.Name).filter(Boolean);
    for (const name of c.perkPages) perkTitles.add(name);
    console.log(`${c.perkPages.length} perks`);
    await sleep(300);
  }

  const titles = [...perkTitles].sort((a, b) => a.localeCompare(b));
  console.log(`Unique perk pages to scrape: ${titles.length}`);

  const progress = loadProgress();
  let pending = 0;
  let complete = 0;
  for (const t of titles) {
    const page = progress.pages[t];
    if (!force && isCompletePerk(page)) complete++;
    else pending++;
  }
  console.log(`Progress: ${complete} complete, ${pending} to fetch (incomplete/missing are retried)`);

  if (statusOnly) {
    titles
      .filter((t) => force || !isCompletePerk(progress.pages[t]))
      .slice(0, 40)
      .forEach((t) => console.log(" -", t, progress.pages[t]?.status || "pending"));
    return;
  }

  let fetched = 0;
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    // Retry incomplete / missing / error unless --force only full skip of complete
    if (!force && isCompletePerk(progress.pages[title])) continue;
    process.stdout.write(`[${i + 1}/${titles.length}] ${title}… `);
    try {
      const info = await scrapePerkPage(title);
      progress.pages[title] = { ...info, scrapedAt: new Date().toISOString() };
      saveProgress(progress);
      fetched++;
      console.log(info.internalName || info.status);
    } catch (e) {
      progress.pages[title] = {
        wikiTitle: title,
        status: "error",
        error: String(e.message || e),
        scrapedAt: new Date().toISOString(),
      };
      saveProgress(progress);
      fetched++;
      console.log("FAIL", e.message);
    }
    await sleep(900);
  }

  // Build perk library
  const perks = [];
  for (const title of titles) {
    const p = progress.pages[title];
    if (!isCompletePerk(p)) continue;
    perks.push({
      wikiTitle: p.wikiTitle,
      internalName: p.internalName,
      perkIdNumeric: p.perkIdNumeric || null,
      mainClass: p.mainClass,
      mercClasses: p.mercClasses || [],
      perkTrigger: p.perkTrigger,
      expGain: p.expGain,
      expNeed: p.expNeed,
      effects: p.effects,
      cost: p.cost,
      cooldown: p.cooldown,
      details: p.details,
      source: `https://quasimorph.wiki.gg/wiki/${encodeURIComponent(p.wikiTitle.replace(/ /g, "_"))}`,
    });
  }
  perks.sort((a, b) => a.wikiTitle.localeCompare(b.wikiTitle));

  const byInternal = Object.fromEntries(perks.map((p) => [p.internalName, p]));

  // Attach enriched refs onto classes
  for (const c of classes) {
    c.perks = (c.perkPages || []).map((name) => {
      const full = progress.pages[name];
      if (isCompletePerk(full)) {
        return {
          wikiTitle: full.wikiTitle,
          internalName: full.internalName,
          mainClass: full.mainClass,
          perkTrigger: full.perkTrigger,
          expGain: full.expGain,
          expNeed: full.expNeed,
          effects: full.effects,
          cooldown: full.cooldown,
        };
      }
      return { wikiTitle: name, status: full?.status || "pending" };
    });
    delete c.perkPages;
  }

  fs.writeFileSync(
    OUT_PERKS,
    JSON.stringify(
      {
        source: "https://quasimorph.wiki.gg/wiki/Mercenary_Classes + perk pages",
        scrapedAt: new Date().toISOString(),
        note: "internalName matches save PerkId for class passives/triggers (e.g. berserkgang). ExpNeed_* are wiki base thresholds; Difficulty ExpMult scales in-game MaxExp.",
        stats: { perks: perks.length, pages: titles.length },
        perks,
        byInternalName: byInternal,
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    OUT_CLASSES,
    JSON.stringify(
      {
        source: `https://quasimorph.wiki.gg/wiki/${PAGE}`,
        scrapedAt: new Date().toISOString(),
        note: "classIdGuess matches MercClassId. Perks enriched from individual wiki pages when available.",
        classes,
      },
      null,
      2
    )
  );

  console.log(`\nFetched this run: ${fetched}`);
  console.log(`Wrote ${OUT_PERKS} (${perks.length} complete perks)`);
  console.log(`Wrote ${OUT_CLASSES}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
