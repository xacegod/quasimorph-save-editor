/**
 * BOM-aware JSON parse/serialize for Quasimorph session saves.
 */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseSaveText(text) {
  const cleaned = stripBom(text);
  const data = JSON.parse(cleaned);
  return data;
}

export async function parseSaveFile(file) {
  const text = await file.text();
  return { data: parseSaveText(text), fileName: file.name, size: file.size };
}

/** Compact JSON with UTF-8 BOM, matching game format. */
export function serializeSave(data) {
  return "\uFEFF" + JSON.stringify(data);
}

export function downloadSave(data, fileName = "slot_session.dat") {
  const blob = new Blob([serializeSave(data)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function getComponent(data, type) {
  if (!data?.Components) return null;
  const full = type.startsWith("MGSC.") ? type : `MGSC.${type}`;
  const entry = data.Components.find((c) => c.Type === full || c.Type === type);
  return entry ? entry.Content : null;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
