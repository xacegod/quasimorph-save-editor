/**
 * Resolve + download wiki Inv_* / Perk_* icons for same-origin use in the editor.
 * Browser hotlinking is blocked by the wiki CDN (403) — local files are required.
 *
 * Usage:
 *   node scripts/scrape-wiki-icons.mjs           # resume
 *   node scripts/scrape-wiki-icons.mjs --status
 *   node scripts/scrape-wiki-icons.mjs --force
 *   node scripts/scrape-wiki-icons.mjs --urls-only  # map URLs, skip download
 *
 * Writes:
 *   data/icons/*              (downloaded image bytes)
 *   data/iconMap.json         (id → local data/icons/… path)
 *   data/icon-url-progress.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "icons");
const OUT_MAP = path.join(ROOT, "data", "iconMap.json");
const PROGRESS = path.join(ROOT, "data", "icon-url-progress.json");
const API = "https://quasimorph.wiki.gg/api.php";
const BATCH = 40;

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const statusOnly = args.has("--status");
const urlsOnly = args.has("--urls-only");

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
    return { updatedAt: null, files: {} };
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

function writeIconMap(progress) {
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
  fs.writeFileSync(
    OUT_MAP,
    JSON.stringify(
      {
        source: "local data/icons cached from quasimorph.wiki.gg (browser hotlink blocked by CDN)",
        builtAt: new Date().toISOString(),
        note: "Values are relative paths under data/ (e.g. icons/Inv_foo.png). Editor loads one same-origin request per known id — no wiki pings, no fallback spam.",
        stats: { ok, missing, ids: Object.keys(icons).length },
        icons,
        files,
      },
      null,
      2
    )
  );
  return { ok, missing, ids: Object.keys(icons).length };
}

async function main() {
  console.log("Listing Inv_ / Perk_ images…");
  const inv = await listAllImages("Inv_");
  const perk = await listAllImages("Perk_");
  const names = [...new Set([...inv, ...perk])].sort((a, b) => a.localeCompare(b));
  console.log(`Found ${names.length} files`);

  const progress = loadProgress();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Phase 1: resolve direct /images/ URLs (API)
  const needResolve = names.filter((n) => {
    const st = progress.files[n];
    return force || !(st?.url && String(st.url).includes("/images/"));
  });
  console.log(`URL resolve: ${names.length - needResolve.length} cached, ${needResolve.length} to fetch`);

  if (statusOnly) {
    const haveLocal = names.filter((n) => {
      const loc = progress.files[n]?.local;
      return loc && fs.existsSync(path.join(ROOT, "data", loc));
    }).length;
    console.log(`Local files on disk: ${haveLocal}`);
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
    // Write a temporary map of wiki URLs for debugging only
    const wikiIcons = {};
    for (const [name, info] of Object.entries(progress.files)) {
      if (!info.url) continue;
      for (const id of extraIds(idFromFilename(name))) if (id) wikiIcons[id] = info.url;
    }
    fs.writeFileSync(
      path.join(ROOT, "data", "iconMap.wiki-urls.json"),
      JSON.stringify({ note: "debug only — browsers get 403 hotlinking these", icons: wikiIcons }, null, 2)
    );
    console.log("Wrote data/iconMap.wiki-urls.json (debug). Editor needs local files.");
    return;
  }

  // Phase 2: download bytes for local same-origin serving
  const needDl = names.filter((n) => {
    const st = progress.files[n];
    if (!st?.url || st.status === "missing") return false;
    const local = st.local || `icons/${safeLocalName(n)}`;
    if (!force && fs.existsSync(path.join(ROOT, "data", local))) {
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
      writeIconMap(progress);
      console.log("  (checkpoint iconMap written)");
    }
  }

  const stats = writeIconMap(progress);
  console.log(`\nDownloaded this run: ${fetched}`);
  console.log(`Wrote ${OUT_MAP} (${stats.ids} ids, ${stats.ok} local files)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
