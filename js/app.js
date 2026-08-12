import { parseSaveFile, downloadSave, getComponent } from "./parse.js";
import { loadCatalogs, searchCatalog, displayName, mergeSpawnableFromSave, getSpawnableIds, matchesSearch } from "./catalog.js";
import { indexItemsFromSave, getTemplateStats, createItemFromTemplates } from "./itemTemplates.js";
import {
  getMercenaries,
  mercLabel,
  STAT_FIELDS,
  COPY_SECTIONS,
  PERK_GROUPS,
  copyMercSections,
  clearCurse,
  clearCurseAll,
  instantFinishTraining,
  instantFinishAllTraining,
  healWounds,
  healAllWounds,
  inventorySummary,
  listPerks,
  collectPerkCatalogByType,
  collectSkullIds,
  setUltimateSkull,
  getInventoryStore,
} from "./merc.js";
import {
  listCargoEntries,
  filterCargoRows,
  setItemQuantity,
  deleteRows,
  copyStack,
  spawnItem,
  giveOneOfEach,
  giveOneOfEachIds,
  loadRecycleList,
  saveRecycleList,
  moveMatchingToRecycler,
  moveSpoilablesToFridge,
  moveRowsToStore,
  listStorageSizes,
  setStoreHeight,
  getCargo,
  getGameTime,
  uniqueIdsFromRows,
  findFreePos,
} from "./cargo.js";
import { fieldRow } from "./fields.js";
import { loadPerkLibrary, loadPactLibrary, mergedTalentCatalog, mergedUltimateCatalog, setTalent, addTalent, setUltimate, clearUltimate, pactLabel, pactMeta, getPactLibrary, perkHasExp, paramValueKey, inferParamKind, paramTypeHint, applyParamValue, maxPerkExp, canPromotePerk, promotePerkToMaxRank, perkNextId } from "./perkLibrary.js";
import { loadMercClasses, mercClassLabel, mercClassInfo, mercClassPerkLabels, classPerkInfo, classPerkSummary, getMercClasses, applyMercClass, classPerkDropdownLabel, classPerkSearchText } from "./mercClasses.js";
import {
  loadRankLibrary,
  loadPerkDefaults,
  rankLabel,
  rankMeta,
  paramLabel,
  formatDefaultHint,
  resetParamToDefault,
  resetPerkToDefaults,
  perkDefaultTemplate,
  getRankLibrary,
  resolveClassPerkTemplate,
  basePerkId,
  getPerkDefaults,
} from "./perkMeta.js";
import { loadIconMap, iconHtml, iconEl } from "./icons.js";
import {
  loadTechLibrary,
  getPurchasedPerks,
  addPurchasedPerk,
  removePurchasedPerk,
  unlockAllTechs,
  filterTechs,
  techSummary,
} from "./tech.js";
import {
  loadUnlockBaseline,
  loadEquipProjectLibrary,
  getUnlockLists,
  restoreFullUnlocks,
  getProjects,
  filterProjects,
  instantFinishProjects,
  deleteProjects,
  copyClassMods,
  copyMercKitFromProject,
  getEquipProjectLibrary,
  getEquipProjectCaps,
  countEquipProjects,
  unlockMaxEquipProjectSlots,
  addEquipProject,
  copyEquipMods,
  isWeaponProject,
  isArmorProject,
} from "./unlocks.js";
import { getFactions, uniqueFieldValues, bulkSet } from "./factions.js";
import { getDifficultyPreset, DIFFICULTY_GROUPS } from "./difficulty.js";
import { getTravel, getSpaceTime, getDebug, getRaid, isInDungeon } from "./world.js";
import { listComponents, schemaFor, renderSchemaHtml, bindFlatFields } from "./editor.js";

const state = {
  data: null,
  fileName: "slot_session.dat",
  view: "home",
  dirty: false,
  mercIndex: 0,
  cargoFilter: { query: "", store: "", hideQuest: false, newestCargo0: 0 },
  cargoSelected: new Set(),
  cargoPage: 0,
  spawnQuery: "",
  spawnSelectedId: "",
  spawnOffset: 0,
  projectTab: "equipment",
  projectSelected: new Set(),
  catalogOk: false,
};

const main = document.getElementById("main");
const statusEl = document.getElementById("status");
const btnSave = document.getElementById("btnSave");

function setStatus(msg, cls = "") {
  statusEl.className = cls;
  statusEl.textContent = msg;
}

function markDirty() {
  state.dirty = true;
  btnSave.disabled = !state.data;
  if (state.data) setStatus(`${state.fileName} · edited · SaveVersion ${state.data.SaveVersion}`, "warn");
}

function enableNav(on) {
  document.querySelectorAll("#nav button[data-view]").forEach((b) => {
    if (b.dataset.view === "home") return;
    b.disabled = !on;
  });
}

async function initCatalogs() {
  try {
    const info = await loadCatalogs();
    await loadUnlockBaseline();
    const talentN = await loadPerkLibrary();
    const pactN = await loadPactLibrary();
    const classN = await loadMercClasses();
    const rankN = await loadRankLibrary();
    const defN = await loadPerkDefaults();
    const iconN = await loadIconMap();
    const techN = await loadTechLibrary();
    const equipN = await loadEquipProjectLibrary();
    state.catalogOk = true;
    setStatus(
      `Catalogs ready: ${info.spawnableCount} items, ${talentN} talents, ${pactN} pacts, ${classN} classes, ${rankN} ranks, ${defN} perk defaults, ${iconN} icons, ${techN} techs, ${equipN} equip projects. Open a save.`
    );
  } catch (e) {
    state.catalogOk = false;
    setStatus(`Catalog load failed (${e.message}). Serve this folder over HTTP, or continue — names may be missing.`, "warn");
  }
}

async function openFile(file) {
  try {
    setStatus(`Parsing ${file.name}…`);
    const { data, fileName, size } = await parseSaveFile(file);
    state.data = data;
    state.fileName = fileName;
    state.dirty = false;
    state.mercIndex = 0;
    state.cargoSelected.clear();
    state.projectSelected.clear();
    const tmpl = indexItemsFromSave(data);
    const catalogAdded = mergeSpawnableFromSave(data);
    btnSave.disabled = false;
    enableNav(true);
    const catalogNote = catalogAdded ? ` · +${catalogAdded} catalog ids` : "";
    if (data.SaveVersion !== 50) {
      setStatus(`Loaded ${fileName} (${(size / 1e6).toFixed(1)} MB). Warning: SaveVersion ${data.SaveVersion} ≠ 50.${catalogNote}`, "warn");
    } else {
      setStatus(
        `Loaded ${fileName} (${(size / 1e6).toFixed(1)} MB) · dungeon=${data.IsInDungeon} · templates ${tmpl.uniqueIds} ids / ${tmpl.signatures} sigs (union ${tmpl.unionIds})${catalogNote} · ${getSpawnableIds().length} spawnable`
      );
    }
    render();
  } catch (e) {
    console.error(e);
    setStatus(`Failed to parse: ${e.message}`, "error");
  }
}

document.getElementById("btnOpen").addEventListener("click", () => document.getElementById("fileInput").click());
document.getElementById("fileInput").addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (f) openFile(f);
});
document.getElementById("btnSave").addEventListener("click", () => {
  if (!state.data) return;
  downloadSave(state.data, state.fileName);
  state.dirty = false;
  setStatus(`Downloaded ${state.fileName}`);
});

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn || btn.disabled) return;
  state.view = btn.dataset.view;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

// drag-drop
document.body.addEventListener("dragover", (e) => {
  e.preventDefault();
});
document.body.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) openFile(f);
});

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function render() {
  if (!state.data && state.view !== "home") state.view = "home";
  switch (state.view) {
    case "mercs":
      renderMercs();
      break;
    case "cargo":
      renderCargo();
      break;
    case "projects":
      renderProjects();
      break;
    case "unlocks":
      renderUnlocks();
      break;
    case "factions":
      renderFactions();
      break;
    case "difficulty":
      renderDifficulty();
      break;
    case "world":
      renderWorld();
      break;
    case "raw":
      renderRaw();
      break;
    default:
      renderHome();
  }
}

function renderHome() {
  const tmpl = state.data ? getTemplateStats() : null;
  main.innerHTML = "";
  const panel = el(`<div class="panel">
    <h2>Home</h2>
    <div id="dropzone">Drop a <code>slot_*_session.dat</code> here, or use Open save…</div>
    <p class="muted">UTF-8 JSON with BOM. Scalars stay strings. Capacity is Width×Height (grow-only).</p>
    <ul class="muted">
      <li>Mercs — stats, perks (Talent / Rank / Passive / Ultimate hints), copy kit, clear curse, training, heal</li>
      <li>Pacts — edit/remove the <em>current</em> ultimate here; unlock others by absorbing a skull in-game</li>
      <li>Cargo — filter, qty (Count may exceed Max), spawn / thin-spawn, recycle &amp; fridge autosort</li>
      <li>Projects — equipment templates (your modded weapons/armor), copy mods, edit JSON; max Weaponry/Arsenal slots via tech</li>
      <li>Unlocks — restore full unlocks from late-game baseline</li>
    </ul>
  </div>`);
  main.appendChild(panel);
  if (state.data) {
    const comps = listComponents(state.data);
    const info = el(`<div class="panel"><h2>Loaded: ${state.fileName}</h2>
      <p>SaveVersion ${state.data.SaveVersion} · IsInDungeon ${state.data.IsInDungeon}</p>
      <p class="muted">Item templates: ${tmpl.byId} ids, ${tmpl.bySig} signatures (union ${tmpl.unionById})</p>
      <div class="scroll-table"><table class="data"><thead><tr><th>Component</th><th>Detail</th></tr></thead>
      <tbody>${comps.map((c) => `<tr><td>${c.type}</td><td>${c.detail}</td></tr>`).join("")}</tbody></table></div>
    </div>`);
    main.appendChild(info);
  }
  const dz = panel.querySelector("#dropzone");
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("drag");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    const f = e.dataTransfer?.files?.[0];
    if (f) openFile(f);
  });
}

function renderMercs() {
  const mercs = getMercenaries(state.data);
  if (state.mercIndex >= mercs.length) state.mercIndex = Math.max(0, mercs.length - 1);
  main.innerHTML = "";
  const wrap = el(`<div class="panel"><h2>Mercenaries (${mercs.length})</h2>
    <div class="toolbar">
      <label>Edit <select id="mercSelect"></select></label>
      <button type="button" id="btnClearCurseAll" class="danger">Clear curse (all)</button>
      <button type="button" id="btnTrainAll" class="ok">Instant-finish all training</button>
      <button type="button" id="btnHealAll">Heal wounds (all)</button>
    </div>
    <div id="mercDetail"></div>
  </div>`);
  main.appendChild(wrap);
  const sel = wrap.querySelector("#mercSelect");
  mercs.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = mercLabel(m);
    if (i === state.mercIndex) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => {
    state.mercIndex = Number(sel.value) || 0;
    renderMercs();
  });
  wrap.querySelector("#btnClearCurseAll").onclick = () => {
    clearCurseAll(state.data);
    markDirty();
    setStatus("Cleared CurseData on all mercs");
    renderMercs();
  };
  wrap.querySelector("#btnTrainAll").onclick = () => {
    const n = instantFinishAllTraining(state.data);
    markDirty();
    setStatus(`Finished training on ${n} mercs`);
  };
  wrap.querySelector("#btnHealAll").onclick = () => {
    const n = healAllWounds(state.data);
    markDirty();
    setStatus(`Removed ${n} non-augment wound effects`);
    renderMercs();
  };

  const m = mercs[state.mercIndex];
  const detail = wrap.querySelector("#mercDetail");
  if (!m) {
    detail.textContent = "No mercs";
    return;
  }
  detail.appendChild(renderMercDetail(m, mercs));
}

