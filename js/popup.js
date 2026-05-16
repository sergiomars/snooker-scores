import { Player } from "./player.js";
import { SnookerEvent } from "./snookerEvent.js";
import {
    fetchEvents, fetchPlayers, fetchRankings,
    fetchEventMatches, fetchPlayerMatches,
    getSettings, currentSeason
} from "./service.js";

const content = () => document.getElementById("content");

function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attrs) {
        if (k === "class") e.className = attrs[k];
        else if (k === "onclick") e.onclick = attrs[k];
        else e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
}

function showLoading() { content().innerHTML = '<div class="state">Loading…</div>'; }
function showEmpty(msg) { content().innerHTML = `<div class="state">${msg}</div>`; }
function showError(msg) { content().innerHTML = `<div class="state error">${msg}</div>`; }

function fmtDate(s) {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---- Cached state ----------------------------------------------------------
let state = { season: currentSeason(), players: [], events: [], rankings: [] };

async function loadAll() {
    const s = await getSettings();
    state.season = s.season || currentSeason();
    console.log("Loaded season: " + state.season);
    const [rawPlayers, rawEvents, rawRank] = await Promise.all([
        fetchPlayers(state.season),
        fetchEvents(state.season),
        fetchRankings(state.season),
    ]);

    // Build Player objects + ranking lookup
    const players = (rawPlayers || []).map(p => new Player(p.ID, p.FirstName, p.LastName));
    const byId = new Map(players.map(p => [p.id, p]));
    (rawRank || []).forEach(r => {
        const p = byId.get(r.PlayerID);
        if (p) { p.ranking = r.Position; p.money = r.Sum; }
    });

    const events = (rawEvents || [])
        .filter(e => (!e.Tour || e.Tour === "main")
            && (e.Type === "Ranking" || e.Type === "Invitational"))
        .map(e => Object.assign(
            new SnookerEvent(e.ID, e.Name, e.City, e.StartDate, e.EndDate),
            { country: e.Country, type: e.Type }
        ));

    state.players = players;
    state.events = events;
    state.rankings = (rawRank || []).slice().sort((a, b) => a.Position - b.Position);

    // Persist (preserves prior chrome.storage behaviour)
    chrome.storage.local.set({ players, events });
}

function seasonLabel(s) {
    const y = Number(s);
    return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}

function renderRounds(matches, onMatchClick) {
    const byId = new Map(state.players.map(p => [p.id, p]));
    const rounds = {};
    matches.forEach(m => { (rounds[m.Round] = rounds[m.Round] || []).push(m); });
    const order = Object.keys(rounds).map(Number).sort((a, b) => b - a);
    const labels = ["Final", "Semi-Finals", "Quarter-Finals", "Last 16", "Last 32", "Last 64", "Last 128"];
    order.forEach((r, idx) => {
        content().append(el("div", { class: "round-h" }, labels[idx] || ("Round " + r)));
        rounds[r].forEach(m => {
            const p1 = byId.get(m.Player1ID); const p2 = byId.get(m.Player2ID);
            const n1 = p1 ? `${p1.firstName} ${p1.lastName}` : ("Player " + m.Player1ID);
            const n2 = p2 ? `${p2.firstName} ${p2.lastName}` : ("Player " + m.Player2ID);
            const live = m.Unfinished && (m.Score1 + m.Score2 > 0);
            content().append(el("div", { class: "match clickable", onclick: () => onMatchClick(m) }, [
                el("span", { class: "pn " + (m.WinnerID === m.Player1ID ? "win" : "") }, n1),
                el("span", { class: "sc " + (live ? "live" : "") }, `${m.Score1 ?? 0} - ${m.Score2 ?? 0}`),
                el("span", { class: "pn r " + (m.WinnerID === m.Player2ID ? "win" : "") }, n2),
            ]));
        });
    });
}

function parseFrameScores(s) {
    if (!s) return [];
    const cleaned = s.replace(/<[^>]+>/g, " ").replace(/Session\s*\d+:?/gi, " ");
    // Split frames on commas/semicolons that are OUTSIDE parentheses.
    const parts = [];
    let depth = 0, buf = "";
    for (const ch of cleaned) {
        if (ch === "(") depth++;
        else if (ch === ")") depth = Math.max(0, depth - 1);
        if ((ch === "," || ch === ";" || ch === "\n") && depth === 0) {
            if (buf.trim()) parts.push(buf.trim());
            buf = "";
        } else buf += ch;
    }
    if (buf.trim()) parts.push(buf.trim());

    const frames = [];
    parts.forEach(p => {
        // "98-0 (94)"  /  "66-61 (65,61)"  /  "78(50)-39"  /  "21-87(87)"
        const m = p.match(/(\d+)((?:\s*\([^)]*\))*)\s*-\s*(\d+)((?:\s*\([^)]*\))*)/);
        if (!m) return;
        const s1 = +m[1], s2 = +m[3];
        const nums = g => {
            // pull all numbers from each parenthesized group, ignoring initials/letters
            const out = [];
            (g.match(/\(([^)]*)\)/g) || []).forEach(grp => {
                (grp.match(/\d+/g) || []).forEach(n => out.push(+n));
            });
            return out;
        };
        const pre1 = nums(m[2]);   // breaks already attributed to p1 (legacy "78(50)-39")
        const pre2 = nums(m[4]);   // could be p2's, or trailing-parens breaks for either
        const brk1 = [...pre1], brk2 = [];
        // Assign trailing breaks (pre2) to p1 or p2 based on remaining score capacity.
        let rem1 = s1 - pre1.reduce((a, b) => a + b, 0);
        let rem2 = s2;
        // Largest break first → tighter fit, fewer ambiguities.
        const trailing = pre2.slice().sort((a, b) => b - a);
        trailing.forEach(b => {
            const fits1 = b <= rem1, fits2 = b <= rem2;
            let toP1;
            if (fits1 && !fits2) toP1 = true;
            else if (!fits1 && fits2) toP1 = false;
            else if (fits1 && fits2) toP1 = rem1 - b <= rem2 - b ? true : false; // tighter fit
            else toP1 = rem1 >= rem2; // shouldn't happen; fallback
            if (toP1) { brk1.push(b); rem1 -= b; }
            else { brk2.push(b); rem2 -= b; }
        });
        // Restore original order for display.
        brk1.sort((a, b) => b - a);
        brk2.sort((a, b) => b - a);
        frames.push({ s1, s2, brk1, brk2 });
    });
    return frames;
}

