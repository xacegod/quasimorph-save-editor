/**
 * Generic raw component viewer/editor.
 */
import { inferSchema, summarizeComponents } from "./schema.js";
import { getComponent } from "./parse.js";
import { fieldRow } from "./fields.js";

export function listComponents(data) {
  return summarizeComponents(data);
}

export function getRawComponent(data, type) {
  return getComponent(data, type);
}

export function schemaFor(obj, depth = 3) {
  return inferSchema(obj, depth);
}

export function renderSchemaHtml(schema, path = "") {
  if (!schema) return "<em>none</em>";
  const types = (schema.types || []).join("|");
  let html = `<div class="schema-node"><code>${path || "root"}</code> <span class="muted">${types}</span>`;
  if (schema.samples?.length) {
    html += ` <span class="samples">[${schema.samples
      .slice(0, 8)
      .map((s) => JSON.stringify(s))
      .join(", ")}]</span>`;
  }
  if (schema.min != null) html += ` <span class="muted">min=${schema.min} max=${schema.max}</span>`;
  if (schema.keys) {
    html += "<ul>";
    for (const [k, child] of Object.entries(schema.keys)) {
      html += `<li>${renderSchemaHtml(child, k)}</li>`;
    }
    html += "</ul>";
  }
  if (schema.elem) {
    html += `<div class="indent">elem: ${renderSchemaHtml(schema.elem, "[]")}</div>`;
  }
  html += "</div>";
  return html;
}

/** Simple editable key/value for flat string fields on an object. */
export function bindFlatFields(container, obj, keys, onChange) {
  container.innerHTML = "";
  if (!obj) {
    container.textContent = "Not available";
    return;
  }
  const list = keys || Object.keys(obj);
  for (const key of list) {
    container.appendChild(fieldRow(obj, key, { onChange }));
  }
}