function renderMercDetail(m, all) {
  const cd = m.CreatureData || {};
  const box = el(`<div>
    <h3>${mercLabel(m)}</h3>
    <p class="doc">Hover a <abbr class="help" title="Tooltip">?</abbr> for what the field does. Bools are dropdowns. Ultimates come from pacts; ranks come from class.</p>
    <div class="toolbar">
      <button type="button" id="btnClearCurse" title="Sets CurseData to {}. The game refills curse over time.">Clear curse</button>
      <button type="button" id="btnTrain" title="If State is Training, sets StateEndTime = StateStartTime.">Finish training</button>
      <button type="button" id="btnHeal" title="Removes wound effects that are not FromAugment. Keeps implants/augs.">Heal wounds</button>
    </div>
    <div id="identityFields"></div>
    <h3>Stats</h3>
    <div id="statFields"></div>
    <h3>Health</h3>
    <div id="healthFields"></div>
    <h3>Pact / ultimate</h3>
    <p class="doc"><strong>Reliable in this editor:</strong> edit parameters on the ultimate already on the merc, or <strong>Remove</strong> it (clears Ultimate perk + skull + <code>HasUltimate</code> — same outcome idea as the in-game <em>Breaking the Pact</em> item). <strong>To unlock a different pact properly:</strong> spawn/put the skull in inventory and <strong>absorb it in-game</strong>. Library Set/replace mainly keeps ids in sync for the <em>current</em> ultimate; it is not a full substitute for absorb (banes, charge, etc.).</p>
    <div id="pactFields"></div>
    <div id="ultPerks"></div>
    <h3>Class ranks</h3>
    <div id="rankPerks"></div>
    <h3>Talents (traits)</h3>
    <div id="talentPerks"></div>
    <h3>Passives and triggers</h3>
    <div id="otherPerks"></div>
    <h3>Inventory</h3>
    <p class="doc">Backpack and vest stacks are editable. Count may exceed Max (game can split). Equipment slots are equipped items — use Add to backpack/vest to spawn more. Copy-to-others clones the whole kit.</p>
    <div class="toolbar">
      <select id="invStore" title="Where to add the new stack">
        <option value="BackpackStore">Backpack</option>
        <option value="VestStore">Vest</option>
      </select>
      <input type="search" id="invItemQ" placeholder="Search by display name or item id…" style="min-width:12rem" />
      <select id="invItemId" style="min-width:16rem"></select>
      <input type="number" id="invQty" value="1" min="1" style="width:5rem" title="Stack count" />
      <button type="button" id="btnAddInv" class="ok">Add stack</button>
    </div>
    <div class="scroll-table" id="invTable"></div>
    <h3>Copy to other mercenaries</h3>
    <p class="doc">Each checked section is written into the same field on the target. Identity (name, profile, unique id) is never overwritten.</p>
    <div class="checks" id="copySections"></div>
    <div class="checks" id="copyTargets" style="max-height:12rem;overflow:auto;margin:0.4rem 0"></div>
    <div class="toolbar">
      <button type="button" id="btnCopySelected" class="primary">Copy to selected</button>
      <button type="button" id="btnCopyAll" class="ok">Copy to all others</button>
    </div>
    <h3>Augments / sockets</h3>
    <pre class="json-mini" id="augPre"></pre>
  </div>`);

  const ident = box.querySelector("#identityFields");
  ident.appendChild(fieldRow(m, "State", { onChange: markDirty }));

  {
    const classInfo = mercClassInfo(m.MercClassId);
    const row = el(`<div class="field-row"><label>Merc class <abbr class="help" title="Sets MercClassId from the wiki roster. Optionally swaps class Passive/Trigger perks using templates gathered from your saves (perkDefaults). Talent, Ultimate, Rank, and custom extras are kept.">?</abbr></label><div class="toolbar" style="flex-wrap:wrap"></div></div>`);
    const tools = row.lastChild;
    const sel = document.createElement("select");
    sel.style.minWidth = "16rem";
    const classes = getMercClasses();
    const cur = typeof m.MercClassId === "string" ? m.MercClassId : "";
    if (cur && !mercClassInfo(cur)) {
      const opt = document.createElement("option");
      opt.value = cur;
      opt.textContent = `${cur} (not in wiki list)`;
      sel.appendChild(opt);
    }
    for (const c of classes) {
      const opt = document.createElement("option");
      opt.value = c.classIdGuess;
      const n = (c.perks || []).length;
      opt.textContent = `${c.wikiTitle} (${c.classIdGuess}) · ${n} wiki perks`;
      sel.appendChild(opt);
    }
    if (cur) sel.value = cur;
    else if (classes[0]) sel.value = classes[0].classIdGuess;

    const tierSel = document.createElement("select");
    tierSel.title = "Which tier to pick when multiple templates exist in perkDefaults / this save";
    tierSel.innerHTML = `
      <option value="highest">Highest tier available</option>
      <option value="basic">Prefer basic</option>
      <option value="advanced">Prefer advanced</option>
      <option value="master">Prefer master</option>
      <option value="legend">Prefer legend</option>`;

    const replaceLbl = el(`<label title="Remove old class roster Passive/Trigger, add the new class wiki set. Keeps Talent / Ultimate / Rank and any non-class extras."><input type="checkbox" data-replace checked /> Replace class perks</label>`);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "primary";
    btn.textContent = "Apply class";
    btn.onclick = () => {
      const classId = sel.value;
      if (!classId) return;
      const extra = new Map();
      for (const t of ["Passive", "Trigger"]) {
        for (const [id, perk] of collectPerkCatalogByType(state.data, t)) extra.set(id, perk);
      }
      const result = applyMercClass(m, classId, {
        replaceClassPerks: replaceLbl.querySelector("input").checked,
        resolveTemplate: (base, wikiPerk) => {
          const resolved = resolveClassPerkTemplate(base, {
            preference: tierSel.value,
            extraCatalog: extra,
            tierIds: wikiPerk.tierIds,
          });
          if (!resolved) return { perkId: basePerkId(base) || base, template: null };
          return {
            perkId: resolved.perkId,
            template: resolved.template,
            fromLibrary: resolved.fromLibrary,
          };
        },
      });
      if (!result.ok) {
        setStatus(result.message, "warn");
        return;
      }
      markDirty();
      setStatus(result.message);
      renderMercs();
    };

    tools.appendChild(sel);
    tools.appendChild(tierSel);
    tools.appendChild(replaceLbl);
    tools.appendChild(btn);
    ident.appendChild(row);

    if (classInfo?.description) {
      const desc = document.createElement("p");
      desc.className = "doc muted";
      desc.textContent = classInfo.description;
      ident.appendChild(desc);
    }
    const labels = mercClassPerkLabels(m.MercClassId);
    if (labels.length) {
      const tip = document.createElement("p");
      tip.className = "doc muted";
      tip.textContent = `Wiki class perks (${labels.length}): ${labels.join(", ")}`;
      tip.title =
        classInfo?.perks
          ?.map((p) => classPerkSummary(p.internalName || p.wikiTitle))
          .filter(Boolean)
          .join("\n\n") || "";
      ident.appendChild(tip);
    } else if (m.MercClassId) {
      const tip = document.createElement("p");
      tip.className = "doc muted";
      tip.textContent = `No wiki perk roster for ${mercClassLabel(m.MercClassId)} yet — Apply still sets MercClassId.`;
      ident.appendChild(tip);
    }
  }

  const statBox = box.querySelector("#statFields");
  for (const f of STAT_FIELDS.filter((k) => k !== "HasUltimate")) {
    if (cd[f] === undefined) continue;
    statBox.appendChild(fieldRow(cd, f, { onChange: markDirty }));
  }

  const hf = box.querySelector("#healthFields");
  if (cd.Health) {
    for (const k of ["_value", "MaxValue", "MinValue", "_invulnerability", "_dmgMult"]) {
      if (cd.Health[k] === undefined) continue;
      hf.appendChild(fieldRow(cd.Health, k, { onChange: markDirty }));
    }
  }

  const pactBox = box.querySelector("#pactFields");
  if (m._pactLevel !== undefined) pactBox.appendChild(fieldRow(m, "_pactLevel", { onChange: markDirty }));
  if (cd.HasUltimate !== undefined) pactBox.appendChild(fieldRow(cd, "HasUltimate", { onChange: markDirty }));
  const skullSet = new Set(collectSkullIds(state.data));
  for (const p of getPactLibrary().values()) {
    if (p.skullId) skullSet.add(p.skullId);
  }
  const skulls = [...skullSet].sort();
  const skullRow = el(`<div class="field-row"><label>UltimateSkullItemId <abbr class="help" title="Skull that grants the pact ultimate. Prefer Set ultimate below — it keeps skull + Ultimate perk in sync. Empty = none.">?</abbr></label></div>`);
  const skullSearch = document.createElement("input");
  skullSearch.type = "search";
  skullSearch.placeholder = "Filter skull by display name or id…";
  skullSearch.style.minWidth = "14rem";
  skullSearch.style.marginRight = "0.4rem";
  const skullSel = document.createElement("select");
  function fillSkullOptions(filter) {
    const prev = skullSel.value;
    const curSkull = typeof cd.UltimateSkullItemId === "string" ? cd.UltimateSkullItemId : "";
    const opts = [{ value: "", label: "(none)" }];
    for (const s of skulls) {
      const perkId = s.replace(/^skull_/, "");
      const meta = pactMeta(perkId);
      const label = meta?.displayName || displayName(s);
      if (!matchesSearch(filter, s, perkId, label, meta?.wikiTitle)) continue;
      opts.push({ value: s, label: `${label} (${s})` });
    }
    if (curSkull && !opts.some((o) => o.value === curSkull)) {
      opts.push({ value: curSkull, label: curSkull });
    }
    skullSel.innerHTML = opts.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
    skullSel.value = opts.some((o) => o.value === prev) ? prev : curSkull || "";
  }
  fillSkullOptions("");
  skullSearch.oninput = () => fillSkullOptions(skullSearch.value);
  skullSel.onchange = () => {
    const skull = skullSel.value;
    if (!skull) {
      clearUltimate(m, state.data);
    } else {
      const perkId = skull.replace(/^skull_/, "");
      if (!setUltimate(m, perkId, state.data)) {
        setUltimateSkull(state.data, m, skull);
      }
    }
    markDirty();
    renderMercs();
  };
  skullRow.appendChild(skullSearch);
  skullRow.appendChild(skullSel);
  pactBox.appendChild(skullRow);

  function paramEditor(param, onChange, perkId = null) {
    const kind = inferParamKind(param);
    const key = paramValueKey(param);
    const defHint = perkId ? formatDefaultHint(perkId, param) : "";
    if (kind === "Boolean") {
      const wrap = document.createElement("span");
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "0.35rem";
      const sel = document.createElement("select");
      sel.title = `${paramTypeHint(param)}${defHint ? ` · ${defHint}` : ""}`;
      sel.innerHTML = `<option value="True">True</option><option value="False">False</option>`;
      sel.value = param.BoolVal === "False" || param[key] === "False" ? "False" : "True";
      sel.onchange = () => {
        const r = applyParamValue(param, sel.value);
        if (!r.ok) {
          sel.classList.add("invalid");
          return;
        }
        sel.classList.remove("invalid");
        onChange();
      };
      wrap.appendChild(sel);
      if (perkId && defaultHasParam(perkId, param.Name)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "↺";
        btn.title = `Reset to default (${defaultParamDisplay(perkId, param.Name)})`;
        btn.onclick = () => {
          if (!resetParamToDefault(perkId, param)) return;
          sel.value = param.BoolVal === "False" ? "False" : "True";
          onChange();
        };
        wrap.appendChild(btn);
      }
      if (defHint) {
        const hint = document.createElement("span");
        hint.className = "muted";
        hint.style.fontSize = "0.85em";
        hint.textContent = defHint;
        wrap.appendChild(hint);
      }
      return wrap;
    }
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "0.35rem";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = kind === "Float" ? "float" : "int";
    badge.title = paramTypeHint(param);
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = kind === "Float" ? "decimal" : "numeric";
    input.style.width = "7rem";
    input.value = param[key] ?? "";
    input.title = `${paramTypeHint(param)}${defHint ? ` · ${defHint}` : ""}`;
    const err = document.createElement("span");
    err.className = "muted";
    err.style.color = "#c44";
    err.style.fontSize = "0.85em";
    const sync = () => {
      const r = applyParamValue(param, input.value);
      if (!r.ok) {
        input.classList.add("invalid");
        err.textContent = r.message;
        return false;
      }
      input.classList.remove("invalid");
      err.textContent = "";
      input.value = r.value;
      onChange();
      return true;
    };
    input.onchange = sync;
    input.onblur = sync;
    wrap.appendChild(badge);
    wrap.appendChild(input);
    if (perkId && defaultHasParam(perkId, param.Name)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "↺";
      btn.title = `Reset to default (${defaultParamDisplay(perkId, param.Name)})`;
      btn.onclick = () => {
        if (!resetParamToDefault(perkId, param)) return;
        input.value = param[paramValueKey(param)] ?? "";
        input.classList.remove("invalid");
        err.textContent = "";
        onChange();
      };
      wrap.appendChild(btn);
    }
    if (defHint) {
      const hint = document.createElement("span");
      hint.className = "muted";
      hint.style.fontSize = "0.85em";
      hint.textContent = defHint;
      wrap.appendChild(hint);
    }
    wrap.appendChild(err);
    return wrap;
  }

  function defaultHasParam(perkId, name) {
    const t = perkDefaultTemplate(perkId);
    if (!t) return false;
    return [...(t.Parameters || []), ...(t.AIParameters || [])].some((x) => x.Name === name);
  }

  function defaultParamDisplay(perkId, name) {
    const t = perkDefaultTemplate(perkId);
    const p = [...(t?.Parameters || []), ...(t?.AIParameters || [])].find((x) => x.Name === name);
    return p ? p.IntVal ?? p.FloatVal ?? p.BoolVal : "?";
  }

  function difficultyExpNote() {
    const expMult = getDifficultyPreset(state.data)?.ExpMult;
    if (expMult == null) return "";
    return ` Difficulty <code>ExpMult</code> is <strong>${expMult}</strong> — it scales how much exp is needed to level perks (MaxExp in the save already reflects your run).`;
  }

  function renderPerkGroup(container, group) {
    const typeSet = new Set(group.types);
    const rows = listPerks(m)
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => typeSet.has(p.PerkType));
    const isTalent = group.id === "Talent";
    const isUltimate = group.id === "Ultimate";
    const cat = isTalent
      ? mergedTalentCatalog(state.data)
      : isUltimate
        ? mergedUltimateCatalog(state.data)
        : new Map();
    if (!isTalent && !isUltimate) {
      for (const t of group.types) {
        for (const [id, perk] of collectPerkCatalogByType(state.data, t)) cat.set(id, perk);
      }
      if (group.id === "Rank") {
        for (const [id, meta] of getRankLibrary()) {
          if (cat.has(id)) continue;
          const tmpl = perkDefaultTemplate(id);
          if (tmpl) cat.set(id, tmpl);
          else {
            cat.set(id, {
              PerkId: id,
              PerkType: "Rank",
              Parameters: meta.Parameters || [],
              AIParameters: [],
              NextPerkId: meta.NextPerkId ?? {},
              LevelUpActionType: meta.LevelUpActionType || "AnyKill",
              CurrentExp: "0",
              ExpPerAction: meta.ExpPerAction || "1",
              MaxExp: meta.MaxExp || "0",
            });
          }
        }
      }
      if (group.id === "Other") {
        // Library + wiki roster so the dropdown is browsable by human names, not only save ids
        for (const [id, tmpl] of getPerkDefaults()) {
          if ((tmpl.PerkType === "Passive" || tmpl.PerkType === "Trigger") && !cat.has(id)) {
            cat.set(id, perkDefaultTemplate(id));
          }
        }
        for (const c of getMercClasses()) {
          for (const wp of c.perks || []) {
            if (!wp.internalName) continue;
            const resolved = resolveClassPerkTemplate(wp.internalName, {
              preference: "highest",
              tierIds: wp.tierIds,
              extraCatalog: cat,
            });
            const perkId = resolved?.perkId || wp.internalName;
            if (cat.has(perkId)) continue;
            if (resolved?.template) {
              cat.set(perkId, resolved.template);
            } else {
              const type = /trigger/i.test(wp.mainClass || "") ? "Trigger" : "Passive";
              cat.set(perkId, {
                PerkId: perkId,
                PerkType: type,
                Parameters: [],
                AIParameters: [],
                NextPerkId: {},
                LevelUpActionType: "None",
                CurrentExp: "0",
                ExpPerAction: "0",
                MaxExp: "0",
              });
            }
          }
        }
      }
    }
    const primaryLabel = isTalent ? "Set / replace" : isUltimate ? "Set / edit ultimate" : "Add";
    const wrap = el(`<div>
      <p class="doc">${group.help}${group.id === "Rank" || group.id === "Other" ? difficultyExpNote() : ""}</p>
      <div class="toolbar">
        <input type="search" data-perkq placeholder="${
          group.id === "Other"
            ? "Filter by name, effect, class, or perk id…"
            : "Filter by display name or perk id…"
        }" style="min-width:14rem" />
        <select data-add style="${group.id === "Other" ? "min-width:28rem;max-width:min(52rem,100%)" : ""}"></select>
        <button type="button" class="ok" data-addbtn title="${
          isTalent
            ? "Replace all Talent perks on this merc with the selected one."
            : isUltimate
              ? "Sync the current ultimate + skull for editing. Prefer absorb in-game to unlock a new pact."
              : "Clone this perk onto the merc from another copy in this save."
        }">${primaryLabel}</button>
        ${
          isTalent
            ? `<button type="button" data-stack title="Keep existing talents and add this one too. Game UI normally allows one; stacking often still works.">Add (stack)</button>`
            : ""
        }
      </div>
      <div data-list></div>
    </div>`);
    const sel = wrap.querySelector("[data-add]");
    const perkQ = wrap.querySelector("[data-perkq]");
    const currentUltimateId = isUltimate ? rows[0]?.p?.PerkId : null;

    function fillPerkOptions(filter) {
      const prev = sel.value;
      const isOther = group.id === "Other";
      const ids = [...cat.keys()].sort((a, b) => {
        if (isUltimate) return pactLabel(a).localeCompare(pactLabel(b)) || a.localeCompare(b);
        if (group.id === "Rank") return rankLabel(a).localeCompare(rankLabel(b)) || a.localeCompare(b);
        if (isOther) return classPerkDropdownLabel(a).localeCompare(classPerkDropdownLabel(b)) || a.localeCompare(b);
        return a.localeCompare(b);
      });
      sel.innerHTML = "";
      for (const id of ids) {
        const meta = isUltimate ? pactMeta(id) : null;
        const cp = !isUltimate && group.id !== "Rank" ? classPerkInfo(id) : null;
        let label = id;
        if (isUltimate) label = pactLabel(id);
        else if (group.id === "Rank") label = rankLabel(id);
        else if (isOther) label = classPerkDropdownLabel(id);
        else if (cp) label = `${cp.wikiTitle} (${id})`;
        const flavorBits = isOther ? classPerkSearchText(id) : [];
        if (
          !matchesSearch(
            filter,
            id,
            label,
            meta?.displayName,
            meta?.wikiTitle,
            meta?.skullId,
            cp?.wikiTitle,
            cp?.mainClass,
            cp?.perkTrigger,
            rankMeta(id)?.displayName,
            ...flavorBits
          )
        ) {
          continue;
        }
        const opt = document.createElement("option");
        opt.value = id;
        const tip = isOther ? classPerkSummary(id) : "";
        if (tip) opt.title = tip;
        if (isUltimate) {
          opt.textContent = id === currentUltimateId ? `${label} (current)` : label;
        } else {
          const owned = (cd.Perks || []).some((p) => p.PerkId === id);
          opt.textContent = owned ? `${label} (on merc)` : label;
        }
        sel.appendChild(opt);
      }
      if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
      else if (currentUltimateId && [...sel.options].some((o) => o.value === currentUltimateId)) {
        sel.value = currentUltimateId;
      }
    }
    fillPerkOptions("");
    perkQ.oninput = () => fillPerkOptions(perkQ.value);
    wrap.querySelector("[data-addbtn]").onclick = () => {
      const id = sel.value;
      if (isTalent) {
        if (!setTalent(m, id, state.data)) return;
        setStatus(`Talent set to ${id} (replaced other talents)`);
      } else if (isUltimate) {
        if (!setUltimate(m, id, state.data)) return;
        setStatus(`Ultimate set to ${pactLabel(id)} — prefer absorb in-game for a brand-new pact`);
      } else {
        const tmpl = cat.get(id);
        if (!tmpl) return;
        if (!cd.Perks) cd.Perks = [];
        cd.Perks.push(JSON.parse(JSON.stringify(tmpl)));
      }
      markDirty();
      renderMercs();
    };
    wrap.querySelector("[data-stack]")?.addEventListener("click", () => {
      const id = sel.value;
      if (!addTalent(m, id, state.data)) {
        setStatus(`${id} is already on this merc`);
        return;
      }
      markDirty();
      setStatus(`Stacked talent ${id}`);
      renderMercs();
    });

    const list = wrap.querySelector("[data-list]");
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state">None on this merc. Use ${primaryLabel}${isTalent ? " or Add (stack)" : ""}.</div>`;
    } else {
      for (const { p, i } of rows) {
        const meta = isUltimate ? pactMeta(p.PerkId) : null;
        const rMeta = group.id === "Rank" ? rankMeta(p.PerkId) : null;
        const classPerk = !isUltimate && group.id !== "Rank" ? classPerkInfo(p.PerkId) : null;
        let title = p.PerkId;
        if (isUltimate) title = pactLabel(p.PerkId);
        else if (rMeta) title = rankLabel(p.PerkId);
        else if (classPerk) title = `${classPerk.wikiTitle} (${p.PerkId})`;
        const wikiBlurb =
          meta?.effect || rMeta?.wikiBonuses || classPerkSummary(p.PerkId) || "";
        const hasDefaults = !!perkDefaultTemplate(p.PerkId);
        const card = el(`<div class="panel" style="margin:0.5rem 0">
          <div class="toolbar">
            <span data-icon></span>
            <strong title="${wikiBlurb.replace(/"/g, "&quot;")}">${title}</strong>
            <span class="badge">${p.PerkType}</span>
            <button type="button" class="danger" data-del title="${
              isUltimate
                ? "Clears Ultimate perk + skull + HasUltimate (like Breaking the Pact)."
                : "Remove this perk from the merc."
            }">Remove</button>
          </div>
          ${wikiBlurb ? `<p class="doc muted">${wikiBlurb}</p>` : ""}
          <div data-params></div>
        </div>`);
        card.querySelector("[data-icon]").replaceWith(
          iconEl(isUltimate ? meta?.skullId || `skull_${p.PerkId}` : p.PerkId, {
            size: 28,
            title,
          })
        );
        const toolbar = card.querySelector(".toolbar");
        const delBtn = card.querySelector("[data-del]");
        if (hasDefaults) {
          const btnReset = document.createElement("button");
          btnReset.type = "button";
          btnReset.textContent = "Reset params";
          btnReset.title = "Restore Parameters / MaxExp / NextPerkId from the default template library.";
          btnReset.onclick = () => {
            if (!resetPerkToDefaults(p)) return;
            markDirty();
            setStatus(`Reset ${p.PerkId} parameters to defaults`);
            renderMercs();
          };
          toolbar.insertBefore(btnReset, delBtn);
        }
        if (perkHasExp(p)) {
          const expLabel = document.createElement("span");
          expLabel.className = "muted";
          expLabel.textContent = "exp";
          const exp = document.createElement("input");
          exp.type = "number";
          exp.style.width = "5rem";
          exp.value = p.CurrentExp || "0";
          exp.title = `CurrentExp / MaxExp ${p.MaxExp}${perkNextId(p) ? ` → ${perkNextId(p)}` : ""}. MaxExp is already shaped by difficulty ExpMult.`;
          exp.onchange = () => {
            p.CurrentExp = exp.value;
            markDirty();
          };
          const maxHint = document.createElement("span");
          maxHint.className = "muted";
          maxHint.textContent = `/ ${p.MaxExp}`;
          const btnMaxExp = document.createElement("button");
          btnMaxExp.type = "button";
          btnMaxExp.className = "ok";
          btnMaxExp.textContent = "Max exp";
          btnMaxExp.title = "Set CurrentExp = MaxExp for this perk (does not promote to the next rank by itself).";
          btnMaxExp.onclick = () => {
            if (!maxPerkExp(p)) return;
            markDirty();
            setStatus(`Maxed exp on ${p.PerkId} (${p.CurrentExp}/${p.MaxExp})`);
            renderMercs();
          };
          toolbar.insertBefore(expLabel, delBtn);
          toolbar.insertBefore(exp, delBtn);
          toolbar.insertBefore(maxHint, delBtn);
          toolbar.insertBefore(btnMaxExp, delBtn);
        } else if (p.PerkType === "Talent") {
          const tip = document.createElement("span");
          tip.className = "muted";
          tip.textContent = "no exp (Talent)";
          tip.title = "Talent perks are not leveling chains.";
          toolbar.insertBefore(tip, delBtn);
        }
        if (canPromotePerk(p, state.data)) {
          const btnMaxRank = document.createElement("button");
          btnMaxRank.type = "button";
          btnMaxRank.className = "primary";
          btnMaxRank.textContent = p.PerkType === "Rank" ? "Max rank" : "Max tier";
          btnMaxRank.title =
            p.PerkType === "Rank"
              ? "Set to rank_5 (Commander) with full max-rank bonuses. Lower ranks remain selectable if you want them."
              : `Promote along NextPerkId using templates from this save (e.g. ${p.PerkId} → … → highest available).`;
          btnMaxRank.onclick = () => {
            const next = promotePerkToMaxRank(m, i, state.data);
            if (!next) {
              setStatus(
                p.PerkType === "Rank"
                  ? `Cannot max rank — rank_5 template missing from library`
                  : `Cannot promote ${p.PerkId} — next tier not found in this save`
              );
              return;
            }
            markDirty();
            setStatus(
              p.PerkType === "Rank"
                ? `Max rank: ${p.PerkId} → rank_5 (Commander)`
                : `Promoted ${p.PerkId} → ${next.PerkId}`
            );
            renderMercs();
          };
          toolbar.insertBefore(btnMaxRank, delBtn);
        }
        const paramsBox = card.querySelector("[data-params]");
        if (!(p.Parameters || []).length && !(p.AIParameters || []).length) {
          paramsBox.innerHTML = hasDefaults
            ? `<p class="muted">No parameters on this copy — use <strong>Reset params</strong> to load defaults, or pick a copy from the save.</p>`
            : `<p class="muted">No parameters on this copy yet — pick one that already exists in the save (or edit after the game writes them).</p>`;
        } else {
          const table = el(`<table class="data"><thead><tr><th>Parameter</th><th>Type</th><th>Value</th></tr></thead><tbody></tbody></table>`);
          const tb = table.querySelector("tbody");
          for (const param of p.Parameters || []) {
            const tr = document.createElement("tr");
            const kind = inferParamKind(param);
            const label = paramLabel(param.Name);
            tr.innerHTML = `<td><code title="${paramTypeHint(param).replace(/"/g, "&quot;")}">${param.Name}</code>${
              label && label !== param.Name ? `<div class="muted" style="font-size:0.85em">${label}</div>` : ""
            }</td><td>${kind}</td><td></td>`;
            tr.lastChild.appendChild(paramEditor(param, markDirty, p.PerkId));
            tb.appendChild(tr);
          }
          for (const param of p.AIParameters || []) {
            const tr = document.createElement("tr");
            const kind = inferParamKind(param);
            const label = paramLabel(param.Name);
            tr.innerHTML = `<td><code title="${paramTypeHint(param).replace(/"/g, "&quot;")}">${param.Name}</code> <span class="badge">AI</span>${
              label && label !== param.Name ? `<div class="muted" style="font-size:0.85em">${label}</div>` : ""
            }</td><td>${kind}</td><td></td>`;
            tr.lastChild.appendChild(paramEditor(param, markDirty, p.PerkId));
            tb.appendChild(tr);
          }
          paramsBox.appendChild(table);
        }
        card.querySelector("[data-del]").onclick = () => {
          if (isUltimate) clearUltimate(m, state.data);
          else cd.Perks.splice(i, 1);
          markDirty();
          renderMercs();
        };
        list.appendChild(card);
      }
    }
    container.appendChild(wrap);
  }

  renderPerkGroup(box.querySelector("#ultPerks"), PERK_GROUPS.find((g) => g.id === "Ultimate"));
  renderPerkGroup(box.querySelector("#rankPerks"), PERK_GROUPS.find((g) => g.id === "Rank"));
  renderPerkGroup(box.querySelector("#talentPerks"), PERK_GROUPS.find((g) => g.id === "Talent"));
  renderPerkGroup(box.querySelector("#otherPerks"), PERK_GROUPS.find((g) => g.id === "Other"));

  function fillInvCatalog(q) {
    const sel = box.querySelector("#invItemId");
    const { items, total } = searchCatalog(q, { limit: 80, offset: 0 });
    sel.innerHTML = items.map((x) => `<option value="${x.id}">${x.name} (${x.id})</option>`).join("");
    sel.title = `${total} matches in item catalog`;
  }
  fillInvCatalog("");
  box.querySelector("#invItemQ").oninput = (e) => fillInvCatalog(e.target.value);

  box.querySelector("#btnAddInv").onclick = () => {
    const storeName = box.querySelector("#invStore").value;
    const id = box.querySelector("#invItemId").value;
    const qty = +box.querySelector("#invQty").value || 1;
    const store = getInventoryStore(m, storeName);
    if (!store || !id) return;
    const { item } = createItemFromTemplates(id, { qty, pos: "0 0" });
    const width = parseInt(item.Content.InventoryWidthSize, 10) || 1;
    item.Content.InventoryPos = findFreePos(store, width);
    setItemQuantity(item, qty);
    store.Items.push(item);
    markDirty();
    setStatus(`Added ${qty}× ${displayName(id)} to ${storeName}`);
    renderMercs();
  };

  const inv = inventorySummary(m);
  const invTable = box.querySelector("#invTable");
  invTable.innerHTML = `<table class="data"><thead><tr><th>Slot</th><th>Name</th><th>Id</th><th>Qty</th><th>Max</th><th></th></tr></thead><tbody>
    ${
      inv.length
        ? inv
            .map(
              (r, i) => `<tr>
        <td>${r.slot}</td><td>${iconHtml(r.id, 22)} ${r.name}</td><td><code>${r.id}</code></td>
        <td>${
          r.stackable || r.editable
            ? `<input type="number" data-qty="${i}" value="${r.stack || 1}" min="1" style="width:5rem" title="StackCount / Count. May exceed Max."/>`
            : r.stack || "1"
        }</td>
        <td>${r.max ?? "—"}</td>
        <td>${r.editable ? `<button type="button" class="danger" data-rm="${i}">Remove</button>` : ""}</td>
      </tr>`
            )
            .join("")
        : `<tr><td colspan="6" class="muted">Empty inventory</td></tr>`
    }
  </tbody></table>`;
  invTable.querySelectorAll("[data-qty]").forEach((inp) => {
    inp.onchange = () => {
      const r = inv[+inp.dataset.qty];
      if (r?.item) {
        setItemQuantity(r.item, inp.value);
        markDirty();
      }
    };
  });
  invTable.querySelectorAll("[data-rm]").forEach((b) => {
    b.onclick = () => {
      const r = inv[+b.dataset.rm];
      if (!r?.store) return;
      const idx = r.store.Items.indexOf(r.item);
      if (idx >= 0) r.store.Items.splice(idx, 1);
      markDirty();
      renderMercs();
    };
  });

  const secBox = box.querySelector("#copySections");
  for (const s of COPY_SECTIONS) {
    secBox.appendChild(
      el(`<label title="${s.help || ""}"><input type="checkbox" data-sec="${s.id}" checked /> ${s.label}</label>`)
    );
  }
  const tgtBox = box.querySelector("#copyTargets");
  all.forEach((om, i) => {
    if (om === m) return;
    tgtBox.appendChild(el(`<label><input type="checkbox" data-ti="${i}" /> ${mercLabel(om)}</label>`));
  });

  function selectedSections() {
    return [...secBox.querySelectorAll("input:checked")].map((x) => x.dataset.sec);
  }
  function doCopy(targets) {
    const n = copyMercSections(m, targets, selectedSections(), state.data);
    markDirty();
    setStatus(`Copied sections onto ${n} mercs`);
    renderMercs();
  }
  box.querySelector("#btnCopySelected").onclick = () => {
    const targets = [...tgtBox.querySelectorAll("input:checked")].map((x) => all[+x.dataset.ti]);
    if (!targets.length) return alert("Select target mercs");
    if (!confirm(`Copy to ${targets.length} merc(s)?`)) return;
    doCopy(targets);
  };
  box.querySelector("#btnCopyAll").onclick = () => {
    if (!confirm(`Copy to all other mercs (${all.length - 1})?`)) return;
    doCopy(all.filter((x) => x !== m));
  };

  box.querySelector("#btnClearCurse").onclick = () => {
    clearCurse(m);
    markDirty();
    setStatus("Cleared curse");
  };
  box.querySelector("#btnTrain").onclick = () => {
    instantFinishTraining(m);
    markDirty();
    setStatus("Training finished");
    renderMercs();
  };
  box.querySelector("#btnHeal").onclick = () => {
    const n = healWounds(m);
    markDirty();
    setStatus(`Removed ${n} wound effects`);
  };

  box.querySelector("#augPre").textContent = JSON.stringify(
    { AugmentationMap: cd.AugmentationMap, WoundSlotMap: cd.WoundSlotMap },
    null,
    2
  ).slice(0, 4000);

  return box;
}

