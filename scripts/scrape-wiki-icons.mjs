/**
 * Resolve + download wiki Inv_* / Perk_* icons for same-origin use in the editor.
 * Browser hotlinking is blocked by the wiki CDN (403) — local files are required.
 *
 * Default strategy (fast): parse a few list pages we already care about
 * (S.K.U.L.L. Project, Weapons, Equipments, …), take every Inv_/Perk_ from
 * `prop=images`, map File:Inv_foo.png → item id `foo`, download once.
 *
 * Usage:
 *   node scripts/scrape-wiki-icons.mjs              # list pages (default)
 *   node scripts/scrape-wiki-icons.mjs --all-files   # also scan allimages Inv_/Perk_
 *   node scripts/scrape-wiki-icons.mjs --status
 *   node scripts/scrape-wiki-icons.mjs --force
 *   node scripts/scrape-wiki-icons.mjs --urls-only
 *
 * Writes:
 *   data/icons/*
 *   data/iconMap.json
 *   data/icon-url-progress.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "icons");
const OUT_MAP = path.join(ROOT, "data", "iconMap.json");
const PROGRESS = path.join(ROOT, "data", "icon-url-progress.json");
const NAMES = path.join(ROOT, "data", "quasimorph Item name.txt");
const API = "https://quasimorph.wiki.gg/api.php";
const BATCH = 40;

/** Curated pages that already embed item icons (one parse each). */
const LIST_PAGES = [
  "S.K.U.L.L._Project",
  "Weapons",
  "Equipments",
  "Equipments/Armor_Sets",
  "Mercenary_Classes",
  "Ship_Upgrades",
];

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const statusOnly = args.has("--status");
const urlsOnly = args.has("--urls-only");
const allFiles = args.has("--all-files");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("format", "json");
  let delay = 2000;
  for (;;) {
    let res;
    try {
      res = await fetch(u, {
        headers: { "User-Agent": "QuasimorphSaveEditor/1.0 (icon scrape; local cache)" },
      });
    } catch (e) {
      console.log(`  network error, waiting ${Math.round(delay / 1000)}s… (${e.message})`);
      await sleep(delay);
      delay = Math.min(delay * 1.8, 60000);
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      console.log(`  HTTP ${res.status}, waiting ${Math.round(delay / 1000)}s…`);
      await sleep(delay);
      delay = Math.min(delay * 1.8, 60000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS, "utf8"));
  } catch {
    return { updatedAt: null, files: {}, pageHarvest: {} };
  }
}

function saveProgress(progress) {
  progress.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(PROGRESS), { recursive: true });
  fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
}

function idFromFilename(name) {
  const base = String(name || "")
    .replace(/^File:/i, "")
    .replace(/\.(png|jpg|jpeg|webp|gif|svg)$/i, "");
  const m = base.match(/^(Inv|Perk)[_ ](.+)$/i);
  if (!m) return null;
  return m[2].trim().toLowerCase().replace(/ /g, "_");
}

function extraIds(id) {
  if (!id) return [];
  const out = [id];
  if (id.includes("'")) out.push(id.replace(/'/g, ""));
  return out;
}

function safeLocalName(fileName) {
  return String(fileName).replace(/[^\w.\-]+/g, "_");
}

function normalizeTitle(s) {
  return String(s || "")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\u2019/g, "'")
    .trim();
}

/** Display name → item ids from catalog. */
function loadNameCatalog() {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  try {
    const text = fs.readFileSync(NAMES, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(.+?) (\S+) (exact|documented)\b/);
      if (!m) continue;
      const name = m[1].trim();
      const id = m[2];
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(id);
      const lower = name.toLowerCase();
      if (!map.has(lower)) map.set(lower, []);
      if (!map.get(lower).includes(id)) map.get(lower).push(id);
    }
  } catch {
    /* optional */
  }
  return map;
}

function titleToInvGuess(title) {
  const slug = normalizeTitle(title)
    .toLowerCase()
    .replace(/\s+/g, "_");
  return [`Inv_${slug}.png`, `Inv_${slug.replace(/'/g, "")}.png`];
}

/**
 * Harvest Inv_/Perk_ filenames (+ optional title→file guesses) from one wiki page.
 */
