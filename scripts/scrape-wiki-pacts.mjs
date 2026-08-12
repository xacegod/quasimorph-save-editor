/**
 * Resumable scrape of current (1.0+) S.K.U.L.L. Project pacts.
 *
 * Each run re-reads ==List of Pacts== from the live wiki, diffs against the
 * last snapshot (added / removed titles), and only scrapes current entries.
 * Pre-1.0 sections (Pre-0.9.9, Change History leftovers, etc.) are ignored.
 *
 * Incomplete / missing pages are checkpointed but excluded from the editor
 * library by build-pact-library.mjs.
 *
 * Usage:
 *   node scripts/scrape-wiki-pacts.mjs
 *   node scripts/scrape-wiki-pacts.mjs --status
 *   node scripts/scrape-wiki-pacts.mjs --retry-errors
 *   node scripts/scrape-wiki-pacts.mjs --force
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROGRESS = path.join(ROOT, "data", "wiki-scrape-progress.json");
const PACT_LIB = path.join(ROOT, "data", "pactLibrary.json");
const API = "https://quasimorph.wiki.gg/api.php";
const SOURCE_PAGE = "S.K.U.L.L._Project";

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const retryErrors = args.has("--retry-errors");
const statusOnly = args.has("--status");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS, "utf8"));
  } catch {
    return blankProgress();
  }
}

function blankProgress() {
  return {
    source: `https://quasimorph.wiki.gg/wiki/${SOURCE_PAGE}`,
    scope: "List of Pacts (game 1.0+ current only)",
    updatedAt: null,
    listVersionHint: null,
    listHash: null,
    titles: [],
    listHistory: [],
    pages: {},
  };
}

function saveProgress(progress) {
  progress.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(PROGRESS), { recursive: true });
  fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
}

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("format", "json");

  let delay = 1500;
  for (;;) {
    const res = await fetch(u, {
      headers: { "User-Agent": "QuasimorphSaveEditor/1.0 (resumable local scrape)" },
    });
    if (res.status === 429) {
      const wait = Math.min(delay, 60000);
      console.log(`  rate-limited (429), waiting ${Math.round(wait / 1000)}s…`);
      await sleep(wait);
      delay = Math.min(delay * 1.8, 60000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/(tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIds(internalName) {
  if (!internalName) return { skullId: null, perkId: null };
  const id = String(internalName).trim();
  if (id.startsWith("skull_")) {
    return { skullId: id, perkId: id.slice("skull_".length) };
  }
  if (id.startsWith("quest_skull_")) {
    return { skullId: id, perkId: id };
  }
  return { skullId: `skull_${id}`, perkId: id };
}

function isCompletePage(page) {
  if (!page || page.status !== "ok") return false;
  if (!page.perkId || !page.skullId) return false;
  if (!page.effect || String(page.effect).trim().length < 8) return false;
  return true;
}

function parseWikiPage(title, wt, html) {
  const out = {
    wikiTitle: title,
    internalName: null,
    skullId: null,
    perkId: null,
    tier: null,
    charge: null,
    effect: null,
    rawInfobox: {},
  };

  const box = wt.match(/\{\{[Ii]nfobox[\s\S]*?\n\}\}/);
  if (box) {
    for (const m of box[0].matchAll(/\|\s*([^=|\n]+?)\s*=\s*([^\n]+)/g)) {
      out.rawInfobox[m[1].trim()] = m[2]
        .trim()
        .replace(/\[\[([^|\]]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a)
        .replace(/\{\{[^}]+\}\}/g, "")
        .trim();
    }
  }
  const pick = (...keys) => {
    for (const k of keys) {
      for (const [ik, v] of Object.entries(out.rawInfobox)) {
        if (ik.toLowerCase() === k.toLowerCase() && v) return v;
      }
    }
    return null;
  };
  out.internalName = pick("Internal name", "Internal Name", "ID", "Item ID");
  out.tier = pick("Tier", "Pact Tier");
  out.charge = pick("Charge", "Pact Charge", "Cost");

  const text = stripHtml(html);
  if (!out.internalName) {
    const m =
      text.match(/Internal name\s+(skull_[a-z0-9_]+|quest_skull_[a-z0-9_]+|[a-z0-9_]+)/i) ||
      text.match(/\b(skull_[a-z0-9_]+)\b/);
    if (m) out.internalName = m[1];
  }
  Object.assign(out, normalizeIds(out.internalName));

  const em = text.match(/Effect\s+(.+?)(?:\s+Penalty|\s+Bane|\s+Trivia|\s+Change History|$)/i);
  if (em) out.effect = em[1].trim().slice(0, 600);
  const tm = text.match(/Tier\s+(I{1,3}|IV|V|\d+)/i);
  if (tm && !out.tier) out.tier = tm[1];
  const cm = text.match(/(\d+)\s*Pact Charge/i);
  if (cm && !out.charge) out.charge = cm[1];

  return out;
}

function needsFetch(entry) {
  if (force) return true;
  if (!entry) return true;
  if (entry.status === "ok" && isCompletePage(entry)) return false;
  if (entry.status === "ok" && !isCompletePage(entry)) return retryErrors || force;
  if (entry.status === "incomplete") return retryErrors || force;
  if (entry.status === "missing") return false;
  if (entry.status === "error") return retryErrors || force;
  if (entry.status === "skipped-pre1" || entry.status === "skipped-legacy") return false;
  if (entry.status === "removed-from-list") return false;
  return true;
}

function summarize(progress, titles) {
  const counts = { ok: 0, incomplete: 0, missing: 0, error: 0, pending: 0, other: 0 };
  for (const t of titles) {
    const e = progress.pages[t];
    if (!e) counts.pending++;
    else if (e.status === "ok" && isCompletePage(e)) counts.ok++;
    else if (e.status === "ok" || e.status === "incomplete") counts.incomplete++;
    else if (e.status === "missing") counts.missing++;
    else if (e.status === "error") counts.error++;
    else counts.other++;
  }
  return { total: titles.length, ...counts };
}

/**
 * Current 1.0+ pacts only from ==List of Pacts==.
 * Stops before any pre-1.0 / historical section.
 */
