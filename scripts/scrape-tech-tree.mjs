/**
 * Scrape Magnum technology tree upgrades (Ship_Upgrades cargo) for editor unlocks.
 *
 * Usage: node scripts/scrape-tech-tree.mjs
 *
 * Writes data/techLibrary.json — InternalName matches MagnumProgression._purchasedPerks
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "techLibrary.json");
const API = "https://quasimorph.wiki.gg/api.php";

const TREE_PAGES = [
  { page: "Cloning_Technology_Tree", module: "Cloning", url: "https://quasimorph.wiki.gg/wiki/Cloning_Technology_Tree" },
  { page: "Research_Technology_Tree", module: "Research", url: "https://quasimorph.wiki.gg/wiki/Research_Technology_Tree" },
  { page: "Supply_Technology_Tree", module: "Supply", url: "https://quasimorph.wiki.gg/wiki/Supply_Technology_Tree" },
  { page: "Engineering_Technology_Tree", module: "Engineering", url: "https://quasimorph.wiki.gg/wiki/Engineering_Technology_Tree" },
  { page: "Navigation_Technology_Tree", module: "Navigation", url: "https://quasimorph.wiki.gg/wiki/Navigation_Technology_Tree" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanWiki(s) {
  return String(s || "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^|\]]+)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<[^>]+>/g, "")
    .replace(/'''|''/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("format", "json");
  let delay = 1500;
  for (;;) {
    const res = await fetch(u, {
      headers: { "User-Agent": "QuasimorphSaveEditor/1.0 (tech tree scrape)" },
    });
    if (res.status === 429) {
      await sleep(delay);
      delay = Math.min(delay * 1.8, 60000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

async function fetchAllUpgrades() {
  const rows = [];
  let offset = 0;
  for (;;) {
    const j = await api({
      action: "cargoquery",
      tables: "Ship_Upgrades",
      fields: "_pageName,Effect,UnlockItem,Tech_ID,Department,InternalName,Module,Subtitle",
      limit: "100",
      offset: String(offset),
    });
    if (j.error) throw new Error(j.error.info || j.error.code);
    const batch = (j.cargoquery || []).map((r) => r.title || {});
    if (!batch.length) break;
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < 100) break;
    await sleep(300);
  }
  return rows;
}

async function main() {
  console.log("Fetching Ship_Upgrades cargo…");
  const raw = await fetchAllUpgrades();
  console.log(`Got ${raw.length} rows`);

  const techs = [];
  const byInternal = {};
  for (const r of raw) {
    const internalName = cleanWiki(r.InternalName || r.internalName);
    if (!internalName) continue;
    const entry = {
      wikiTitle: r._pageName || r.Page || r.title,
      internalName,
      techId: cleanWiki(r["Tech ID"] || r.Tech_ID || r.TechId) || null,
      module: cleanWiki(r.Module) || null,
      department: cleanWiki(r.Department) || null,
      subtitle: cleanWiki(r.Subtitle) || null,
      effect: cleanWiki(r.Effect) || null,
      unlockItem: cleanWiki(r.UnlockItem) || null,
      source: r._pageName
        ? `https://quasimorph.wiki.gg/wiki/${encodeURIComponent(String(r._pageName).replace(/ /g, "_"))}`
        : null,
    };
    techs.push(entry);
    byInternal[internalName] = entry;
  }
  techs.sort((a, b) => a.wikiTitle.localeCompare(b.wikiTitle));

  // Module hints from tree pages (imagemap nodes are display names; cargo has InternalName)
  const trees = [];
  for (const t of TREE_PAGES) {
    try {
      const j = await api({ action: "parse", page: t.page, prop: "images|wikitext", disablelimitreport: "1" });
      const wt = j.parse?.wikitext?.["*"] || "";
      const nodes = [...wt.matchAll(/\[\[([^|\]]+)\]\]/g)].map((m) => m[1]).filter((n) => !/^(File:|Category:)/i.test(n));
      trees.push({
        ...t,
        images: j.parse?.images || [],
        linkedNodes: [...new Set(nodes)],
      });
      console.log(`${t.module}: ${trees.at(-1).linkedNodes.length} linked nodes`);
    } catch (e) {
      console.warn(t.page, e.message);
      trees.push({ ...t, error: String(e.message || e) });
    }
    await sleep(400);
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: "Ship_Upgrades cargo + technology tree pages",
        scrapedAt: new Date().toISOString(),
        note: "internalName matches MagnumProgression._purchasedPerks. MagnumProjects (equipment/merc) are separate.",
        stats: { techs: techs.length },
        trees,
        techs,
        byInternalName: byInternal,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${OUT} (${techs.length} techs)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