function renderCargo() {
  const all = listCargoEntries(state.data);
  const filtered = filterCargoRows(all, state.cargoFilter);
  const pageSize = 200;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (state.cargoPage >= pages) state.cargoPage = 0;
  const slice = filtered.slice(state.cargoPage * pageSize, (state.cargoPage + 1) * pageSize);
  const cargoRoot = getCargo(state.data);
  const stores = [
    ...(cargoRoot?.ShipCargo || []).map((_, i) => `ShipCargo[${i}]`),
    "RecyclingStorage",
    "FridgeStorage",
  ];

  main.innerHTML = "";
  const panel = el(`<div class="panel">
    <h2>Cargo (${filtered.length} / ${all.length} stacks shown)</h2>
    <p class="doc">Magnum has several cargo <em>tabs</em> (ShipCargo[0] is the first/general hold — newest loot is appended at the end). Recycler and fridge are separate small grids. Deleting items does not shrink capacity. If the table is empty, the filter matched nothing — the save may still have items.</p>
    <div class="toolbar">
      <input type="search" id="cargoQ" placeholder="Filter by display name or item id…" value="${state.cargoFilter.query.replace(/"/g, "&quot;")}" />
      <select id="cargoStore"><option value="">All stores</option>
        ${stores.map((s) => `<option value="${s}" ${state.cargoFilter.store === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <label title="Hide items whose id contains quest or is on the quest list."><input type="checkbox" id="hideQuest" ${state.cargoFilter.hideQuest ? "checked" : ""}/> Hide quest</label>
      <label title="Only the last N stacks on ShipCargo[0]. The game appends newly gained items at the end of that tab."><input type="checkbox" id="newestOnly" ${state.cargoFilter.newestCargo0 > 0 ? "checked" : ""}/> Newest from cargo tab 0</label>
      <input type="number" id="newestN" value="${state.cargoFilter.newestCargo0 || 80}" min="1" style="width:5rem" title="How many newest stacks on ShipCargo[0] to show" />
      <button type="button" id="btnClearFilter">Clear filter</button>
      <button type="button" id="btnPrev">Prev</button>
      <span class="muted">Page ${state.cargoPage + 1}/${pages}</span>
      <button type="button" id="btnNext">Next</button>
    </div>
    <div class="toolbar">
      <input type="number" id="qtyVal" value="200" min="1" style="width:6rem" />
      <button type="button" id="btnSetQty">Set qty on selected</button>
      <button type="button" id="btnCopyStack">Copy stack ×</button>
      <input type="number" id="multN" value="2" min="1" style="width:4rem" />
      <button type="button" id="btnMult">Multiply selected</button>
      <button type="button" id="btnDel" class="danger">Delete selected</button>
      <button type="button" id="btnDelFilter" class="danger">Delete filtered</button>
      <button type="button" id="btnToRecycle">Move selected → recycler</button>
      <button type="button" id="btnToFridge" title="Moves selected stacks into FridgeStorage and sets IsFrozen=True.">Move selected → fridge</button>
      <button type="button" id="btnFilterToRecycleList" class="ok" title="Remember every unique item id in the current filter as always-recycle.">Add filtered IDs to always-recycle</button>
      <button type="button" id="btnMoveFilteredRecycle">Move filtered → recycler</button>
    </div>
    <div class="scroll-table" id="cargoTable"></div>
  </div>`);
  main.appendChild(panel);

  // Spawn panel
  const spawn = el(`<div class="panel">
    <h2>Spawn from item catalog</h2>
    <p class="doc">Search the full playable item list (~1231 ids), then scroll the list to browse. Click a row to select it. Template spawn clones a similar item from the save; thin spawn writes a bare PickupItem for testing. <strong>Spawn each from filter</strong> adds one stack of every catalog match (needs a search string; uses qty).</p>
    <input type="search" id="spawnQ" placeholder="Search item catalog (display name or item id)…" value="${(state.spawnQuery || "").replace(/"/g, "&quot;")}" />
    <div class="catalog-meta" id="catalogMeta"></div>
    <div class="catalog-list" id="catalogList"></div>
    <div class="toolbar" style="margin-top:0.5rem">
      <input type="number" id="spawnQty" value="1" min="1" style="width:5rem" title="Stack count (Count may exceed Max)" />
      <input type="number" id="spawnCount" value="1" min="1" style="width:5rem" title="How many separate stacks to create" />
      <button type="button" id="btnSpawn" class="ok">Spawn selected (template)</button>
      <button type="button" id="btnThin" title="Minimal PickupItem with empty components — use to test if the game fills them in.">Thin spawn (prototype)</button>
      <button type="button" id="btnSpawnFiltered" class="ok" title="Spawn one stack of every item matching the catalog search above (uses qty).">Spawn each from filter</button>
      <button type="button" id="btnGiveAll" class="primary">Give one of each</button>
    </div>
    <h3>Always recycle + fridge</h3>
    <p class="doc"><strong>Fridge auto-move</strong> takes stacks from ship cargo tabs (not already in the fridge) if:
      (1) the item id contains <code>rotten</code>, or
      (2) it has <code>ExpireComponent</code> with <code>IsStarted=True</code>, <code>IsFrozen≠True</code>, and <code>ExpireDate</code> earlier than current game time.
      On move, <code>IsFrozen</code> is set True. Fresh food with a future expire date is left in cargo.</p>
    <div class="toolbar">
      <button type="button" id="btnRunRecycle" class="ok" title="Move every stack whose id is on the always-recycle list from ship cargo into RecyclingStorage.">Move always-recycle list → recycler</button>
      <button type="button" id="btnSpoilFridge" class="ok">Move rotten / expired → fridge</button>
      <button type="button" id="btnClearRecycle">Clear always-recycle list</button>
    </div>
    <div id="recycleList" class="muted"></div>
    <h3>Storage size (Width × Height = cell capacity)</h3>
    <p class="doc">Ship cargo tabs are often already huge (e.g. 8×1910). Recycler, fridge, and shuttle holds are the small ones you usually want to grow. Height is grow-only — deletes never shrink it. Hover a store name for which Magnum grid it is.</p>
    <div class="scroll-table" id="sizeTable"></div>
  </div>`);
  main.appendChild(spawn);

  const table = panel.querySelector("#cargoTable");
  if (!slice.length) {
    const filterBits = [
      state.cargoFilter.query && `name/id “${state.cargoFilter.query}”`,
      state.cargoFilter.store && `store ${state.cargoFilter.store}`,
      state.cargoFilter.newestCargo0 > 0 && `newest ${state.cargoFilter.newestCargo0} of cargo tab 0`,
      state.cargoFilter.hideQuest && "quest hidden",
    ].filter(Boolean);
    table.innerHTML = `<div class="empty-state">
      <strong>No results.</strong>
      <p>${all.length === 0 ? "This save currently has 0 cargo stacks." : `Filter matched <strong>0</strong> of <strong>${all.length}</strong> stacks still in the save.`}</p>
      <p class="muted">${filterBits.length ? "Active filter: " + filterBits.join(" · ") : "No filter — stores are empty."}</p>
      <p>This is expected after Delete filtered / a tight search — not a freeze. Use Clear filter to see remaining items.</p>
    </div>`;
  } else {
    table.innerHTML = `<table class="data"><thead><tr>
      <th><input type="checkbox" id="chkAll" /></th><th>Store</th><th>Name</th><th>Id</th><th>Stack</th><th>Count/Max</th><th>Pos</th>
    </tr></thead><tbody>
    ${slice
      .map((r) => {
        const key = `${r.storeKey}#${r.itemIndex}`;
        const sel = state.cargoSelected.has(key) ? "selected" : "";
        return `<tr class="${sel}" data-key="${key}">
          <td><input type="checkbox" data-key="${key}" ${state.cargoSelected.has(key) ? "checked" : ""}/></td>
          <td>${r.storeKey}</td><td>${iconHtml(r.id, 22)} ${r.name}${r.quest ? ' <span class="badge warn">quest</span>' : ""}</td>
          <td><code>${r.id}</code></td><td>${r.stack}</td><td>${r.count ?? "—"}/${r.max ?? "—"}</td><td>${r.pos || ""}</td></tr>`;
      })
      .join("")}
    </tbody></table>`;
  }

  const rowByKey = new Map();
  // rebuild keys against current filtered full list for actions
  filtered.forEach((r) => rowByKey.set(`${r.storeKey}#${r.itemIndex}`, r));
  // also map from all for safety after mutations we re-render

  function selectedRows() {
    // Use current all snapshot
    const fresh = listCargoEntries(state.data);
    const map = new Map(fresh.map((r) => [`${r.storeKey}#${r.itemIndex}`, r]));
    return [...state.cargoSelected].map((k) => map.get(k)).filter(Boolean);
  }

  table.querySelector("#chkAll")?.addEventListener("change", (e) => {
    slice.forEach((r) => {
      const key = `${r.storeKey}#${r.itemIndex}`;
      if (e.target.checked) state.cargoSelected.add(key);
      else state.cargoSelected.delete(key);
    });
    renderCargo();
  });
  table.querySelectorAll("input[data-key]").forEach((chk) => {
    chk.addEventListener("change", () => {
      if (chk.checked) state.cargoSelected.add(chk.dataset.key);
      else state.cargoSelected.delete(chk.dataset.key);
    });
  });

  panel.querySelector("#cargoQ").onchange = panel.querySelector("#cargoQ").onkeyup = (e) => {
    if (e.type === "keyup" && e.key !== "Enter") return;
    state.cargoFilter.query = panel.querySelector("#cargoQ").value;
    state.cargoPage = 0;
    renderCargo();
  };
  panel.querySelector("#cargoStore").onchange = (e) => {
    state.cargoFilter.store = e.target.value;
    state.cargoPage = 0;
    renderCargo();
  };
  panel.querySelector("#hideQuest").onchange = (e) => {
    state.cargoFilter.hideQuest = e.target.checked;
    renderCargo();
  };
  panel.querySelector("#newestOnly").onchange = (e) => {
    state.cargoFilter.newestCargo0 = e.target.checked ? +panel.querySelector("#newestN").value || 80 : 0;
    if (e.target.checked) state.cargoFilter.store = "ShipCargo[0]";
    state.cargoPage = 0;
    renderCargo();
  };
  panel.querySelector("#newestN").onchange = () => {
    if (panel.querySelector("#newestOnly").checked) {
      state.cargoFilter.newestCargo0 = +panel.querySelector("#newestN").value || 80;
      state.cargoPage = 0;
      renderCargo();
    }
  };
  panel.querySelector("#btnClearFilter").onclick = () => {
    state.cargoFilter = { query: "", store: "", hideQuest: false, newestCargo0: 0 };
    state.cargoPage = 0;
    renderCargo();
  };
  panel.querySelector("#btnPrev").onclick = () => {
    state.cargoPage = Math.max(0, state.cargoPage - 1);
    renderCargo();
  };
  panel.querySelector("#btnNext").onclick = () => {
    state.cargoPage = Math.min(pages - 1, state.cargoPage + 1);
    renderCargo();
  };

  panel.querySelector("#btnSetQty").onclick = () => {
    const qty = panel.querySelector("#qtyVal").value;
    const rows = selectedRows();
    for (const r of rows) setItemQuantity(r.item, qty);
    markDirty();
    setStatus(`Set qty=${qty} on ${rows.length} items`);
    renderCargo();
  };
  panel.querySelector("#btnCopyStack").onclick = () => {
    const n = +panel.querySelector("#multN").value || 1;
    let c = 0;
    for (const r of selectedRows()) c += copyStack(r, n);
    markDirty();
    setStatus(`Copied ${c} stacks`);
    state.cargoSelected.clear();
    renderCargo();
  };
  panel.querySelector("#btnMult").onclick = () => {
    const n = Math.max(1, +panel.querySelector("#multN").value || 1);
    let c = 0;
    for (const r of selectedRows()) c += copyStack(r, n);
    markDirty();
    setStatus(`Multiplied: added ${c} clones`);
    renderCargo();
  };
  panel.querySelector("#btnDel").onclick = () => {
    const rows = selectedRows();
    if (!confirm(`Delete ${rows.length} selected (quest kept)?`)) return;
    const n = deleteRows(rows, { keepQuest: true });
    markDirty();
    state.cargoSelected.clear();
    setStatus(`Deleted ${n}`);
    renderCargo();
  };
  panel.querySelector("#btnDelFilter").onclick = () => {
    const rows = filterCargoRows(listCargoEntries(state.data), state.cargoFilter);
    if (!confirm(`Delete ${rows.length} filtered (quest kept)?`)) return;
    const n = deleteRows(rows, { keepQuest: true });
    markDirty();
    state.cargoSelected.clear();
    setStatus(`Deleted ${n}`);
    renderCargo();
  };
  panel.querySelector("#btnToRecycle").onclick = () => {
    const cargo = getCargo(state.data);
    const n = moveRowsToStore(selectedRows(), cargo.RecyclingStorage);
    markDirty();
    state.cargoSelected.clear();
    setStatus(`Moved ${n} to recycler`);
    renderCargo();
  };
  panel.querySelector("#btnToFridge").onclick = () => {
    const cargo = getCargo(state.data);
    const n = moveRowsToStore(selectedRows(), cargo.FridgeStorage, { freeze: true, gameTime: getGameTime(state.data) });
    markDirty();
    state.cargoSelected.clear();
    setStatus(`Moved ${n} to fridge`);
    renderCargo();
  };
  panel.querySelector("#btnFilterToRecycleList").onclick = () => {
    const ids = uniqueIdsFromRows(filtered);
    const merged = [...new Set([...loadRecycleList(), ...ids])];
    saveRecycleList(merged);
    setStatus(`Always-recycle now has ${merged.length} ids (added ${ids.length} from filter)`);
    renderCargo();
  };
  panel.querySelector("#btnMoveFilteredRecycle").onclick = () => {
    const cargo = getCargo(state.data);
    const n = moveRowsToStore(filtered, cargo.RecyclingStorage);
    markDirty();
    state.cargoSelected.clear();
    setStatus(`Moved ${n} filtered stacks to recycler`);
    renderCargo();
  };

  const catalogList = spawn.querySelector("#catalogList");
  const catalogMeta = spawn.querySelector("#catalogMeta");
  let catalogOffset = 0;
  const CATALOG_PAGE = 80;
  function appendCatalog(reset) {
    if (reset) {
      catalogList.innerHTML = "";
      catalogOffset = 0;
    }
    const { items, total, hasMore } = searchCatalog(state.spawnQuery, { limit: CATALOG_PAGE, offset: catalogOffset });
    for (const x of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.replaceChildren(iconEl(x.id, { size: 22, title: x.name }), document.createTextNode(` ${x.name}  (${x.id})`));
      if (x.id === state.spawnSelectedId) b.classList.add("active");
      b.onclick = () => {
        state.spawnSelectedId = x.id;
        catalogList.querySelectorAll("button").forEach((el) => el.classList.toggle("active", el === b));
        catalogMeta.textContent = `Showing ${catalogOffset + items.length} / ${total} in item catalog. Scroll for more. Selected: ${x.name} (${x.id})`;
      };
      catalogList.appendChild(b);
    }
    catalogOffset += items.length;
    catalogMeta.textContent = `Showing ${catalogOffset} / ${total} in item catalog. ${hasMore ? "Scroll for more." : "End of list."} Selected: ${state.spawnSelectedId || "(click a row)"}`;
  }
  appendCatalog(true);
  catalogList.onscroll = () => {
    if (catalogList.scrollTop + catalogList.clientHeight >= catalogList.scrollHeight - 48) {
      const { hasMore } = searchCatalog(state.spawnQuery, { limit: 1, offset: catalogOffset });
      if (hasMore) appendCatalog(false);
    }
  };
  spawn.querySelector("#spawnQ").oninput = (e) => {
    state.spawnQuery = e.target.value;
    appendCatalog(true);
  };

  spawn.querySelector("#btnSpawn").onclick = () => {
    const id = state.spawnSelectedId;
    if (!id) return alert("Click an item in the catalog list first.");
    const qty = +spawn.querySelector("#spawnQty").value || 1;
    const count = +spawn.querySelector("#spawnCount").value || 1;
    const r = spawnItem(state.data, id, { qty, count, thin: false });
    markDirty();
    setStatus(`Spawned ${id} ×${count}: ${JSON.stringify(r)}`);
    renderCargo();
  };
  spawn.querySelector("#btnThin").onclick = () => {
    const id = state.spawnSelectedId;
    if (!id) return alert("Click an item in the catalog list first.");
    const qty = +spawn.querySelector("#spawnQty").value || 1;
    const r = spawnItem(state.data, id, { qty, count: 1, thin: true });
    markDirty();
    setStatus(`Thin-spawned ${id}: ${JSON.stringify(r)}`);
    renderCargo();
  };
  spawn.querySelector("#btnSpawnFiltered").onclick = () => {
    const q = (state.spawnQuery || "").trim();
    if (!q) {
      alert("Type a catalog search first (e.g. “ammo” or “rifle”), then spawn each match.");
      return;
    }
    const { items, total } = searchCatalog(q, { limit: 1e9, offset: 0 });
    if (!total) {
      alert("No catalog items match that filter.");
      return;
    }
    const qty = +spawn.querySelector("#spawnQty").value || 1;
    if (!confirm(`Spawn ${total} item(s) matching “${q}” into ShipCargo[0] (qty ${qty} each)?`)) return;
    setStatus(`Spawning ${total} filtered…`);
    setTimeout(() => {
      const r = giveOneOfEachIds(
        state.data,
        items.map((x) => x.id),
        { qty }
      );
      markDirty();
      setStatus(`Spawned each from filter (${total}): ${JSON.stringify(r)}`);
      renderCargo();
    }, 20);
  };
  spawn.querySelector("#btnGiveAll").onclick = () => {
    if (!confirm("Spawn 1 of each playable non-quest item into ShipCargo[0]? This can add ~1231 items.")) return;
    setStatus("Spawning…");
    setTimeout(() => {
      const r = giveOneOfEach(state.data);
      markDirty();
      setStatus(`Give one of each done: ${JSON.stringify(r)}`);
      renderCargo();
    }, 20);
  };

  function refreshRecycleList() {
    const ids = loadRecycleList();
    spawn.querySelector("#recycleList").textContent = ids.length ? ids.join(", ") : "(empty — filter cargo then “Add filtered IDs to always-recycle”)";
  }
  refreshRecycleList();
  spawn.querySelector("#btnRunRecycle").onclick = () => {
    const n = moveMatchingToRecycler(state.data, loadRecycleList());
    markDirty();
    setStatus(`Moved ${n} to recycler`);
    renderCargo();
  };
  spawn.querySelector("#btnSpoilFridge").onclick = () => {
    const n = moveSpoilablesToFridge(state.data);
    markDirty();
    setStatus(`Moved ${n} spoilables to fridge`);
    renderCargo();
  };
  spawn.querySelector("#btnClearRecycle").onclick = () => {
    saveRecycleList([]);
    refreshRecycleList();
  };

  const sizes = listStorageSizes(state.data);
  let sizeHtml = `<table class="data"><thead><tr><th>Store</th><th>W</th><th>H</th><th>Capacity (W×H)</th><th>Stacks</th><th>Grow height ≥</th></tr></thead><tbody>`;
  let lastGroup = "";
  sizes.forEach((s, i) => {
    if (s.group && s.group !== lastGroup) {
      sizeHtml += `<tr><td colspan="6" class="size-group">${s.group}</td></tr>`;
      lastGroup = s.group;
    }
    sizeHtml += `<tr title="${s.help || ""}"><td>${s.key}</td><td>${s.width}</td><td>${s.height}</td>
      <td>${s.capacity.toLocaleString()}</td><td>${s.items}</td>
      <td><input type="number" data-si="${i}" value="${s.height}" min="${s.height}" style="width:6rem"/>
      <button type="button" data-sg="${i}">Grow</button></td></tr>`;
  });
  sizeHtml += `</tbody></table>`;
  spawn.querySelector("#sizeTable").innerHTML = sizeHtml;
  spawn.querySelectorAll("[data-sg]").forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.sg;
      const input = spawn.querySelector(`input[data-si="${i}"]`);
      const before = sizes[i].store.Height;
      setStoreHeight(sizes[i].store, input.value);
      markDirty();
      setStatus(`${sizes[i].key} height ${before} → ${sizes[i].store.Height}`);
      renderCargo();
    };
  });
}

