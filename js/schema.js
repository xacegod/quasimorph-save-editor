/**
 * Lightweight schema inference for the Raw explorer.
 */

function kind(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function merge(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = {
    types: new Set([...(a.types || []), ...(b.types || [])]),
    keys: { ...(a.keys || {}) },
    samples: new Set([...(a.samples || []), ...(b.samples || [])]),
    count: (a.count || 0) + (b.count || 0),
  };
  for (const [k, s] of Object.entries(b.keys || {})) out.keys[k] = merge(out.keys[k], s);
  out.elem = merge(a.elem, b.elem);
  if (a.min != null || b.min != null) {
    out.min = a.min == null ? b.min : b.min == null ? a.min : Math.min(a.min, b.min);
    out.max = a.max == null ? b.max : b.max == null ? a.max : Math.max(a.max, b.max);
  }
  return out;
}

function schemaOf(v, depth, maxDepth, maxSamples) {
  const t = kind(v);
  const s = { types: new Set([t]), keys: {}, samples: new Set(), count: 1 };
  if (t === "string" || t === "boolean" || t === "number") {
    if (t === "number") {
      s.min = v;
      s.max = v;
    }
    const sample = typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : v;
    if (s.samples.size < maxSamples) s.samples.add(sample);
  }
  if (depth >= maxDepth) return s;
  if (t === "object") {
    for (const [k, val] of Object.entries(v)) s.keys[k] = schemaOf(val, depth + 1, maxDepth, maxSamples);
  } else if (t === "array") {
    const step = v.length <= 200 ? 1 : Math.ceil(v.length / 200);
    for (let i = 0; i < v.length; i += step) s.elem = merge(s.elem, schemaOf(v[i], depth + 1, maxDepth, maxSamples));
  }
  return s;
}

function freeze(s) {
  if (!s) return null;
  const o = { types: [...s.types], count: s.count };
  if (s.min != null) o.min = s.min;
  if (s.max != null) o.max = s.max;
  const samples = [...(s.samples || [])].slice(0, 20);
  if (samples.length) o.samples = samples;
  if (s.elem) o.elem = freeze(s.elem);
  if (s.keys && Object.keys(s.keys).length) {
    o.keys = {};
    for (const k of Object.keys(s.keys)) o.keys[k] = freeze(s.keys[k]);
  }
  return o;
}

export function inferSchema(data, maxDepth = 4) {
  return freeze(schemaOf(data, 0, maxDepth, 25));
}

export function summarizeComponents(data) {
  if (!data?.Components) return [];
  return data.Components.map((c) => {
    const content = c.Content || {};
    let detail = "";
    if (Array.isArray(content.Values)) detail = `${content.Values.length} values`;
    else if (Array.isArray(content.ShipCargo)) detail = `${content.ShipCargo.reduce((n, s) => n + (s.Items?.length || 0), 0)} cargo items`;
    else detail = `${Object.keys(content).length} keys`;
    return { type: c.Type, detail };
  });
}
