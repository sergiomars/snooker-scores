// Data layer: live snooker.org API with chrome.storage caching.

const API = "https://proxy.snooker-scores.workers.dev/";
const CACHE_PREFIX = "ss_cache_";
const TTL_MS = 5 * 60 * 1000;

export function currentSeason() {
    const d = new Date();
    return d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
}

function getStorage(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function setStorage(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

export async function getSettings() {
    const r = await getStorage(["settings"]);
    return Object.assign({ season: currentSeason() }, r.settings || {});
}
export async function setSettings(s) {
    const cur = await getSettings();
    await setStorage({ settings: Object.assign(cur, s) });
}

export async function clearCache() {
    const all = await getStorage(null);
    const keys = Object.keys(all).filter(k => k.startsWith(CACHE_PREFIX));
    if (keys.length) await new Promise(r => chrome.storage.local.remove(keys, r));
}

async function cachedFetch(params) {
    const url = API + "?" + new URLSearchParams(params).toString();
    console.log("Url to fetch: " + url);
    const key = CACHE_PREFIX + url;
    const cached = await getStorage([key]);
    const hit = cached[key];
    if (hit && Date.now() - hit.t < TTL_MS) return hit.v;
    const res = await fetch(url);
    if (!res.ok) throw new Error("API " + res.status);
    const v = await res.json();
    await setStorage({ [key]: { t: Date.now(), v } });
    return v;
}

// Kept for backwards compatibility with the existing Jest test.
export async function getArray(fileName) {
    const data = await fetch(fileName);
    const jsonData = await data.text();
    return JSON.parse(jsonData);
}

// Public helpers ------------------------------------------------------------

export async function fetchEvents(season) {
    return cachedFetch({ t: "5", s: season });
}

export async function fetchPlayers(season) {
    return cachedFetch({ t: "10", st: "p", s: season });
}

export async function fetchRankings(season) {
    return cachedFetch({ t: "11", rt: "MoneyRankings", s: season });
}

export async function fetchEventMatches(eventId) {
    return cachedFetch({ t: "6", e: eventId });
}

export async function fetchPlayerMatches(playerId, season) {
    return cachedFetch({ t: "8", p: playerId, s: season });
}
