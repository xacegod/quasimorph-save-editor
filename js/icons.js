/**
 * Same-origin item/perk icons from data/icons (via iconMap.json).
 *
 * Important: the wiki CDN blocks browser hotlinking (403 / NotSameOrigin).
 * The editor only loads local paths from the map — one request per known id,
 * no speculative Inv_/Perk_ fallbacks, no wiki traffic from the page.
 */
/** @type {Record<string, string>} id -> relative path under data/ (e.g. icons/Inv_foo.png) */
let iconMap = {};

/** Session caches so re-renders don't spam */
const failedIds = new Set();
const resolvedUrl = new Map(); // id -> full URL or ""

export async function loadIconMap(url = "data/iconMap.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    iconMap = data.icons || {};
    failedIds.clear();
    resolvedUrl.clear();
  } catch (e) {
    console.warn("icon map not loaded", e);
    iconMap = {};
  }
  return Object.keys(iconMap).length;
}

function candidatesForId(id) {
  const raw = String(id || "").toLowerCase();
  if (!raw) return [];
  const out = [raw];
  const base = raw.replace(/_(basic|advanced|master|legend)$/i, "");
  if (base !== raw) out.push(base);
  const noVar = raw.replace(/_\d+$/, "");
  if (noVar !== raw) out.push(noVar);
  if (raw.startsWith("skull_")) out.push(raw.slice(6));
  for (const x of [...out]) {
    if (x.includes("'")) out.push(x.replace(/'/g, ""));
  }
  return [...new Set(out)];
}

function localPathForId(id) {
  for (const key of candidatesForId(id)) {
    const rel = iconMap[key];
    if (!rel) continue;
    // Map stores "icons/Foo.png" → serve as "data/icons/Foo.png"
    if (rel.startsWith("data/")) return rel;
    if (rel.startsWith("icons/")) return `data/${rel}`;
    if (rel.startsWith("http")) return null; // never hotlink wiki from the browser
    return `data/${rel}`;
  }
  return null;
}

/**
 * Same-origin icon URL, or null if unknown / previously failed.
 * Does not invent wiki URLs — avoids 404 spam and CDN blocks.
 */
export function iconUrl(id) {
  if (!id || failedIds.has(id)) return null;
  if (resolvedUrl.has(id)) {
    const u = resolvedUrl.get(id);
    return u || null;
  }
  const path = localPathForId(id);
  resolvedUrl.set(id, path || "");
  return path || null;
}

function markFailed(id) {
  if (!id) return;
  failedIds.add(id);
  resolvedUrl.set(id, "");
}

/** Create an <img class="icon"> or a placeholder — at most one network request. */
export function iconEl(id, { size = 24, title = "" } = {}) {
  const url = iconUrl(id);
  if (!url) {
    const span = document.createElement("span");
    span.className = "icon missing";
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.title = title || id || "";
    return span;
  }
  const img = document.createElement("img");
  img.className = "icon";
  img.src = url;
  img.width = size;
  img.height = size;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.title = title || id || "";
  img.onerror = () => {
    markFailed(id);
    img.classList.add("missing");
    img.removeAttribute("src");
    img.style.visibility = "hidden";
  };
  return img;
}

/** HTML snippet for tables — one src, no fallback chain. */
export function iconHtml(id, size = 22) {
  const url = iconUrl(id);
  if (!url) return `<span class="icon missing" style="width:${size}px;height:${size}px"></span>`;
  const safe = url.replace(/"/g, "&quot;");
  const safeId = String(id || "").replace(/"/g, "&quot;");
  return `<img class="icon" src="${safe}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async" data-icon-id="${safeId}" onerror="this.classList.add('missing');this.style.visibility='hidden';this.removeAttribute('src')" />`;
}

export function getIconMap() {
  return iconMap;
}