function extractCurrentList(wikitext) {
  const start = wikitext.search(/==\s*List of Pacts\s*==/i);
  if (start < 0) throw new Error(`Could not find ==List of Pacts== on ${SOURCE_PAGE}`);

  // Anything after these is historical / meta — ignore for the catalog.
  const endMatchers = [
    /==\s*Pre-0\.9\.9 Pacts\s*==/i,
    /==\s*Pre-1\.0[^\n=]*==/i,
    /==\s*Pre[- ]?1\.0[^\n=]*Pacts\s*==/i,
    /==\s*Legacy Pacts\s*==/i,
    /==\s*Old Pacts\s*==/i,
    /==\s*Trivia\s*==/i,
    /==\s*Change History\s*==/i,
  ];
  let end = wikitext.length;
  for (const re of endMatchers) {
    const i = wikitext.search(re);
    if (i > start && i < end) end = i;
  }

  const section = wikitext.slice(start, end);
  const versionHint =
    (section.match(/As of\s+([0-9]+(?:\.[0-9]+)*)/i) || [])[1] ||
    (section.match(/\b(1\.\d+(?:\.\d+)?)\b/) || [])[1] ||
    null;

  const titles = [];
  // Primary format on the page today
  for (const m of section.matchAll(/\{\{\s*Item\s*\|\s*([^}|]+)/gi)) {
    const name = m[1].trim();
    if (name) titles.push(name);
  }
  // Future-proof: plain wiki links inside the list section
  for (const m of section.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g)) {
    const name = m[1].trim();
    if (!name || /^(File:|Image:|Category:)/i.test(name)) continue;
    titles.push(name);
  }

  const unique = [...new Set(titles)];
  const hash = crypto.createHash("sha1").update(unique.join("\n")).digest("hex").slice(0, 12);
  return { titles: unique, versionHint, sectionChars: section.length, listHash: hash };
}