function renderProjects() {
  const all = getProjects(state.data);
  const tab = state.projectTab;
  const list = filterProjects(all, tab);
  const caps = getEquipProjectCaps(state.data);
  const counts = countEquipProjects(state.data);
  main.innerHTML = "";
  const panel = el(`<div class="panel">
    <h2>Magnum projects (${list.length})</h2>
    <div class="tabs">
      <button type="button" data-tab="equipment" class="${tab === "equipment" ? "active" : ""}">Equipment</button>
      <button type="button" data-tab="mercenary" class="${tab === "mercenary" ? "active" : ""}">Mercenary</button>
      <button type="button" data-tab="class" class="${tab === "class" ? "active" : ""}">Class</button>
    </div>
    ${
      tab === "equipment"
        ? `<p class="doc">Weaponry slots <strong>${counts.weapons}/${caps.weapons || "?"}</strong> (max ${caps.weaponsMax}) · Arsenal slots <strong>${counts.armor}/${caps.armor || "?"}</strong> (max ${caps.armorMax}). Caps come from Magnum tech unlocks — not a hard save-array limit.</p>
    <div class="toolbar">
      <button type="button" id="btnMaxSlots" class="primary" title="Adds Weaponry/Arsenal department + more-projects techs to _purchasedPerks">Max project slots (tech)</button>
      <select id="equipAdd" style="min-width:18rem"></select>
      <button type="button" id="btnEquipAdd" class="ok">Add from template</button>
      <button type="button" id="btnEquipReplace" title="Replace if DevelopId already exists">Replace</button>
      <label title="Ignore estimated slot caps when adding"><input type="checkbox" id="equipForce" /> Force</label>
    </div>`
        : ""
    }
    <div class="toolbar">
      <button type="button" id="btnFin" class="ok" title="Sets FinishTime = StartTime on checked projects only.">Instant-finish selected</button>
      <button type="button" id="btnFinAll" class="ok" title="Sets FinishTime = StartTime on every project in the current list.">Instant-finish all projects</button>
      ${
        tab === "equipment"
          ? `<button type="button" id="btnDel" class="danger">Delete selected</button>
      <button type="button" id="btnDelDone" class="danger">Delete finished equipment</button>
      <button type="button" id="btnCopyEquipMods" class="primary">Copy mods from first selected → other selected</button>`
          : ""
      }
      ${tab === "mercenary" ? `<button type="button" id="btnCopyKit" class="primary">Copy buffed kit from first selected → other selected</button>` : ""}
      ${tab === "class" ? `<button type="button" id="btnCopyMods" class="primary">Copy mods from first selected → other selected</button>` : ""}
    </div>
    <div class="scroll-table" id="projTable"></div>
    <div id="equipMods"></div>
    <div id="classMods"></div>
  </div>`);
  main.appendChild(panel);
  panel.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => {
      state.projectTab = b.dataset.tab;
      state.projectSelected.clear();
      renderProjects();
    };
  });

  if (tab === "equipment") {
    const sel = panel.querySelector("#equipAdd");
    const owned = new Set(list.map((p) => p.DevelopId));
    const templates = [...getEquipProjectLibrary().values()].sort(
      (a, b) => a.ProjectType.localeCompare(b.ProjectType) || a.DevelopId.localeCompare(b.DevelopId)
    );
    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.DevelopId;
      const mods = (t.AppliedModifications || []).length;
      const name = displayName(t.DevelopId);
      opt.textContent = `${t.ProjectType} · ${name} (${t.DevelopId}) · ${mods} mods${owned.has(t.DevelopId) ? " · in save" : ""}`;
      sel.appendChild(opt);
    }
    panel.querySelector("#btnMaxSlots").onclick = () => {
      const n = unlockMaxEquipProjectSlots(state.data);
      markDirty();
      setStatus(n ? `Unlocked ${n} project-slot tech(s)` : "All Weaponry/Arsenal slot techs already owned");
      renderProjects();
    };
    const doAdd = (replace) => {
      const id = sel.value;
      if (!id) return;
      const force = panel.querySelector("#equipForce").checked;
      const r = addEquipProject(state.data, id, { replace, force });
      if (!r.ok) {
        setStatus(r.message, "warn");
        return;
      }
      markDirty();
      setStatus(r.message);
      renderProjects();
    };
    panel.querySelector("#btnEquipAdd").onclick = () => doAdd(false);
    panel.querySelector("#btnEquipReplace").onclick = () => doAdd(true);
  }

  const tbody = list
    .map((p, i) => {
      const mods = (p.AppliedModifications || []).length;
      const name = displayName(p.DevelopId);
      const pool = isWeaponProject(p) ? "W" : isArmorProject(p) ? "A" : "";
      return `<tr data-i="${i}"><td><input type="checkbox" data-i="${i}" ${state.projectSelected.has(i) ? "checked" : ""}/></td>
      <td>${iconHtml(p.DevelopId, 22)}</td>
      <td>${p.ProjectType}${pool ? ` <span class="badge">${pool}</span>` : ""}</td>
      <td>${name}</td><td><code>${p.DevelopId}</code></td><td>${p.IsInDevelopment}</td>
      <td>${mods}</td><td>${p.StartTime}</td><td>${p.FinishTime}</td></tr>`;
    })
    .join("");
  panel.querySelector("#projTable").innerHTML = `<table class="data"><thead><tr>
    <th></th><th></th><th>Type</th><th>Name</th><th>DevelopId</th><th>InDev</th><th>Mods</th><th>Start</th><th>Finish</th>
  </tr></thead><tbody>${tbody || `<tr><td colspan="9" class="muted">None</td></tr>`}</tbody></table>`;

  panel.querySelectorAll("input[data-i]").forEach((chk) => {
    chk.onchange = () => {
      const i = +chk.dataset.i;
      if (chk.checked) state.projectSelected.add(i);
      else state.projectSelected.delete(i);
      if (tab === "class") renderClassMods(panel, list);
      if (tab === "equipment") renderEquipMods(panel, list);
    };
  });
  panel.querySelectorAll("tr[data-i]").forEach((tr) => {
    tr.onclick = (e) => {
      if (e.target.closest("input")) return;
      const i = +tr.dataset.i;
      const chk = tr.querySelector("input[data-i]");
      if (!chk) return;
      chk.checked = !chk.checked;
      chk.dispatchEvent(new Event("change"));
    };
  });

  function selectedProjects() {
    return [...state.projectSelected].map((i) => list[i]).filter(Boolean);
  }

  panel.querySelector("#btnFin").onclick = () => {
    const n = instantFinishProjects(selectedProjects());
    markDirty();
    setStatus(`Instant-finished ${n} selected project(s)`);
    renderProjects();
  };
  panel.querySelector("#btnFinAll").onclick = () => {
    const n = instantFinishProjects(list);
    markDirty();
    setStatus(`Instant-finished all ${n} project(s) in this list`);
    renderProjects();
  };
  panel.querySelector("#btnDel")?.addEventListener("click", () => {
    const sel = selectedProjects();
    if (!confirm(`Delete ${sel.length} equipment projects?`)) return;
    deleteProjects(state.data, sel);
    markDirty();
    state.projectSelected.clear();
    setStatus(`Deleted ${sel.length}`);
    renderProjects();
  });
  panel.querySelector("#btnDelDone")?.addEventListener("click", () => {
    const done = list.filter((p) => p.IsInDevelopment === "False");
    if (!confirm(`Delete ${done.length} finished equipment projects?`)) return;
    deleteProjects(state.data, done);
    markDirty();
    setStatus(`Deleted ${done.length}`);
    renderProjects();
  });
  panel.querySelector("#btnCopyEquipMods")?.addEventListener("click", () => {
    const sel = selectedProjects();
    if (sel.length < 2) return alert("Select source first, then targets");
    const n = copyEquipMods(sel[0], sel.slice(1));
    markDirty();
    setStatus(`Copied equip mods to ${n}`);
    renderProjects();
  });
  panel.querySelector("#btnCopyKit")?.addEventListener("click", () => {
    const sel = selectedProjects();
    if (sel.length < 2) return alert("Select source first, then targets");
    try {
      const n = copyMercKitFromProject(state.data, sel[0], sel.slice(1));
      markDirty();
      setStatus(`Copied kit to ${n} mercs`);
    } catch (e) {
      alert(e.message);
    }
  });
  panel.querySelector("#btnCopyMods")?.addEventListener("click", () => {
    const sel = selectedProjects();
    if (sel.length < 2) return alert("Select source + targets");
    const n = copyClassMods(sel[0], sel.slice(1));
    markDirty();
    setStatus(`Copied class mods to ${n}`);
    renderProjects();
  });

  if (tab === "class") renderClassMods(panel, list);
  if (tab === "equipment") renderEquipMods(panel, list);
}

