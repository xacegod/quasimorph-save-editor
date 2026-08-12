import { parseSaveFile, downloadSave, getComponent } from "./parse.js";
import { loadCatalogs, searchCatalog, displayName, mergeSpawnableFromSave, getSpawnableIds } from "./catalog.js";
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
import { loadPerkLibrary, mergedTalentCatalog, setTalent, perkHasExp, paramValueKey } from "./perkLibrary.js";
import {
  loadUnlockBaseline,
  getUnlockLists,
  restoreFullUnlocks,
  getProjects,
  filterProjects,
  instantFinishProjects,
  deleteProjects,
  copyClassMods,
  copyMercKitFromProject,
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
    state.catalogOk = true;
    setStatus(`Catalogs ready: ${info.spawnableCount} items, ${talentN} talents. Open a save.`);
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
      <li>Mercs — stats, perks, copy kit to others, clear curse, finish training, heal wounds</li>
      <li>Cargo — filter, qty (Count may exceed Max), spawn / thin-spawn, recycle &amp; fridge autosort</li>
      <li>Projects — delete equipment (≈10 slot cap), instant-finish, class mods, copy buffed merc</li>
      <li>Unlocks — restore full unlocks from slot-2 baseline</li>
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
    <p class="doc">Pact ultimates are unlocked with a skull item after a bramfatura pact — not by class rank. <code>HasUltimate</code> + skull id + an Ultimate perk should stay in sync.</p>
    <div id="pactFields"></div>
    <div id="ultPerks"></div>
    <h3>Class ranks</h3>
    <p class="doc">PerkType <code>Rank</code> (rank_4, rank_5, …) comes from the mercenary class / Magnum class project.</p>
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
      <input type="search" id="invItemQ" placeholder="Search item catalog…" style="min-width:12rem" />
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
  const skulls = collectSkullIds(state.data);
  const skullRow = el(`<div class="field-row"><label>UltimateSkullItemId <abbr class="help" title="Skull that grants the pact ultimate. Empty {} means none.">?</abbr></label></div>`);
  const skullSel = document.createElement("select");
  skullSel.innerHTML = `<option value="">(none)</option>` + skulls.map((s) => `<option value="${s}">${displayName(s)} (${s})</option>`).join("");
  const curSkull = typeof cd.UltimateSkullItemId === "string" ? cd.UltimateSkullItemId : "";
  if (curSkull && !skulls.includes(curSkull)) {
    const o = document.createElement("option");
    o.value = curSkull;
    o.textContent = curSkull;
    skullSel.appendChild(o);
  }
  skullSel.value = curSkull;
  skullSel.onchange = () => {
    setUltimateSkull(state.data, m, skullSel.value);
    markDirty();
    renderMercs();
  };
  skullRow.appendChild(skullSel);
  pactBox.appendChild(skullRow);

  function paramEditor(param, onChange) {
    const key = paramValueKey(param);
    if (param.ValType === "Boolean" || param[key] === "True" || param[key] === "False") {
      const sel = document.createElement("select");
      sel.innerHTML = `<option value="True">True</option><option value="False">False</option>`;
      sel.value = param[key] === "False" ? "False" : "True";
      sel.onchange = () => {
        param.BoolVal = sel.value;
        param.ValType = "Boolean";
        onChange();
      };
      return sel;
    }
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = param[key] ?? "";
    input.onchange = () => {
      param[key] = input.value;
      onChange();
    };
    return input;
  }

  function renderPerkGroup(container, group) {
    const typeSet = new Set(group.types);
    const rows = listPerks(m)
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => typeSet.has(p.PerkType));
    const isTalent = group.id === "Talent";
    const cat = isTalent ? mergedTalentCatalog(state.data) : new Map();
    if (!isTalent) {
      for (const t of group.types) {
        for (const [id, perk] of collectPerkCatalogByType(state.data, t)) cat.set(id, perk);
      }
    }
    const wrap = el(`<div>
      <p class="doc">${group.help}</p>
      <div class="toolbar">
        <select data-add></select>
        <button type="button" class="ok" data-addbtn title="${
          isTalent
            ? "Replaces the merc's current talent with the selected one (one talent only)."
            : "Clone this perk onto the merc from another copy in this save."
        }">${isTalent ? "Set talent" : "Add"}</button>
      </div>
      <div data-list></div>
    </div>`);
    const sel = wrap.querySelector("[data-add]");
    const currentTalentId = isTalent ? rows[0]?.p?.PerkId : null;
    for (const id of [...cat.keys()].sort()) {
      const opt = document.createElement("option");
      opt.value = id;
      if (isTalent) {
        opt.textContent = id === currentTalentId ? `${id} (current)` : id;
        if (id === currentTalentId) opt.selected = true;
      } else {
        const owned = (cd.Perks || []).some((p) => p.PerkId === id);
        opt.textContent = owned ? `${id} (on merc)` : id;
      }
      sel.appendChild(opt);
    }
    wrap.querySelector("[data-addbtn]").onclick = () => {
      const id = sel.value;
      if (isTalent) {
        if (!setTalent(m, id, state.data)) return;
        setStatus(`Talent set to ${id}`);
      } else {
        const tmpl = cat.get(id);
        if (!tmpl) return;
        if (!cd.Perks) cd.Perks = [];
        cd.Perks.push(JSON.parse(JSON.stringify(tmpl)));
      }
      markDirty();
      renderMercs();
    };

    const list = wrap.querySelector("[data-list]");
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state">None on this merc. Use ${isTalent ? "Set talent" : "Add"}.</div>`;
    } else {
      for (const { p, i } of rows) {
        const card = el(`<div class="panel" style="margin:0.5rem 0">
          <div class="toolbar">
            <strong>${p.PerkId}</strong>
            <span class="badge">${p.PerkType}</span>
            <button type="button" class="danger" data-del>Remove</button>
          </div>
          <div data-params></div>
        </div>`);
        const toolbar = card.querySelector(".toolbar");
        const delBtn = card.querySelector("[data-del]");
        if (perkHasExp(p)) {
          const expLabel = document.createElement("span");
          expLabel.className = "muted";
          expLabel.textContent = "exp";
          const exp = document.createElement("input");
          exp.type = "number";
          exp.style.width = "5rem";
          exp.value = p.CurrentExp || "0";
          exp.title = `CurrentExp / MaxExp ${p.MaxExp}${p.NextPerkId && typeof p.NextPerkId === "string" ? ` → ${p.NextPerkId}` : ""}`;
          exp.onchange = () => {
            p.CurrentExp = exp.value;
            markDirty();
          };
          const maxHint = document.createElement("span");
          maxHint.className = "muted";
          maxHint.textContent = `/ ${p.MaxExp}`;
          toolbar.insertBefore(expLabel, delBtn);
          toolbar.insertBefore(exp, delBtn);
          toolbar.insertBefore(maxHint, delBtn);
        }
        const paramsBox = card.querySelector("[data-params]");
        if (!(p.Parameters || []).length && !(p.AIParameters || []).length) {
          paramsBox.innerHTML = `<p class="muted">No parameters</p>`;
        } else {
          const table = el(`<table class="data"><thead><tr><th>Parameter</th><th>Type</th><th>Value</th></tr></thead><tbody></tbody></table>`);
          const tb = table.querySelector("tbody");
          for (const param of p.Parameters || []) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td><code>${param.Name}</code></td><td>${param.ValType}</td><td></td>`;
            tr.lastChild.appendChild(paramEditor(param, markDirty));
            tb.appendChild(tr);
          }
          for (const param of p.AIParameters || []) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td><code>${param.Name}</code> <span class="badge">AI</span></td><td>${param.ValType}</td><td></td>`;
            tr.lastChild.appendChild(paramEditor(param, markDirty));
            tb.appendChild(tr);
          }
          paramsBox.appendChild(table);
        }
        card.querySelector("[data-del]").onclick = () => {
          cd.Perks.splice(i, 1);
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
        <td>${r.slot}</td><td>${r.name}</td><td><code>${r.id}</code></td>
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
          <td>${r.storeKey}</td><td>${r.name}${r.quest ? ' <span class="badge warn">quest</span>' : ""}</td>
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
      b.textContent = `${x.name}  (${x.id})`;
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
  main.innerHTML = "";
  const panel = el(`<div class="panel">
    <h2>Magnum projects (${list.length})</h2>
    <div class="tabs">
      <button type="button" data-tab="equipment" class="${tab === "equipment" ? "active" : ""}">Equipment</button>
      <button type="button" data-tab="mercenary" class="${tab === "mercenary" ? "active" : ""}">Mercenary</button>
      <button type="button" data-tab="class" class="${tab === "class" ? "active" : ""}">Class</button>
    </div>
    <div class="toolbar">
      <button type="button" id="btnFin" class="ok" title="Sets FinishTime = StartTime on checked projects only.">Instant-finish selected</button>
      <button type="button" id="btnFinAll" class="ok" title="Sets FinishTime = StartTime on every project in the current list (Equipment, Mercenary, or Class).">Instant-finish all projects</button>
      ${tab === "equipment" ? `<button type="button" id="btnDel" class="danger">Delete selected</button>
      <button type="button" id="btnDelDone" class="danger">Delete finished equipment</button>` : ""}
      ${tab === "mercenary" ? `<button type="button" id="btnCopyKit" class="primary">Copy buffed kit from first selected → other selected</button>` : ""}
      ${tab === "class" ? `<button type="button" id="btnCopyMods" class="primary">Copy mods from first selected → other selected</button>` : ""}
    </div>
    <div class="scroll-table" id="projTable"></div>
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

  const tbody = list
    .map((p, i) => {
      const key = `${p.ProjectType}:${p.DevelopId}:${i}`;
      return `<tr data-key="${key}"><td><input type="checkbox" data-i="${i}" ${state.projectSelected.has(i) ? "checked" : ""}/></td>
      <td>${p.ProjectType}</td><td>${p.DevelopId}</td><td>${p.IsInDevelopment}</td>
      <td>${p.ModificationsCount}</td><td>${p.StartTime}</td><td>${p.FinishTime}</td></tr>`;
    })
    .join("");
  panel.querySelector("#projTable").innerHTML = `<table class="data"><thead><tr>
    <th></th><th>Type</th><th>DevelopId</th><th>InDev</th><th>Mods</th><th>Start</th><th>Finish</th>
  </tr></thead><tbody>${tbody}</tbody></table>`;

  panel.querySelectorAll("input[data-i]").forEach((chk) => {
    chk.onchange = () => {
      const i = +chk.dataset.i;
      if (chk.checked) state.projectSelected.add(i);
      else state.projectSelected.delete(i);
      if (tab === "class") renderClassMods(panel, list);
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
  main.innerHTML = "";
  const panel = el(`<div class="panel">
    <h2>Unlocks</h2>
    <div class="toolbar">
      <button type="button" id="btnRestore" class="primary">Restore full unlocks (slot-2 baseline)</button>
    </div>
    <div class="grid-2" id="unlockGrid"></div>
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