async function fetchCurrentList() {
  const j = await api({ action: "parse", page: SOURCE_PAGE, prop: "wikitext" });
  const wt = j.parse?.wikitext?.["*"] || "";
  return extractCurrentList(wt);
}

function diffTitles(prevTitles, nextTitles) {
  const prev = new Set(prevTitles || []);
  const next = new Set(nextTitles || []);
  const added = [...next].filter((t) => !prev.has(t)).sort((a, b) => a.localeCompare(b));
  const removed = [...prev].filter((t) => !next.has(t)).sort((a, b) => a.localeCompare(b));
  return { added, removed };
}

function seedFromPactLibrary(progress, allow) {
  try {
    const lib = JSON.parse(fs.readFileSync(PACT_LIB, "utf8"));
    let n = 0;
    for (const p of lib.pacts || []) {
      const title = p.wikiTitle;
      if (!title || !allow.has(title)) continue;
      if (progress.pages[title] && isCompletePage(progress.pages[title])) continue;
      if (!p.perkId || !p.skullId || !p.effect) continue;
      progress.pages[title] = {
        status: "ok",
        scrapedAt: lib.builtAt || new Date().toISOString(),
        wikiTitle: title,
        internalName: p.skullId || p.perkId,
        skullId: p.skullId,
        perkId: p.perkId,
        tier: p.tier || null,
        charge: p.charge || null,
        effect: p.effect,
        seededFrom: "pactLibrary.json",
      };
      n++;
    }
    return n;
  } catch {
    return 0;
  }
}

function applyListChanges(progress, list) {
  const prevTitles = progress.titles || [];
  const { added, removed } = diffTitles(prevTitles, list.titles);
  const changed = added.length > 0 || removed.length > 0 || progress.listHash !== list.listHash;

  if (changed) {
    progress.listHistory = progress.listHistory || [];
    progress.listHistory.push({
      at: new Date().toISOString(),
      listVersionHint: list.versionHint,
      listHash: list.listHash,
      count: list.titles.length,
      added,
      removed,
    });
    // Keep history bounded
    if (progress.listHistory.length > 50) {
      progress.listHistory = progress.listHistory.slice(-50);
    }
  }

  progress.scope = "List of Pacts (game 1.0+ current only; ignores pre-1.0 sections)";
  progress.listVersionHint = list.versionHint;
  progress.listHash = list.listHash;
  progress.titles = list.titles;

  const allow = new Set(list.titles);

  // Mark titles that fell off the current list (removed from wiki or were pre-1.0)
  for (const [title, page] of Object.entries(progress.pages)) {
    if (allow.has(title)) continue;
    if (page.status === "removed-from-list" || page.status === "skipped-pre1") continue;
    progress.pages[title] = {
      ...page,
      status: removed.includes(title) ? "removed-from-list" : "skipped-pre1",
      note: removed.includes(title)
        ? "No longer listed under current List of Pacts"
        : "Outside current 1.0+ List of Pacts (pre-1.0 / legacy / non-list)",
    };
  }

  // New titles get no page entry yet → pending scrape
  return { added, removed, changed };
}