function renderEquipMods(panel, list) {
  const box = panel.querySelector("#equipMods");
  if (!box) return;
  const i = [...state.projectSelected][0];
  const p = list[i];
  if (!p) {
    box.innerHTML = `<p class="muted">Select an equipment project to edit AppliedModifications / CachedItems.</p>`;
    return;
  }
  box.innerHTML = `<h3>${iconHtml(p.DevelopId, 28)} ${displayName(p.DevelopId)} <code>${p.DevelopId}</code></h3>
    <p class="doc muted">${p.ProjectType} · ${(p.AppliedModifications || []).length} applied mods · ${(p.CachedItems || []).length} cached items</p>
    <p class="muted">AppliedModifications</p>
    <pre class="json-mini" contenteditable="true" id="equipApplied">${JSON.stringify(p.AppliedModifications || [], null, 2)}</pre>
    <p class="muted">CachedItems</p>
    <pre class="json-mini" contenteditable="true" id="equipCached">${JSON.stringify(p.CachedItems || [], null, 2)}</pre>
    <button type="button" id="btnSaveEquipMods" class="ok">Apply JSON</button>`;
  box.querySelector("#btnSaveEquipMods").onclick = () => {
    try {
      p.AppliedModifications = JSON.parse(box.querySelector("#equipApplied").textContent);
      p.CachedItems = JSON.parse(box.querySelector("#equipCached").textContent);
      p.ModificationsCount = String(p.AppliedModifications.length);
      markDirty();
      setStatus(`Updated mods on ${p.DevelopId}`);
      renderProjects();
    } catch (e) {
      alert("Invalid JSON: " + e.message);
    }
  };
}