async function renderMatchDetail(eventId, matchId, back) {
    showLoading();
    try {
        const evt = state.events.find(x => x.id === eventId);
        const matches = await fetchEventMatches(eventId);
        const m = matches.find(x => x.ID === matchId);
        if (!m) return showEmpty("Match not found.");
        const byId = new Map(state.players.map(p => [p.id, p]));
        const p1 = byId.get(m.Player1ID); const p2 = byId.get(m.Player2ID);
        const n1 = p1 ? `${p1.firstName} ${p1.lastName}` : ("Player " + m.Player1ID);
        const n2 = p2 ? `${p2.firstName} ${p2.lastName}` : ("Player " + m.Player2ID);

        content().innerHTML = "";
        content().append(el("button", { class: "back-btn", onclick: back }, "← Back"));
        if (evt) content().append(el("div", { class: "evt-meta" }, evt.name));

        content().append(el("div", { class: "match" }, [
            el("span", { class: "pn " + (m.WinnerID === m.Player1ID ? "win" : "") }, n1),
            el("span", { class: "sc" }, `${m.Score1 ?? 0} - ${m.Score2 ?? 0}`),
            el("span", { class: "pn r " + (m.WinnerID === m.Player2ID ? "win" : "") }, n2),
        ]));

        const frames = parseFrameScores(m.FrameScores);
        if (!frames.length) {
            content().append(el("div", { class: "state" }, "No frame-by-frame data available."));
            return;
        }
        content().append(el("div", { class: "round-h" }, "Frames"));
        content().append(el("div", { class: "frame-row frame-head" }, [
            el("span", {}, "#"),
            el("span", { class: "brk-l" }, "Break"),
            el("span", { class: "sc-h" }, "Score"),
            el("span", { class: "brk-r" }, "Break"),
        ]));
        const matchWin1 = m.WinnerID === m.Player1ID;
        const matchWin2 = m.WinnerID === m.Player2ID;
        frames.forEach((f, i) => {
            const brk1 = f.brk1 && f.brk1.length ? f.brk1.join(", ") : "";
            const brk2 = f.brk2 && f.brk2.length ? f.brk2.join(", ") : "";
            content().append(el("div", { class: "frame-row" }, [
                el("span", { class: "frame-no" }, String(i + 1)),
                el("span", { class: "brk-l" + (matchWin1 ? " win" : "") }, brk1),
                el("span", { class: "sc" }, `${f.s1} - ${f.s2}`),
                el("span", { class: "brk-r" + (matchWin2 ? " win" : "") }, brk2),
            ]));
        });
    } catch (e) { showError("Couldn't load match. " + e.message); }
}

