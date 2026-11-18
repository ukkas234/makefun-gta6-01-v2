// Solmara — save. Browser localStorage under the key solmara-save-v1.
// Contract (spec): loadSave(), saveSave(data), clearSave().
// Saved shape: { money, finishedMissions, foundPackages, best, muted }.
// loadSave always returns a complete, validated object (defaults for a
// fresh player or corrupt storage); saveSave merges over the defaults so
// partial writes never drop a field; all storage errors are swallowed
// (private windows) instead of crashing the game.

export const SAVE_KEY = 'solmara-save-v1';

export function defaultSave() {
  return {
    money: 0,
    finishedMissions: [],
    foundPackages: [],
    best: 0,
    muted: false,
  };
}

function clean(data) {
  const base = defaultSave();
  if (!data || typeof data !== 'object') return base;
  return {
    money: Number.isFinite(Number(data.money)) ? Math.max(0, Math.floor(Number(data.money))) : 0,
    finishedMissions: Array.isArray(data.finishedMissions)
      ? data.finishedMissions.filter((m) => typeof m === 'string')
      : [],
    foundPackages: Array.isArray(data.foundPackages)
      ? data.foundPackages.filter((n) => Number.isInteger(n) && n >= 0 && n < 10)
      : [],
    best: Number.isFinite(Number(data.best)) ? Math.max(0, Math.floor(Number(data.best))) : 0,
    muted: Boolean(data.muted),
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return clean(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function saveSave(data) {
  try {
    const merged = clean({ ...loadSave(), ...(data || {}) });
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(merged));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
