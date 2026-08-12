/**
 * Write data/pactMissing.json from wiki-scrape-progress (status === missing).
 * Usage: node scripts/build-pact-missing.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROGRESS = path.join(ROOT, "data", "wiki-scrape-progress.json");
const OUT = path.join(ROOT, "data", "pactMissing.json");

function main() {
  const prog = JSON.parse(fs.readFileSync(PROGRESS, "utf8"));
  const pages = prog.pages || prog.entries || [];
  const list = Array.isArray(pages) ? pages : Object.values(pages);
  const missing = list
    .filter((p) => (p.status || p.state) === "missing")
    .map((p) => ({
      title: p.title || p.wikiTitle || p.name || "",
      url: p.url || (p.title ? `https://quasimorph.wiki.gg/wiki/${encodeURIComponent(String(p.title).replace(/ /g, "_"))}` : ""),
      note: p.error || p.message || "wiki page missing",
    }))
    .filter((p) => p.title)
    .sort((a, b) => a.title.localeCompare(b.title));

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: "wiki-scrape-progress.json status=missing",
        builtAt: new Date().toISOString(),
        count: missing.length,
        note: "Re-run npm run scrape:pacts when the wiki adds these pages, then build:pacts + build:pact-missing.",
        missing,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${OUT} (${missing.length} missing)`);
}

main();