// ---- Tab 1: Tournament -----------------------------------------------------
async function renderTournament() {
    showLoading();
    try {
        const now = new Date();
        const ongoing = state.events.find(e => {
            const s = new Date(e.startDate), end = new Date(e.endDate);
            return s <= now && now <= new Date(end.getTime() + 86400000);
        });
        const past = state.events
            .filter(e => new Date(new Date(e.endDate).getTime() + 86400000) < now)
            .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))[0];

        const evt = ongoing || past;
        if (!evt) return showEmpty("No tournament available.");

        const label = ongoing ? "Live" : "Finished";
        const cls = ongoing ? "live" : "soon";
        const title = el("h2", { class: "evt-title" }, [
            evt.name + " ",
            el("span", { class: "badge " + cls }, label),
        ]);
        const meta = el("div", { class: "evt-meta" },
            `${[evt.city, evt.country].filter(Boolean).join(", ")} · ${fmtDate(evt.startDate)} – ${fmtDate(evt.endDate)}`);

        content().innerHTML = "";
        content().append(title, meta);

        const matches = await fetchEventMatches(evt.id);
        if (!matches.length) { content().append(el("div", { class: "state" }, "Draw not available.")); return; }

        renderRounds(matches, (m) => renderMatchDetail(evt.id, m.ID, renderTournament));
    } catch (e) { showError("Couldn't load tournament. " + e.message); }
}

// ---- Tab 2: Season (events list) ------------------------------------------
async function renderSeason() {
    showLoading();
    const events = state.events.slice().sort((a, b) =>
        new Date(a.startDate) - new Date(b.startDate));
    if (!events.length) return showEmpty("No events.");
    const heading = el("h2", { class: "evt-title" }, `Season ${seasonLabel(state.season)}`);
    const tbl = el("table", { class: "data clickable" });
    tbl.append(el("thead", {}, el("tr", {}, [
        el("th", {}, "Event"), el("th", {}, "City"), el("th", {}, "Dates"), el("th", {}, "Status"),
    ])));
    const tb = el("tbody");
    const now = new Date();
    events.forEach(e => {
        const s = new Date(e.startDate), end = new Date(e.endDate);
        const isLive = s <= now && now <= new Date(end.getTime() + 86400000);
        const isUp = s > now;
        const cls = isLive ? "row-live" : (isUp ? "row-up" : "");
        const status = isLive ? "Live" : (isUp ? "Upcoming" : "Finished");
        const badgeCls = isLive ? "live" : (isUp ? "soon" : "");
        tb.append(el("tr", { class: cls, onclick: () => renderSeasonEvent(e.id) }, [
            el("td", {}, e.name),
            el("td", {}, e.city || "—"),
            el("td", {}, `${fmtDate(e.startDate)} – ${fmtDate(e.endDate)}`),
            el("td", {}, el("span", { class: "badge " + badgeCls }, status)),
        ]));
    });
    tbl.append(tb);
    content().innerHTML = ""; content().append(heading, tbl);
}

async function renderSeasonEvent(eventId) {
    showLoading();
    try {
        const evt = state.events.find(x => x.id === eventId);
        if (!evt) return showEmpty("Event not found.");

        const now = new Date();
        const s = new Date(evt.startDate), end = new Date(evt.endDate);
        const isLive = s <= now && now <= new Date(end.getTime() + 86400000);
        const isUp = s > now;
        const label = isLive ? "Live" : (isUp ? "Upcoming" : "Finished");
        const cls = isLive ? "live" : "soon";

        const back = el("button", { class: "back-btn", onclick: renderSeason }, "← Back");
        const title = el("h2", { class: "evt-title" }, [
            evt.name + " ",
            el("span", { class: "badge " + cls }, label),
        ]);
        const meta = el("div", { class: "evt-meta" },
            `${[evt.city, evt.country].filter(Boolean).join(", ")} · ${fmtDate(evt.startDate)} – ${fmtDate(evt.endDate)}`);

        content().innerHTML = "";
        content().append(back, title, meta);

        const matches = await fetchEventMatches(eventId);
        if (!matches.length) { content().append(el("div", { class: "state" }, "Draw not available.")); return; }

        renderRounds(matches, (m) => renderMatchDetail(eventId, m.ID, () => renderSeasonEvent(eventId)));
    } catch (e) { showError("Couldn't load event. " + e.message); }
}

