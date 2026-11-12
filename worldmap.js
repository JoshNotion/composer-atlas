// World map view: where composers lived, filtered by 50-year bracket, era and place type.
// Places are aggregated, so a city shows one pin with a count and a list of composers.

import { eraColor } from "./timeline.js";
import { TILE_URL, TILE_OPTIONS, jmBuildStops, jmCreatePlayer } from "./map.js";

export const WM_FIRST_BRACKET = 1050;
export const WM_LAST_BRACKET = 2000;
export const WM_STEP = 50;
const WM_TYPES = ["birth", "lived", "death"];
// Conventional period boundaries, used for the ribbon and the colour under each bracket.
export const WM_PERIODS = [
  { era: "Medieval", from: 1050, to: 1400 },
  { era: "Renaissance", from: 1400, to: 1600 },
  { era: "Baroque", from: 1600, to: 1750 },
  { era: "Classical", from: 1750, to: 1820 },
  { era: "Romantic", from: 1820, to: 1900 },
  { era: "Modern", from: 1900, to: 1975 },
  { era: "Contemporary", from: 1975, to: 2050 },
];
const WM_TYPE_LABEL = { birth: "Born", lived: "Lived", death: "Died" };

// ---- year parsing -------------------------------------------------------------
// Location years come in many shapes: "1685", "1703–1706", "c.1505", "1890s–1910s",
// "2010–present", "1818, 1824", "1901–1903, 1911–1915". Each shape becomes [lo, hi] spans.

