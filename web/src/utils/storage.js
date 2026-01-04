// src/utils/storage.js
export function loadState(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    return s;
  } catch {
    return null;
  }
}

export function saveState(key, partial) {
  try {
    const prev = loadState(key) || {};
    const next = { ...prev, ...partial, _ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function setValue(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function getValue(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
