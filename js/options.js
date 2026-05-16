import { getSettings, setSettings, clearCache, currentSeason } from "./service.js";

const seasonSel = document.getElementById("season");
const statusEl = document.getElementById("status");

(async function init() {
    const cur = currentSeason();
    for (let s = cur; s >= cur - 6; s--) {
        const o = document.createElement("option");
        o.value = s; o.textContent = `${s}/${(s + 1).toString().slice(2)}`;
        seasonSel.appendChild(o);
    }
    const s = await getSettings();
    seasonSel.value = s.season;

    seasonSel.onchange = async () => {
        await setSettings({ season: parseInt(seasonSel.value) });
        flash("Saved.");
    };
    document.getElementById("clear").onclick = async () => {
        await clearCache(); flash("Cache cleared.");
    };
})();

function flash(msg) {
    statusEl.textContent = msg;
    setTimeout(() => (statusEl.textContent = ""), 1500);
}