function wmTokenRange(token, currentYear) {
  const t = token.trim();
  if (/^present$/i.test(t)) return [currentYear, currentYear];
  const m = t.match(/^(\d{3,4})(s?)$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return m[2] ? [y, y + 9] : [y, y];
}

function wmParseSpans(years, currentYear) {
  if (!years) return null;
  const spans = [];
  for (const part of String(years).split(",")) {
    const cleaned = part.trim().replace(/^c\.\s*/i, "");
    const halves = cleaned.split(/[–-]/);
    const first = wmTokenRange(halves[0], currentYear);
    const last = wmTokenRange(halves[halves.length - 1], currentYear);
    if (!first || !last) return null;
    spans.push([first[0], Math.min(currentYear, Math.max(last[1], first[0]))]);
  }
  return spans.length ? spans : null;
}

function wmBrackets() {
  const out = [];
  for (let b = WM_FIRST_BRACKET; b <= WM_LAST_BRACKET; b += WM_STEP) out.push(b);
  return out;
}

// Hard-stop gradient showing which periods a 50-year bracket covers.
export function wmPeriodGradient(b) {
  const lo = b, hi = b + WM_STEP;
  const stops = [];
  WM_PERIODS.forEach(p => {
    const from = Math.max(lo, p.from), to = Math.min(hi, p.to);
    if (to <= from) return;
    const x0 = ((from - lo) / WM_STEP) * 100, x1 = ((to - lo) / WM_STEP) * 100;
    const c = eraColor(p.era);
    stops.push(`${c} ${x0.toFixed(1)}%`, `${c} ${x1.toFixed(1)}%`);
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

const WM_SPEEDS = [0.5, 1, 2, 4];
const WM_PLAY_MS = 1500; // time per 50-year bracket at 1×

export function createWorldMap(hostEl, composers, opts = {}) {
  const currentYear = new Date().getFullYear();
  const brackets = wmBrackets();
  const state = {
    era: null,
    bracket: null, // null = all time, otherwise the bracket's start year
    types: { birth: true, lived: true, death: true },
    focus: null, // composer id: show only this person's places, joined in order
  };

  // Flatten to one record per (composer, location) with parsed spans.
  const records = [];
  composers.forEach(c => {
    const fallback = [[c.born, Math.min(currentYear, c.died ?? currentYear)]];
    (c.locations || []).forEach(loc => {
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
      const spans = wmParseSpans(loc.years, currentYear) || fallback;
      records.push({ composer: c, loc, spans });
    });
  });

  hostEl.innerHTML = `
    <div class="wm-toolbar">
      <div class="wm-brackets-row">
        <button class="wm-play" id="wm-play" title="Play through the centuries" aria-label="Play through the centuries">
          <svg class="wm-icon-play" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"></path></svg>
          <svg class="wm-icon-pause" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"></path></svg>
        </button>
        <div class="wm-timeline">
          <div class="wm-timeline-inner">
            <div class="wm-ribbon" id="wm-ribbon" aria-label="Classical periods"></div>
            <div class="wm-brackets" id="wm-brackets" role="group" aria-label="Time period"></div>
          </div>
        </div>
      </div>
      <div class="wm-types" id="wm-types">
        ${WM_TYPES.map(t => `<button class="layer-btn on" data-type="${t}"><span class="dot ${t}"></span>${WM_TYPE_LABEL[t]}</button>`).join("")}
        <div class="wm-speed" id="wm-speed" role="group" aria-label="Playback speed">
          <span class="wm-speed-label">Speed</span>
          ${WM_SPEEDS.map(v => `<button type="button" class="wm-speed-btn${v === 1 ? " on" : ""}" data-speed="${v}" aria-pressed="${v === 1}">${v}×</button>`).join("")}
        </div>
        <button class="wm-focus-chip" id="wm-focus" type="button" hidden></button>
        <span class="wm-summary" id="wm-summary"></span>
      </div>
    </div>
    <div class="wm-map" id="wm-map"></div>
    <button class="journey-btn wm-journey-btn" id="wm-journey" type="button" hidden>
      <svg class="ji-play" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"></path></svg>
      <svg class="ji-pause" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"></path></svg>
      <span class="ji-text">Play journey</span>
    </button>
  `;

  const bracketsEl = hostEl.querySelector("#wm-brackets");
  const ribbonEl = hostEl.querySelector("#wm-ribbon");
  const summaryEl = hostEl.querySelector("#wm-summary");
  const playBtn = hostEl.querySelector("#wm-play");
  const mapEl = hostEl.querySelector("#wm-map");

  const map = L.map(mapEl, { zoomControl: true, worldCopyJump: true, minZoom: 2 }).setView([40, 5], 3);
  L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map);
  const lineLayer = L.layerGroup().addTo(map);
  const pinLayer = L.layerGroup().addTo(map);
  const focusEl = hostEl.querySelector("#wm-focus");

  // Journey playback for the focused composer (same player as the composer card used to have).
  const trailLayer = L.layerGroup().addTo(map);
  const journey = jmCreatePlayer(map, trailLayer);
  const journeyBtn = hostEl.querySelector("#wm-journey");
  let journeyLoaded = false;
  const journeyListeners = [];
  let journeyState = { playable: false, playing: false, finished: false };
  journey.onState((st) => {
    journeyState = st;
    journeyListeners.forEach(fn => fn(st));
    journeyBtn.hidden = !st.playable;
    journeyBtn.classList.toggle("playing", st.playing);
    journeyBtn.querySelector(".ji-text").textContent = st.playing ? "Pause" : (st.finished ? "Replay journey" : "Play journey");
  });
  journeyBtn.addEventListener("click", () => journey.toggle());

  // ---- filtering ----------------------------------------------------------------

  function overlaps(rec, bracket) {
    if (bracket == null) return true;
    const lo = bracket, hi = bracket + WM_STEP - 1;
    return rec.spans.some(s => s[0] <= hi && s[1] >= lo);
  }

  // a focused composer is shown with their whole life, regardless of bracket or type filters
  function focusRecords() {
    return records.filter(r => r.composer.id === state.focus);
  }

  function activeRecords(bracket) {
    return records.filter(r =>
      (!state.era || r.composer.era === state.era) &&
      state.types[r.loc.type] !== false &&
      overlaps(r, bracket)
    );
  }

  function placeKey(loc) { return `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}`; }

  function groupByPlace(recs) {
    const places = new Map();
    recs.forEach(r => {
      const key = placeKey(r.loc);
      let p = places.get(key);
      if (!p) {
        p = { key, city: r.loc.city, country: r.loc.country || "", lat: r.loc.lat, lng: r.loc.lng, people: new Map() };
        places.set(key, p);
      }
      if (!p.country && r.loc.country) p.country = r.loc.country;
      let entry = p.people.get(r.composer.id);
      if (!entry) {
        entry = { composer: r.composer, types: new Set(), years: [] };
        p.people.set(r.composer.id, entry);
      }
      entry.types.add(r.loc.type);
      if (r.loc.years && !entry.years.includes(r.loc.years)) entry.years.push(r.loc.years);
    });
    return [...places.values()];
  }

  // ---- rendering ----------------------------------------------------------------

  function dominantEra(people) {
    const counts = {};
    people.forEach(e => { counts[e.composer.era] = (counts[e.composer.era] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  function popupFor(place) {
    const people = [...place.people.values()].sort((a, b) => a.composer.born - b.composer.born);
    const root = document.createElement("div");
    root.className = "wm-popup";
    const head = document.createElement("div");
    head.className = "popup-city";
    head.textContent = place.city;
    root.appendChild(head);
    const meta = document.createElement("div");
    meta.className = "popup-meta";
    meta.textContent = `${place.country ? place.country + " · " : ""}${people.length} composer${people.length === 1 ? "" : "s"}`;
    root.appendChild(meta);
    const list = document.createElement("div");
    list.className = "wm-popup-list";
    people.forEach(e => {
      const row = document.createElement("button");
      row.className = "wm-popup-row";
      row.type = "button";
      const dot = document.createElement("span");
      dot.className = "wm-popup-dot";
      dot.style.background = eraColor(e.composer.era);
      const name = document.createElement("span");
      name.className = "wm-popup-name";
      name.textContent = e.composer.name;
      const detail = document.createElement("span");
      detail.className = "wm-popup-detail";
      const kinds = WM_TYPES.filter(t => e.types.has(t)).map(t => WM_TYPE_LABEL[t]).join(", ");
      detail.textContent = `${kinds} · ${e.years.join(", ")}`;
      row.append(dot, name, detail);
      row.addEventListener("click", () => { focusComposer(e.composer.id); if (opts.onSelect) opts.onSelect(e.composer.id); });
      list.appendChild(row);
    });
    root.appendChild(list);
    return root;
  }

  // ---- focus mode: click a person to see only their journey --------------------

  function focusComposer(id) {
    state.focus = id;
    map.closePopup();
    const comp = composers.find(c => c.id === id);
    journey.setStops(comp ? jmBuildStops(comp) : []);
    journeyLoaded = true;
    render();
    fitToActive();
  }

  function clearFocus() {
    if (!state.focus) return;
    state.focus = null;
    render();
    fitToActive();
  }

  function renderFocus(recs) {
    const c = recs[0].composer;
    const color = eraColor(c.era);
    const stops = jmBuildStops(c);
    pinLayer.clearLayers();
    lineLayer.clearLayers();
    if (stops.length > 1) {
      lineLayer.addLayer(L.polyline(stops.map(s => [s.lat, s.lng]), { color, weight: 2, opacity: 0.8, lineJoin: "round" }));
    }
    stops.forEach((st, i) => {
      const size = 20;
      const icon = L.divIcon({
        className: "wm-pin-wrap",
        html: `<div class="wm-pin wm-pin-step" style="width:${size}px;height:${size}px;--pin:${color}">${stops.length > 1 ? i + 1 : ""}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([st.lat, st.lng], { icon, zIndexOffset: 1000 + i });
      marker.bindTooltip(`<strong>${escapeWm(st.city)}</strong><br>${escapeWm(st.stay)}`, { direction: "top", offset: [0, -8], className: "wm-tip" });
      marker.on("click", () => opts.onSelect && opts.onSelect(c.id));
      pinLayer.addLayer(marker);
    });
    focusEl.hidden = false;
    focusEl.innerHTML = `<span class="wm-focus-dot" style="background:${color}"></span><span>Showing <strong>${escapeWm(c.name)}</strong> only</span><span class="wm-focus-x">Show everyone &times;</span>`;
    const label = "Whole life";
    summaryEl.textContent = `${label} · ${stops.length} place${stops.length === 1 ? "" : "s"}`;
  }

  function render() {
    let recs = activeRecords(state.bracket);
    if (state.focus) {
      const mine = focusRecords();
      if (mine.length) { renderFocus(mine); applyLife(); return; }
      state.focus = null; // nothing left to show for them with the current filters
    }
    focusEl.hidden = true;
    if (journeyLoaded) { journey.setStops([]); journeyLoaded = false; }
    lineLayer.clearLayers();
    const places = groupByPlace(recs);
    pinLayer.clearLayers();

    // Quiet pins: a single composer is a small dot that opens their card directly; several
    // composers share a thin ring with a count and open a list. Era colours are the same
    // as the timeline's, drawn translucent so the map stays calm.
    places.forEach(place => {
      const n = place.people.size;
      const era = dominantEra([...place.people.values()]);
      const color = eraColor(era);
      const size = n === 1 ? 9 : Math.round(Math.min(34, 15 + Math.sqrt(n) * 3.4));
      const html = n === 1
        ? `<div class="wm-pin wm-pin-one" style="width:${size}px;height:${size}px;--pin:${color}"></div>`
        : `<div class="wm-pin wm-pin-many" style="width:${size}px;height:${size}px;--pin:${color}">${size >= 20 ? n : ""}</div>`;
      const icon = L.divIcon({
        className: "wm-pin-wrap",
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      // Smaller pins sit above larger ones, so a dot is never hidden under a ring.
      const marker = L.marker([place.lat, place.lng], { icon, riseOnHover: true, zIndexOffset: 1000 - n });
      if (n === 1) {
        const only = [...place.people.values()][0];
        marker.bindTooltip(
          `<strong>${escapeWm(only.composer.name)}</strong><br>${escapeWm(place.city)} · ${escapeWm(only.years.join(", "))}`,
          { direction: "top", offset: [0, -6], className: "wm-tip" }
        );
        marker.on("click", () => { focusComposer(only.composer.id); if (opts.onSelect) opts.onSelect(only.composer.id); });
      } else {
        marker.bindTooltip(`${escapeWm(place.city)} · ${n} composers`, { direction: "top", offset: [0, -8], className: "wm-tip" });
        marker.bindPopup(() => popupFor(place), { maxWidth: 340, minWidth: 240, className: "wm-leaflet-popup" });
      }
      pinLayer.addLayer(marker);
    });

    const composerCount = new Set(recs.map(r => r.composer.id)).size;
    const label = state.bracket == null ? "All time" : `${state.bracket}–${state.bracket + WM_STEP}`;
    summaryEl.textContent = `${label} · ${composerCount} composer${composerCount === 1 ? "" : "s"} · ${places.length} place${places.length === 1 ? "" : "s"}`;
    applyLife();
  }

  function renderRibbon() {
    const span = WM_LAST_BRACKET + WM_STEP - WM_FIRST_BRACKET;
    const bLo = state.bracket, bHi = state.bracket == null ? null : state.bracket + WM_STEP;
    ribbonEl.innerHTML = WM_PERIODS.map(p => {
      const left = ((p.from - WM_FIRST_BRACKET) / span) * 100;
      const width = ((p.to - p.from) / span) * 100;
      const on = bLo != null && p.from < bHi && p.to > bLo;
      return `<button class="wm-period${on ? " on" : ""}" data-from="${p.from}" style="left:${left}%;width:${width}%;--era:${eraColor(p.era)}" title="${p.era} · c. ${p.from}–${p.to}">
        <span>${p.era}</span></button>`;
    }).join("");
  }

  function renderBrackets() {
    const counts = brackets.map(b => new Set(activeRecords(b).map(r => r.composer.id)).size);
    const max = Math.max(1, ...counts);
    const allCount = new Set(activeRecords(null).map(r => r.composer.id)).size;
    bracketsEl.innerHTML =
      `<button class="wm-bracket wm-bracket-all${state.bracket == null ? " active" : ""}" data-b="">
         <span class="wm-bar" style="height:100%"></span><span class="wm-blabel">All time</span><span class="wm-bcount">${allCount}</span>
       </button>` +
      brackets.map((b, i) => `
        <button class="wm-bracket${state.bracket === b ? " active" : ""}${counts[i] === 0 ? " empty" : ""}" data-b="${b}" title="${b}–${b + WM_STEP}: ${counts[i]} composers">
          <span class="wm-bar" style="height:${Math.max(6, Math.round((counts[i] / max) * 100))}%"></span>
          <span class="wm-blabel">${b}</span><span class="wm-bcount">${counts[i]}</span>
          <span class="wm-period-line" style="background:${wmPeriodGradient(b)}"></span>
        </button>`).join("");
    renderRibbon();
  }

  // When a composer is focused, light up only the periods their life spans in the bar above
  // (the 50-year buttons, the period ribbon, and an exact born-to-died line); dim the rest.
  function applyLife() {
    const timelineEl = hostEl.querySelector(".wm-timeline");
    ribbonEl.querySelectorAll(".wm-life-bar").forEach(n => n.remove());
    const c = state.focus ? composers.find(x => x.id === state.focus) : null;
    timelineEl.classList.toggle("has-life", !!c);
    if (!c || !Number.isFinite(c.born)) {
      timelineEl.classList.remove("has-life");
      bracketsEl.querySelectorAll(".in-life").forEach(n => n.classList.remove("in-life"));
      ribbonEl.querySelectorAll(".in-life").forEach(n => n.classList.remove("in-life"));
      return;
    }
    const from = c.born, to = c.died ?? currentYear;
    timelineEl.style.setProperty("--life", eraColor(c.era));
    bracketsEl.querySelectorAll(".wm-bracket[data-b]").forEach(btn => {
      const v = btn.getAttribute("data-b");
      const b = v === "" ? null : parseInt(v, 10);
      btn.classList.toggle("in-life", b != null && b <= to && b + WM_STEP - 1 >= from);
    });
    ribbonEl.querySelectorAll(".wm-period").forEach(seg => {
      const p = WM_PERIODS.find(x => x.from === parseInt(seg.getAttribute("data-from"), 10));
      seg.classList.toggle("in-life", !!p && p.from <= to && p.to > from);
    });
    const span = WM_LAST_BRACKET + WM_STEP - WM_FIRST_BRACKET;
    const lo = Math.max(from, WM_FIRST_BRACKET), hi = Math.min(to, WM_LAST_BRACKET + WM_STEP);
    if (hi > lo) {
      const bar = document.createElement("div");
      bar.className = "wm-life-bar";
      bar.style.left = `${((lo - WM_FIRST_BRACKET) / span) * 100}%`;
      bar.style.width = `${((hi - lo) / span) * 100}%`;
      bar.title = `${c.name} · ${from}–${c.died ?? "present"}`;
      ribbonEl.appendChild(bar);
    }
  }

  function refresh() {
    renderBrackets();
    render();
  }

  // Zoom to wherever composers are in the chosen period; all time shows the wider world.
  function fitToActive() {
    if (state.focus) {
      const pts = focusRecords().map(r => [r.loc.lat, r.loc.lng]);
      if (pts.length) map.flyToBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 7, duration: 0.8 });
      return;
    }
    if (state.bracket == null) {
      map.flyTo([40, 5], 3, { duration: 0.8 });
      return;
    }
    const pts = activeRecords(state.bracket).map(r => [r.loc.lat, r.loc.lng]);
    if (!pts.length) return;
    map.flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 6, duration: 0.8 });
  }

  function setBracket(b) {
    state.bracket = b;
    state.focus = null;
    refresh();
    fitToActive();
    if (opts.onChange) opts.onChange(state);
  }

  bracketsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".wm-bracket");
    if (!btn) return;
    stopPlay();
    const v = btn.getAttribute("data-b");
    setBracket(v === "" ? null : parseInt(v, 10));
  });

  ribbonEl.addEventListener("click", (e) => {
    const seg = e.target.closest(".wm-period");
    if (!seg) return;
    const from = parseInt(seg.getAttribute("data-from"), 10);
    const b = WM_FIRST_BRACKET + Math.floor((from - WM_FIRST_BRACKET) / WM_STEP) * WM_STEP;
    stopPlay();
    setBracket(b);
  });

  focusEl.addEventListener("click", clearFocus);
  map.on("click", clearFocus);

  hostEl.querySelector("#wm-types").addEventListener("click", (e) => {
    const btn = e.target.closest(".layer-btn[data-type]");
    if (!btn) return;
    const t = btn.getAttribute("data-type");
    state.types[t] = !state.types[t];
    btn.classList.toggle("on", state.types[t]);
    refresh();
  });

  // ---- play ---------------------------------------------------------------------

  let playTimer = null;
  let playIdx = 0;
  let speed = 1;
  const speedEl = hostEl.querySelector("#wm-speed");

  function stepPlay() {
    playIdx += 1;
    if (playIdx >= brackets.length) { stopPlay(); return; }
    setBracket(brackets[playIdx]);
  }
  function stopPlay() {
    clearInterval(playTimer);
    playTimer = null;
    playBtn.classList.remove("playing");
  }
  function startPlay() {
    playBtn.classList.add("playing");
    playIdx = state.bracket == null ? 0 : brackets.indexOf(state.bracket) + 1;
    if (playIdx >= brackets.length) playIdx = 0;
    setBracket(brackets[playIdx]);
    playTimer = setInterval(stepPlay, WM_PLAY_MS / speed);
  }
  speedEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".wm-speed-btn");
    if (!btn) return;
    speed = parseFloat(btn.dataset.speed);
    journey.setSpeed(speed);
    speedEl.querySelectorAll(".wm-speed-btn").forEach(b => {
      const on = b === btn;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    // Changing speed mid-play keeps the current position and just re-times the steps.
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = setInterval(stepPlay, WM_PLAY_MS / speed);
    }
  });
  playBtn.addEventListener("click", () => (playTimer ? stopPlay() : startPlay()));

  refresh();

  return {
    setEra(era) { state.era = era || null; refresh(); },
    setBracket(b) { stopPlay(); setBracket(b); },
    getBracket: () => state.bracket,
    stop: stopPlay,
    clearFocus,
    // Journey controls, so the composer card can drive the same playback.
    focus(id) { if (state.focus !== id) focusComposer(id); },
    toggleJourney() { journey.toggle(); },
    getJourneyState: () => journeyState,
    onJourney(fn) { journeyListeners.push(fn); },
    // Re-centre on the focused composer (used once the side card has finished sliding in).
    refit() { if (state.focus) fitToActive(); },
    invalidateSize() { map.invalidateSize(); },
  };
}

function escapeWm(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