async function harvestPage(page) {
  const j = await api({
    action: "parse",
    page,
    prop: "images|wikitext",
    disablelimitreport: "1",
  });
  if (j.error) throw new Error(j.error.info || j.error.code || "parse failed");
  const images = (j.parse?.images || [])
    .map((n) => String(n).replace(/^File:/i, "").replace(/ /g, "_"))
    .filter((n) => /^(Inv_|Perk_)/i.test(n));
  const wt = j.parse?.wikitext?.["*"] || "";
  /** @type {Record<string, string>} wikiTitle → preferred Inv_ file */
  const titleToFile = {};
  for (const m of wt.matchAll(/\{\{\s*Item\s*\|\s*([^}|]+)/gi)) {
    const title = normalizeTitle(m[1]);
    for (const guess of titleToInvGuess(title)) {
      const hit = images.find((f) => f.toLowerCase() === guess.toLowerCase());
      if (hit) {
        titleToFile[title] = hit;
        break;
      }
    }
  }
  return { page, images, titleToFile, imageCount: images.length };
}

async function listAllImages(prefix) {
  const out = [];
  let cont = {};
  for (;;) {
    const j = await api({
      action: "query",
      list: "allimages",
      aiprefix: prefix,
      ailimit: "500",
      ...cont,
    });
    for (const img of j.query?.allimages || []) out.push(img.name);
    if (!j.continue?.aicontinue) break;
    cont = { aicontinue: j.continue.aicontinue };
    await sleep(250);
  }
  return out;
}

async function resolveBatch(fileNames) {
  const titles = fileNames.map((n) => (n.startsWith("File:") ? n : `File:${n}`)).join("|");
  const j = await api({
    action: "query",
    titles,
    prop: "imageinfo",
    iiprop: "url",
  });
  const out = new Map();
  for (const page of Object.values(j.query?.pages || {})) {
    const raw = String(page.title || "").replace(/^File:/i, "");
    const underscored = raw.replace(/ /g, "_");
    const url = page.missing != null ? null : page.imageinfo?.[0]?.url || null;
    out.set(underscored, url);
    out.set(raw, url);
  }
  return out;
}

async function downloadTo(url, dest) {
  const res = await fetch(url, {
    headers: { "User-Agent": "QuasimorphSaveEditor/1.0 (icon scrape; local cache)" },
  });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function writeIconMap(progress, nameCatalog) {
  /** @type {Record<string, string>} */
  const icons = {};
  /** @type {Record<string, string>} */
  const files = {};
  let ok = 0;
  let missing = 0;

  for (const [name, info] of Object.entries(progress.files)) {
    if (info.status === "ok" && info.local && fs.existsSync(path.join(ROOT, "data", info.local))) {
      files[name] = info.local;
      ok++;
      for (const id of extraIds(idFromFilename(name))) {
        if (id) icons[id] = info.local;
      }
    } else if (info.status === "missing") {
      missing++;
    }
  }

  // Link wiki Item| titles → catalog item ids when Inv_ file matches
  let titleLinks = 0;
  for (const harvest of Object.values(progress.pageHarvest || {})) {
    for (const [title, file] of Object.entries(harvest.titleToFile || {})) {
      const local = progress.files[file]?.local;
      if (!local) continue;
      const ids = nameCatalog.get(title) || nameCatalog.get(title.toLowerCase()) || [];
      for (const id of ids) {
        if (!icons[id]) {
          icons[id] = local;
          titleLinks++;
        }
      }
      // Also map filename-derived id
      for (const id of extraIds(idFromFilename(file))) {
        if (id && !icons[id]) icons[id] = local;
      }
    }
  }

  fs.writeFileSync(
    OUT_MAP,
    JSON.stringify(
      {
        source: "local data/icons from wiki list pages (Inv_/Perk_); browser hotlink blocked by CDN",
        builtAt: new Date().toISOString(),
        note: "Harvested from list pages (S.K.U.L.L. Project, Weapons, Equipments, …). Values are relative paths under data/. Filename Inv_foo.png → id foo; wiki Item| titles also mapped via name catalog.",
        stats: { ok, missing, ids: Object.keys(icons).length, titleLinks },
        icons,
        files,
      },
      null,
      2
    )
  );
  return { ok, missing, ids: Object.keys(icons).length, titleLinks };
}

async function main() {
  const progress = loadProgress();
  if (!progress.pageHarvest) progress.pageHarvest = {};
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const nameCatalog = loadNameCatalog();

  /** @type {Set<string>} */
  const nameSet = new Set();

  console.log("Harvesting icons from list pages…");
  for (const page of LIST_PAGES) {
    process.stdout.write(`  ${page}… `);
    try {
      const h = await harvestPage(page);
      progress.pageHarvest[page] = {
        scrapedAt: new Date().toISOString(),
        imageCount: h.imageCount,
        titleToFile: h.titleToFile,
      };
      for (const f of h.images) nameSet.add(f);
      console.log(`${h.imageCount} Inv_/Perk_ · ${Object.keys(h.titleToFile).length} Item|→file`);
    } catch (e) {
      console.log("FAIL", e.message);
    }
    await sleep(400);
  }
  saveProgress(progress);

  if (allFiles) {
    console.log("\nAlso listing allimages Inv_ / Perk_ (--all-files)…");
    const inv = await listAllImages("Inv_");
    const perk = await listAllImages("Perk_");
    for (const n of [...inv, ...perk]) nameSet.add(String(n).replace(/ /g, "_"));
  }

  const names = [...nameSet].sort((a, b) => a.localeCompare(b));
  console.log(`\nUnique files to process: ${names.length}${allFiles ? " (list pages + allimages)" : " (list pages only)"}`);

  const needResolve = names.filter((n) => {
    const st = progress.files[n];
    if (force) return true;
    if (st?.url && String(st.url).includes("/images/")) return false;
    return true;
  });
  console.log(`URL resolve: ${names.length - needResolve.length} cached, ${needResolve.length} to fetch/retry`);

  if (statusOnly) {
    const haveLocal = names.filter((n) => {
      const loc = progress.files[n]?.local;
      return loc && fs.existsSync(path.join(ROOT, "data", loc));
    }).length;
    console.log(`Local files on disk for this set: ${haveLocal}`);
    return;
  }

  for (let i = 0; i < needResolve.length; i += BATCH) {
    const batch = needResolve.slice(i, i + BATCH);
    process.stdout.write(`URLs ${i + 1}–${Math.min(i + BATCH, needResolve.length)} / ${needResolve.length}… `);
    try {
      const resolved = await resolveBatch(batch);
      for (const name of batch) {
        const url = resolved.get(name) ?? resolved.get(name.replace(/_/g, " ")) ?? null;
        const prev = progress.files[name] || {};
        if (url && url.includes("/images/")) {
          progress.files[name] = { ...prev, status: prev.local ? "ok" : "url", url, scrapedAt: new Date().toISOString() };
        } else {
          progress.files[name] = { ...prev, status: "missing", scrapedAt: new Date().toISOString() };
        }
      }
      saveProgress(progress);
      console.log("ok");
    } catch (e) {
      console.log("FAIL", e.message);
      saveProgress(progress);
      console.log("Checkpoint saved — re-run later.");
      break;
    }
    await sleep(350);
  }

  if (urlsOnly) {
    const wikiIcons = {};
    for (const [name, info] of Object.entries(progress.files)) {
      if (!info.url) continue;
      for (const id of extraIds(idFromFilename(name))) if (id) wikiIcons[id] = info.url;
    }
    fs.writeFileSync(
      path.join(ROOT, "data", "iconMap.wiki-urls.json"),
      JSON.stringify({ note: "debug only — browsers get 403 hotlinking these", icons: wikiIcons }, null, 2)
    );
    console.log("Wrote data/iconMap.wiki-urls.json (debug).");
    return;
  }

  const needDl = names.filter((n) => {
    const st = progress.files[n];
    if (!st?.url || !String(st.url).includes("/images/")) return false;
    if (st.status === "missing") return false;
    const local = st.local || `icons/${safeLocalName(n)}`;
    const dest = path.join(ROOT, "data", local);
    if (!force && fs.existsSync(dest) && st.status !== "error") {
      if (!st.local) {
        st.local = local;
        st.status = "ok";
      }
      return false;
    }
    return true;
  });
  saveProgress(progress);
  console.log(`Download: ${needDl.length} files`);

  let fetched = 0;
  for (let i = 0; i < needDl.length; i++) {
    const name = needDl[i];
    const st = progress.files[name];
    const local = `icons/${safeLocalName(name)}`;
    const dest = path.join(ROOT, "data", local);
    process.stdout.write(`[${i + 1}/${needDl.length}] ${name}… `);
    try {
      const bytes = await downloadTo(st.url, dest);
      progress.files[name] = {
        ...st,
        status: "ok",
        local,
        bytes,
        scrapedAt: new Date().toISOString(),
        fromPages: true,
      };
      saveProgress(progress);
      fetched++;
      console.log(`${bytes}B`);
    } catch (e) {
      progress.files[name] = { ...st, status: "error", error: String(e.message || e), scrapedAt: new Date().toISOString() };
      saveProgress(progress);
      console.log("FAIL", e.message);
    }
    await sleep(200);
    if (i > 0 && i % 50 === 0) {
      writeIconMap(progress, nameCatalog);
      console.log("  (checkpoint iconMap written)");
    }
  }

  const stats = writeIconMap(progress, nameCatalog);
  console.log(`\nDownloaded this run: ${fetched}`);
  console.log(`Wrote ${OUT_MAP} (${stats.ids} ids, ${stats.ok} local files, +${stats.titleLinks} title→id links)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
