// World map view: where composers lived, filtered by 50-year bracket, era and place type.
// Places are aggregated, so a city shows one pin with a count and a list of composers.

import { eraColor } from "./timeline.js";
import { TILE_URL, TILE_OPTIONS } from "./map.js";

const WM_FIRST_BRACKET = 1050;
const WM_LAST_BRACKET = 2000;
const WM_STEP = 50;
const WM_TYPES = ["birth", "lived", "death"];
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

export function createWorldMap(hostEl, composers, opts = {}) {
  const currentYear = new Date().getFullYear();
  const brackets = wmBrackets();
  const state = {
    era: null,
    bracket: null, // null = all time, otherwise the bracket's start year
    types: { birth: true, lived: true, death: true },
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
        <div class="wm-brackets" id="wm-brackets" role="group" aria-label="Time period"></div>
      </div>
      <div class="wm-types" id="wm-types">
        ${WM_TYPES.map(t => `<button class="layer-btn on" data-type="${t}"><span class="dot ${t}"></span>${WM_TYPE_LABEL[t]}</button>`).join("")}
        <span class="wm-summary" id="wm-summary"></span>
      </div>
    </div>
    <div class="wm-map" id="wm-map"></div>
  `;

  const bracketsEl = hostEl.querySelector("#wm-brackets");
  const summaryEl = hostEl.querySelector("#wm-summary");
  const playBtn = hostEl.querySelector("#wm-play");
  const mapEl = hostEl.querySelector("#wm-map");

  const map = L.map(mapEl, { zoomControl: true, worldCopyJump: true, minZoom: 2 }).setView([40, 5], 3);
  L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map);
  const pinLayer = L.layerGroup().addTo(map);

  // ---- filtering ----------------------------------------------------------------

  function overlaps(rec, bracket) {
    if (bracket == null) return true;
    const lo = bracket, hi = bracket + WM_STEP - 1;
    return rec.spans.some(s => s[0] <= hi && s[1] >= lo);
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
      row.addEventListener("click", () => opts.onSelect && opts.onSelect(e.composer.id));
      list.appendChild(row);
    });
    root.appendChild(list);
    return root;
  }

  function render() {
    const recs = activeRecords(state.bracket);
    const places = groupByPlace(recs);
    pinLayer.clearLayers();

    // Biggest pins first so small ones stay clickable on top.
    places.sort((a, b) => b.people.size - a.people.size);
    places.forEach(place => {
      const n = place.people.size;
      const size = n === 1 ? 12 : Math.round(Math.min(46, 16 + Math.sqrt(n) * 6));
      const color = eraColor(dominantEra([...place.people.values()]));
      const icon = L.divIcon({
        className: "wm-pin-wrap",
        html: `<div class="wm-pin${n === 1 ? " wm-pin-one" : ""}" style="width:${size}px;height:${size}px;background:${color}">${n > 1 ? n : ""}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([place.lat, place.lng], { icon, title: place.city, riseOnHover: true });
      marker.bindPopup(() => popupFor(place), { maxWidth: 340, minWidth: 240, className: "wm-leaflet-popup" });
      pinLayer.addLayer(marker);
    });

    const composerCount = new Set(recs.map(r => r.composer.id)).size;
    const label = state.bracket == null ? "All time" : `${state.bracket}–${state.bracket + WM_STEP}`;
    summaryEl.textContent = `${label} · ${composerCount} composer${composerCount === 1 ? "" : "s"} · ${places.length} place${places.length === 1 ? "" : "s"}`;
  }

  function renderBrackets() {
    const counts = brackets.map(b => new Set(activeRecords(b).map(r => r.composer.id)).size);
    const max = Math.max(1, ...counts);
    const allCount = new Set(activeRecords(null).map(r => r.composer.id)).size;
    bracketsEl.innerHTML =
      `<button class="wm-bracket${state.bracket == null ? " active" : ""}" data-b="">
         <span class="wm-bar" style="height:100%"></span><span class="wm-blabel">All time</span><span class="wm-bcount">${allCount}</span>
       </button>` +
      brackets.map((b, i) => `
        <button class="wm-bracket${state.bracket === b ? " active" : ""}${counts[i] === 0 ? " empty" : ""}" data-b="${b}" title="${b}–${b + WM_STEP}: ${counts[i]} composers">
          <span class="wm-bar" style="height:${Math.max(6, Math.round((counts[i] / max) * 100))}%"></span>
          <span class="wm-blabel">${b}</span><span class="wm-bcount">${counts[i]}</span>
        </button>`).join("");
  }

  function refresh() {
    renderBrackets();
    render();
  }

  function setBracket(b) {
    state.bracket = b;
    refresh();
    // Scroll the strip itself; scrollIntoView would also scroll the page layout sideways.
    const active = bracketsEl.querySelector(".wm-bracket.active");
    if (active) {
      const target = active.offsetLeft - (bracketsEl.clientWidth - active.offsetWidth) / 2;
      bracketsEl.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }
    if (opts.onChange) opts.onChange(state);
  }

  bracketsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".wm-bracket");
    if (!btn) return;
    stopPlay();
    const v = btn.getAttribute("data-b");
    setBracket(v === "" ? null : parseInt(v, 10));
  });

  hostEl.querySelector("#wm-types").addEventListener("click", (e) => {
    const btn = e.target.closest(".layer-btn");
    if (!btn) return;
    const t = btn.getAttribute("data-type");
    state.types[t] = !state.types[t];
    btn.classList.toggle("on", state.types[t]);
    refresh();
  });

  // ---- play ---------------------------------------------------------------------

  let playTimer = null;
  function stopPlay() {
    clearInterval(playTimer);
    playTimer = null;
    playBtn.classList.remove("playing");
  }
  function startPlay() {
    playBtn.classList.add("playing");
    let idx = state.bracket == null ? 0 : brackets.indexOf(state.bracket) + 1;
    if (idx >= brackets.length) idx = 0;
    setBracket(brackets[idx]);
    playTimer = setInterval(() => {
      idx += 1;
      if (idx >= brackets.length) { stopPlay(); return; }
      setBracket(brackets[idx]);
    }, 1500);
  }
  playBtn.addEventListener("click", () => (playTimer ? stopPlay() : startPlay()));

  refresh();

  return {
    setEra(era) { state.era = era || null; refresh(); },
    setBracket(b) { stopPlay(); setBracket(b); },
    getBracket: () => state.bracket,
    stop: stopPlay,
    invalidateSize() { map.invalidateSize(); },
  };
}