// ---- Tab 3: Rankings -------------------------------------------------------
async function renderRankings() {
    showLoading();
    const ranked = state.players
        .filter(p => p.ranking != null)
        .sort((a, b) => a.ranking - b.ranking)
        .slice(0, 64);
    if (!ranked.length) return showEmpty("No rankings.");
    const tbl = el("table", { class: "data clickable" });
    tbl.append(el("thead", {}, el("tr", {}, [
        el("th", {}, "#"), el("th", {}, "Player"), el("th", {}, "Prize money"),
    ])));
    const tb = el("tbody");
    ranked.forEach(p => {
        const tr = el("tr", { onclick: () => openProfile(p.id) }, [
            el("td", { class: "pos" + (p.ranking <= 3 ? " top3" : "") }, String(p.ranking)),
            el("td", {}, `${p.firstName} ${p.lastName}`),
            el("td", { class: "num" }, "£" + Number(p.money || 0).toLocaleString()),
        ]);
        tb.append(tr);
    });
    tbl.append(tb);
    content().innerHTML = ""; content().append(tbl);
}

// ---- Tab 4: Profile --------------------------------------------------------
async function openProfile(playerId) {
    document.getElementById("radio4").checked = true;
    await renderProfile(playerId);
}

async function renderProfile(playerId) {
    showLoading();
    let pid = playerId;
    if (!pid) {
        const r = await new Promise(res => chrome.storage.local.get(["selectedPlayer"], res));
        pid = r.selectedPlayer;
    }
    if (!pid) {
        return showEmpty("Pick a player from Rankings to see their profile.");
    }
    chrome.storage.local.set({ selectedPlayer: pid });

    const p = state.players.find(x => x.id === pid);
    if (!p) return showEmpty("Player not found.");

    const head = el("div", { class: "profile-head" }, [
        el("h2", {}, `${p.firstName} ${p.lastName}`),
        el("div", { class: "evt-meta" },
            (p.ranking ? `Rank #${p.ranking}` : "Unranked") +
            (p.money ? ` · £${Number(p.money).toLocaleString()}` : "")),
    ]);

    content().innerHTML = "";
    content().append(head);

    try {
        const matches = await fetchPlayerMatches(pid, state.season);
        if (!matches || !matches.length) {
            content().append(el("div", { class: "state" }, "No matches this season."));
            return;
        }
        const byId = new Map(state.players.map(x => [x.id, x]));
        const eventsById = new Map(state.events.map(e => [e.id, e]));
        content().append(el("div", { class: "round-h" }, "Recent matches"));
        matches.slice(0, 20).forEach(m => {
            const oppId = m.Player1ID === pid ? m.Player2ID : m.Player1ID;
            const opp = byId.get(oppId);
            const oppName = opp ? `${opp.firstName} ${opp.lastName}` : ("Player " + oppId);
            const my = m.Player1ID === pid ? m.Score1 : m.Score2;
            const th = m.Player1ID === pid ? m.Score2 : m.Score1;
            const won = m.WinnerID === pid;
            const evt = eventsById.get(m.EventID);
            const meta = evt ? `${evt.name}${evt.city ? " · " + evt.city : ""}` : "";
            const row = el("div", { class: "pmatch" }, [
                meta ? el("div", { class: "pmatch-meta" }, meta) : null,
                el("div", { class: "pmatch-row" }, [
                    el("span", { class: "pn" }, "vs " + oppName),
                    el("span", { class: "sc " + (won ? "win" : "lose") }, `${my ?? 0} - ${th ?? 0}`),
                ]),
            ]);
            content().append(row);
        });
    } catch (e) {
        content().append(el("div", { class: "state error" }, e.message));
    }
}

// ---- Boot ------------------------------------------------------------------
async function boot() {
    showLoading();
    try {
        await loadAll();
        await renderTournament();
    } catch (e) { showError(e.message); }
}

document.getElementById("radio1").addEventListener("click", renderTournament);
document.getElementById("radio2").addEventListener("click", renderSeason);
document.getElementById("radio3").addEventListener("click", renderRankings);
document.getElementById("radio4").addEventListener("click", () => renderProfile());

boot();