function renderClassMods(panel, list) {
  const box = panel.querySelector("#classMods");
  const i = [...state.projectSelected][0];
  const p = list[i];
  if (!p) {
    box.innerHTML = `<p class="muted">Select a class project to edit mods</p>`;
    return;
  }
  box.innerHTML = `<h3>Mods: ${p.DevelopId}</h3>
    <p class="muted">Applied</p><pre class="json-mini" contenteditable="true" id="applied">${JSON.stringify(p.AppliedModifications || [], null, 2)}</pre>
    <p class="muted">Upcoming</p><pre class="json-mini" contenteditable="true" id="upcoming">${JSON.stringify(p.UpcomingModifications || [], null, 2)}</pre>
    <button type="button" id="btnSaveMods" class="ok">Apply JSON</button>`;
  box.querySelector("#btnSaveMods").onclick = () => {
    try {
      p.AppliedModifications = JSON.parse(box.querySelector("#applied").textContent);
      p.UpcomingModifications = JSON.parse(box.querySelector("#upcoming").textContent);
      p.ModificationsCount = String(p.AppliedModifications.length);
      p.UpcomingModificationsCount = String(p.UpcomingModifications.length);
      markDirty();
      setStatus("Class mods updated");
    } catch (e) {
      alert("Invalid JSON: " + e.message);
    }
  };
}