async function main() {
  console.log(`Loading ${SOURCE_PAGE} → current List of Pacts (1.0+ only)…`);
  const list = await fetchCurrentList();
  console.log(
    `Wiki list: ${list.titles.length} pacts` +
      (list.versionHint ? ` (As of ${list.versionHint})` : "") +
      ` · hash ${list.listHash}`
  );

  const progress = loadProgress();
  const { added, removed, changed } = applyListChanges(progress, list);

  if (!changed && (progress.titles || []).length) {
    console.log("List unchanged since last scrape snapshot.");
  } else {
    console.log(`List delta: +${added.length} / -${removed.length}`);
    if (added.length) {
      console.log("Added:");
      added.forEach((t) => console.log("  +", t));
    }
    if (removed.length) {
      console.log("Removed (ignored going forward):");
      removed.forEach((t) => console.log("  -", t));
    }
  }

  const allow = new Set(list.titles);
  const seeded = seedFromPactLibrary(progress, allow);
  if (seeded) console.log(`Seeded ${seeded} complete pages from existing pactLibrary.json`);
  saveProgress(progress);

  const summary = summarize(progress, list.titles);
  console.log(
    `Progress: ${summary.ok} complete, ${summary.incomplete} incomplete, ${summary.missing} missing, ${summary.error} errors, ${summary.pending} pending / ${summary.total}`
  );

  if (statusOnly) {
    const pending = list.titles.filter((t) => needsFetch(progress.pages[t]));
    console.log(`Would fetch: ${pending.length}`);
    if (added.length) console.log(`(includes ${added.length} newly listed pact(s))`);
    pending.slice(0, 50).forEach((t) => console.log(" -", t));
    if (pending.length > 50) console.log(` … +${pending.length - 50} more`);
    return;
  }

  let fetched = 0;
  let skipped = 0;
  for (let i = 0; i < list.titles.length; i++) {
    const title = list.titles[i];
    if (!needsFetch(progress.pages[title])) {
      skipped++;
      continue;
    }

    const isNew = added.includes(title);
    process.stdout.write(`[${i + 1}/${list.titles.length}] ${title}${isNew ? " (new)" : ""}… `);
    try {
      const page = await api({
        action: "parse",
        page: title,
        prop: "wikitext|text",
        disablelimitreport: "1",
      });
      if (page.error) {
        const msg = page.error.info || page.error.code || "missing";
        const missing = /doesn't exist|missingtitle/i.test(msg);
        progress.pages[title] = {
          status: missing ? "missing" : "error",
          scrapedAt: new Date().toISOString(),
          wikiTitle: title,
          error: msg,
        };
        saveProgress(progress);
        console.log(missing ? "missing (excluded)" : `FAIL ${msg}`);
        fetched++;
        await sleep(800);
        continue;
      }

      const info = parseWikiPage(title, page.parse?.wikitext?.["*"] || "", page.parse?.text?.["*"] || "");
      const entry = {
        status: "ok",
        scrapedAt: new Date().toISOString(),
        wikiTitle: title,
        internalName: info.internalName,
        skullId: info.skullId,
        perkId: info.perkId,
        tier: info.tier,
        charge: info.charge,
        effect: info.effect,
        rawInfobox: info.rawInfobox,
      };
      if (!isCompletePage(entry)) {
        entry.status = "incomplete";
        entry.note = "Missing internal id and/or effect text — excluded from library";
        progress.pages[title] = entry;
        saveProgress(progress);
        console.log("incomplete (excluded)");
      } else {
        progress.pages[title] = entry;
        saveProgress(progress);
        console.log(info.perkId);
      }
      fetched++;
    } catch (e) {
      progress.pages[title] = {
        status: "error",
        scrapedAt: new Date().toISOString(),
        wikiTitle: title,
        error: String(e.message || e),
      };
      saveProgress(progress);
      fetched++;
      console.log("FAIL", e.message);
    }

    await sleep(1200);
  }

  const end = summarize(progress, list.titles);
  console.log(`\nDone this run: fetched ${fetched}, skipped ${skipped}`);
  console.log(
    `Totals: ${end.ok} complete, ${end.incomplete} incomplete, ${end.missing} missing, ${end.error} errors, ${end.pending} pending / ${end.total}`
  );
  if (added.length) console.log(`New on wiki this run: ${added.length}`);
  if (removed.length) console.log(`Removed from wiki list this run: ${removed.length}`);
  console.log(`Checkpoint: ${PROGRESS}`);
  console.log(`Next: node scripts/build-pact-library.mjs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