function renderUnlocks() {
  const lists = getUnlockLists(state.data);
  const purchased = new Set(getPurchasedPerks(state.data));
  const modules = [...new Set(filterTechs().map((t) => t.module).filter(Boolean))].sort();
  main.innerHTML = "";
  const panel = el(`<div class="panel">
    <h2>Unlocks</h2>
    <div class="toolbar">
      <button type="button" id="btnRestore" class="primary">Restore full unlocks (slot-2 baseline)</button>
    </div>
    <div class="grid-2" id="unlockGrid"></div>
    <h3>Technology trees</h3>
    <p class="doc">These are Magnum ship upgrades in <code>_purchasedPerks</code> (not equipment MagnumProjects). Names/effects from the wiki tech trees. Icons hotlink the wiki.</p>
    <div class="toolbar">
      <input type="search" id="techQ" placeholder="Filter techs…" style="min-width:14rem" />
      <select id="techModule"><option value="">All modules</option>${modules
        .map((m) => `<option value="${m}">${m}</option>`)
        .join("")}</select>
      <button type="button" id="btnUnlockFiltered" class="ok">Unlock filtered</button>
      <button type="button" id="btnUnlockAllTech" class="primary">Unlock all wiki techs</button>
    </div>
    <div class="scroll-table" id="techTable" style="max-height:28rem"></div>
  </div>`);
  main.appendChild(panel);
  panel.querySelector("#btnRestore").onclick = () => {
    if (!confirm("Overwrite unlock lists with the late-game baseline?")) return;
    try {
      restoreFullUnlocks(state.data);
      markDirty();
      setStatus("Restored full unlocks");
      renderUnlocks();
    } catch (e) {
      alert(e.message);
    }
  };
  const grid = panel.querySelector("#unlockGrid");
  for (const [name, arr] of Object.entries(lists)) {
    const card = el(`<div class="panel" style="margin:0"><h3>${name} (${arr.length})</h3>
      <pre class="json-mini">${arr.slice(0, 80).join("\n")}${arr.length > 80 ? "\n…" : ""}</pre></div>`);
    grid.appendChild(card);
  }

  const techTable = panel.querySelector("#techTable");
  function paintTechs() {
    const q = panel.querySelector("#techQ").value;
    const mod = panel.querySelector("#techModule").value;
    const rows = filterTechs(q, mod);
    techTable.innerHTML = `<table class="data"><thead><tr>
      <th></th><th>Owned</th><th>Name</th><th>Module</th><th>Id</th><th>Effect</th>
    </tr></thead><tbody>
    ${rows
      .map((t) => {
        const owned = purchased.has(t.internalName);
        return `<tr>
          <td>${iconHtml(t.internalName, 22)}</td>
          <td><input type="checkbox" data-tech="${t.internalName}" ${owned ? "checked" : ""}/></td>
          <td title="${(techSummary(t.internalName) || "").replace(/"/g, "&quot;")}">${t.wikiTitle}</td>
          <td>${t.module || t.department || ""}</td>
          <td><code>${t.internalName}</code></td>
          <td class="muted">${(t.effect || "").slice(0, 120)}</td>
        </tr>`;
      })
      .join("")}
    </tbody></table>`;
    techTable.querySelectorAll("[data-tech]").forEach((chk) => {
      chk.onchange = () => {
        const id = chk.dataset.tech;
        if (chk.checked) addPurchasedPerk(state.data, id);
        else removePurchasedPerk(state.data, id);
        purchased.clear();
        for (const x of getPurchasedPerks(state.data)) purchased.add(x);
        markDirty();
      };
    });
  }
  paintTechs();
  panel.querySelector("#techQ").oninput = paintTechs;
  panel.querySelector("#techModule").onchange = paintTechs;
  panel.querySelector("#btnUnlockFiltered").onclick = () => {
    const q = panel.querySelector("#techQ").value;
    const mod = panel.querySelector("#techModule").value;
    let n = 0;
    for (const t of filterTechs(q, mod)) {
      if (addPurchasedPerk(state.data, t.internalName)) n++;
    }
    markDirty();
    setStatus(`Unlocked ${n} tech(s)`);
    renderUnlocks();
  };
  panel.querySelector("#btnUnlockAllTech").onclick = () => {
    if (!confirm(`Add all ${filterTechs().length} wiki techs to _purchasedPerks?`)) return;
    const n = unlockAllTechs(state.data);
    markDirty();
    setStatus(`Unlocked ${n} new tech(s)`);
    renderUnlocks();
  };
}

function renderFactions() {
  const factions = getFactions(state.data);
  main.innerHTML = "";
  const alliances = uniqueFieldValues(factions, "CurrentAlliance");
  const panel = el(`<div class="panel">
    <h2>Factions (${factions.length})</h2>
    <div class="toolbar">
      <label>Bulk field <select id="bulkField">
        <option>PlayerReputation</option><option>Power</option><option>CurrentTechLevel</option><option>TechExp</option>
      </select></label>
      <input type="text" id="bulkVal" value="100" />
      <button type="button" id="btnBulk" class="ok">Set on selected</button>
    </div>
    <div class="scroll-table" id="facTable"></div>
  </div>`);
  main.appendChild(panel);
  const selected = new Set();
  panel.querySelector("#facTable").innerHTML = `<table class="data"><thead><tr>
    <th></th><th>Id</th><th>Power</th><th>Rep</th><th>Tech</th><th>TechExp</th><th>Alliance</th><th>Type</th><th>Strategy</th>
  </tr></thead><tbody>
  ${factions
    .map((f, i) => {
      const strat = typeof f.CurrentStrategy === "object" ? "{}" : f.CurrentStrategy;
      return `<tr><td><input type="checkbox" data-i="${i}"/></td>
      <td>${f.Id}</td>
      <td><input data-f="Power" data-i="${i}" value="${f.Power}" style="width:5rem"/></td>
      <td><input data-f="PlayerReputation" data-i="${i}" value="${f.PlayerReputation}" style="width:6rem"/></td>
      <td><input data-f="CurrentTechLevel" data-i="${i}" value="${f.CurrentTechLevel}" style="width:3rem"/></td>
      <td><input data-f="TechExp" data-i="${i}" value="${f.TechExp}" style="width:6rem"/></td>
      <td><select data-f="CurrentAlliance" data-i="${i}">${alliances
        .map((a) => `<option ${a === f.CurrentAlliance ? "selected" : ""}>${a}</option>`)
        .join("")}</select></td>
      <td>${f.FactionType}</td><td>${strat}</td></tr>`;
    })
    .join("")}
  </tbody></table>`;

  panel.querySelectorAll("input[data-f], select[data-f]").forEach((inp) => {
    inp.addEventListener("change", () => {
      factions[+inp.dataset.i][inp.dataset.f] = inp.value;
      markDirty();
    });
  });
  panel.querySelectorAll("input[data-i][type=checkbox]").forEach((chk) => {
    chk.onchange = () => {
      if (chk.checked) selected.add(+chk.dataset.i);
      else selected.delete(+chk.dataset.i);
    };
  });
  panel.querySelector("#btnBulk").onclick = () => {
    const field = panel.querySelector("#bulkField").value;
    const val = panel.querySelector("#bulkVal").value;
    const targets = [...selected].map((i) => factions[i]);
    if (!targets.length) return alert("Select factions");
    bulkSet(targets, field, val);
    markDirty();
    renderFactions();
  };
}

function renderDifficulty() {
  const preset = getDifficultyPreset(state.data);
  main.innerHTML = "";
  const panel = el(`<div class="panel"><h2>Difficulty preset</h2><div id="diff"></div></div>`);
  main.appendChild(panel);
  const box = panel.querySelector("#diff");
  if (!preset) {
    box.textContent = "No preset";
    return;
  }
  for (const g of DIFFICULTY_GROUPS) {
    box.appendChild(el(`<h3>${g.title}</h3>`));
    for (const f of g.fields) {
      if (preset[f] === undefined) continue;
      box.appendChild(fieldRow(preset, f, { onChange: markDirty }));
    }
  }
}

function renderWorld() {
  main.innerHTML = "";
  const travel = getTravel(state.data);
  const time = getSpaceTime(state.data);
  const debug = getDebug(state.data);
  const raid = getRaid(state.data);

  const tPanel = el(`<div class="panel"><h2>Travel</h2><div id="travel"></div></div>`);
  const sPanel = el(`<div class="panel"><h2>SpaceTime</h2><div id="time"></div></div>`);
  const dPanel = el(`<div class="panel"><h2>Debug</h2><div id="debug"></div></div>`);
  main.append(tPanel, sPanel, dPanel);
  wrapDirty(tPanel.querySelector("#travel"), travel);
  wrapDirty(sPanel.querySelector("#time"), time);
  wrapDirty(dPanel.querySelector("#debug"), debug);

  if (isInDungeon(state.data) && raid) {
    const rPanel = el(`<div class="panel"><h2>RaidMetadata (in dungeon)</h2><div id="raid"></div>
      <p class="muted">Floor entities are not in session files — only these flags.</p></div>`);
    main.appendChild(rPanel);
    wrapDirty(rPanel.querySelector("#raid"), raid, [
      "RaidType",
      "StationId",
      "TurnNumber",
      "QMorphosLevel",
      "QMorphosMinLevel",
      "IsReversedMission",
      "IsBaronAllowed",
      "IsGlobalJammed",
      "LoadLastSaveOnDeath",
      "BramfaturaId",
    ]);
  } else {
    main.appendChild(el(`<div class="panel"><h2>Raid</h2><p class="muted">IsInDungeon=${state.data.IsInDungeon}. Basic raid fields available when True (see slot_1).</p></div>`));
  }
}

function wrapDirty(container, obj, keys) {
  bindFlatFields(container, obj, keys, markDirty);
}

function renderRaw() {
  const comps = listComponents(state.data);
  main.innerHTML = "";
  const panel = el(`<div class="panel"><h2>Raw components</h2>
    <div class="toolbar"><select id="rawSel">${comps.map((c) => `<option value="${c.type}">${c.type} — ${c.detail}</option>`).join("")}</select>
    <button type="button" id="btnSchema">Show schema</button></div>
    <div id="rawOut"></div>
  </div>`);
  main.appendChild(panel);
  const show = () => {
    const type = panel.querySelector("#rawSel").value;
    const content = getComponent(state.data, type);
    const schema = schemaFor(content, 3);
    panel.querySelector("#rawOut").innerHTML = `<h3>Schema</h3>${renderSchemaHtml(schema)}
      <h3>JSON (truncated)</h3><pre class="raw">${JSON.stringify(content, null, 2).slice(0, 20000)}</pre>`;
  };
  panel.querySelector("#btnSchema").onclick = show;
  show();
}

initCatalogs().then(() => render());
