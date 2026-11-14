// Leaflet map module — shows a composer's journey with toggleable
// birth / lived / death layers, polyline route, dark CartoDB tiles.

import { eraColor } from "./timeline.js";

// Marker colours by kind of place; shared with the world map so both maps read the same.
export const TYPE_COLOR = {
  birth: "#2EC090",
  lived: "#50A0E8",
  death: "#E04060",
};

// CARTO Basemaps raster tiles — classic dark_all style. The API key is
// domain-restricted at CARTO to composer-atlas.joshnotion.workers.dev, so
// it's fine to include client-side. Shared with the world map view.
export const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2d9s_1_a32774cc0662c7d50b68627e";
export const TILE_OPTIONS = {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
  // Always request the @2x tiles: CARTO's 1x tile 4/7/5 is rendered with a grey sea (a visible
  // rectangle over the Atlantic/Europe at zoom 4); the @2x version is correct and sharper.
  r: "@2x",
};

const JM_CURRENT_YEAR = new Date().getFullYear();
const JM_DWELL_MS = 1500;

// First and last year mentioned in a years string ("1703–1706", "1890s–1910s", "2010–present").
function jmBounds(years) {
  const s = String(years || "");
  const nums = (s.match(/\d{3,4}/g) || []).map(Number);
  const present = /present/i.test(s);
  return {
    start: nums.length ? nums[0] : null,
    end: present ? JM_CURRENT_YEAR : (nums.length ? nums[nums.length - 1] : null),
  };
}

function jmJoinYears(a, b) {
  if (a === b) return a;
  if (/,/.test(a) || /,/.test(b)) return `${a}, ${b}`;
  const start = a.split(/[–-]/)[0].trim();
  const parts = b.split(/[–-]/);
  const end = parts[parts.length - 1].trim();
  return start === end ? start : `${start}–${end}`;
}

// One stop per place visited, in order. Consecutive entries at the same place (for example
// "lived 1712–1759" then "died 1759") merge into a single stop. Each stop also gets a
// `stay` label with the whole interval spent there: a place noted with a single year
// (like a birth) lasts until the next stop begins, and the last one until the composer died.
export function jmBuildStops(composer) {
  const stops = [];
  // Chronological by first year mentioned (stable; entries without a year keep their place).
  const ordered = ((composer && composer.locations) || [])
    .map((loc, i) => ({ loc, i, y: jmBounds(loc.years).start }))
    .sort((a, b) => (a.y != null && b.y != null && a.y !== b.y) ? a.y - b.y : a.i - b.i)
    .map(o => o.loc);
  ordered.forEach(loc => {
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
    const prev = stops[stops.length - 1];
    if (prev && Math.abs(prev.lat - loc.lat) < 0.01 && Math.abs(prev.lng - loc.lng) < 0.01) {
      prev.years = jmJoinYears(prev.years, String(loc.years || ""));
      if (loc.type === "death") prev.type = "death";
      return;
    }
    stops.push({ city: loc.city, lat: loc.lat, lng: loc.lng, type: loc.type, years: String(loc.years || "") });
  });
  stops.forEach((s, i) => {
    s.bounds = jmBounds(s.years);
    const single = /^\s*(c\.\s*)?\d{3,4}\s*$/.test(s.years);
    const next = stops[i + 1];
    let label = s.years;
    if (single && s.bounds.start != null) {
      let end = null;
      if (next) {
        const ns = jmBounds(next.years).start;
        if (ns != null && ns > s.bounds.start) end = ns;
      } else if (s.type !== "death" && composer) {
        if (composer.died == null) end = JM_CURRENT_YEAR;
        else if (composer.died > s.bounds.start) end = composer.died;
      }
      if (end != null) {
        label = `${s.bounds.start}–${end === JM_CURRENT_YEAR && composer && composer.died == null ? "present" : end}`;
        s.bounds = { start: s.bounds.start, end };
      }
    }
    s.stay = label;
  });
  return stops;
}

function jmEase(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

// Reusable journey player: walks a marker through `stops` on `map`, drawing a trail into
// `trailLayer`. Used by the composer card's map and by the world map's focus mode.
export function jmCreatePlayer(map, trailLayer) {
  const j = {
    stops: [], idx: 0, phase: "dwell", elapsed: 0, travelMs: 1500,
    raf: null, last: 0, playing: false, finished: false, speed: 1, color: "#f0ede8",
    marker: null, trail: null, cb: null,
  };

  function emit() {
    if (j.cb) j.cb({ playable: j.stops.length > 1, playing: j.playing, finished: j.finished });
  }

  function label(years, city) {
    const el = j.marker && j.marker.getElement();
    if (!el) return;
    const y = el.querySelector(".jm-years"), c = el.querySelector(".jm-city");
    if (y) y.textContent = years;
    if (c) c.textContent = city;
  }

  function reset() {
    cancelAnimationFrame(j.raf);
    j.raf = null;
    j.playing = false;
    j.finished = false;
    j.idx = 0;
    j.phase = "dwell";
    j.elapsed = 0;
    if (j.marker) { map.removeLayer(j.marker); j.marker = null; }
    trailLayer.clearLayers();
    j.trail = null;
  }

  function setStops(stops) {
    reset();
    j.stops = stops || [];
    emit();
  }

  function start() {
    if (j.stops.length < 2) return;
    if (j.finished) reset();
    if (!j.marker) {
      const s = j.stops[j.idx];
      const icon = L.divIcon({
        className: "jm-icon",
        html: '<div class="jm-label"><span class="jm-years"></span><span class="jm-city"></span></div><div class="jm-dot"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      j.marker = L.marker([s.lat, s.lng], { icon, interactive: false, keyboard: false, zIndexOffset: 5000 }).addTo(map);
      j.trail = L.polyline([[s.lat, s.lng]], { color: j.color, weight: 2.5, opacity: 0.95, lineJoin: "round" }).addTo(trailLayer);
      label(s.stay, s.city);
    }
    j.playing = true;
    j.last = performance.now();
    j.raf = requestAnimationFrame(frame);
    emit();
  }

  function pause() {
    cancelAnimationFrame(j.raf);
    j.raf = null;
    if (j.playing) { j.playing = false; emit(); }
  }

  function frame(now) {
    if (!j.playing) return;
    const dt = Math.min(now - j.last, 60) * j.speed;
    j.last = now;
    j.elapsed += dt;
    const here = j.stops[j.idx];
    const next = j.stops[j.idx + 1];

    if (j.phase === "dwell") {
      if (j.elapsed >= JM_DWELL_MS) {
        if (!next) {
          j.playing = false;
          j.finished = true;
          emit();
          return;
        }
        j.phase = "travel";
        j.elapsed = 0;
        const km = map.distance([here.lat, here.lng], [next.lat, next.lng]) / 1000;
        j.travelMs = Math.max(1000, Math.min(2800, 900 + km * 0.7));
      }
    } else {
      const p = Math.min(1, j.elapsed / j.travelMs);
      const e = jmEase(p);
      const lat = here.lat + (next.lat - here.lat) * e;
      const lng = here.lng + (next.lng - here.lng) * e;
      j.marker.setLatLng([lat, lng]);
      const done = j.stops.slice(0, j.idx + 1).map(s => [s.lat, s.lng]);
      j.trail.setLatLngs([...done, [lat, lng]]);
      // The year ticks forward from the end of the last stay to the start of the next.
      const y1 = next.bounds.start;
      const y0 = (here.bounds.end != null && y1 != null) ? Math.min(here.bounds.end, y1) : here.bounds.end;
      const year = (y0 != null && y1 != null) ? Math.round(y0 + (y1 - y0) * p) : "";
      label(String(year), p < 0.5 ? `leaving ${here.city}` : `towards ${next.city}`);
      if (p >= 1) {
        j.idx += 1;
        j.phase = "dwell";
        j.elapsed = 0;
        label(next.stay, next.city);
      }
    }
    j.raf = requestAnimationFrame(frame);
  }

  return {
    setStops, reset, start, pause,
    toggle() { if (j.playing) pause(); else start(); },
    setColor(c) { j.color = c; if (j.trail) j.trail.setStyle({ color: c }); },
    setSpeed(v) { j.speed = v > 0 ? v : 1; },
    onState(cb) { j.cb = cb; emit(); },
    isPlaying: () => j.playing,
  };
}

export function createMap(mapHostEl) {
  const map = L.map(mapHostEl, {
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true,
  }).setView([48, 10], 4);

  L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map);

  const layers = {
    birth: L.layerGroup().addTo(map),
    lived: L.layerGroup().addTo(map),
    death: L.layerGroup().addTo(map),
  };
  const routeLayer = L.layerGroup().addTo(map);

  const visible = { birth: true, lived: true, death: true };
  let currentComposer = null;

  const trailLayer = L.layerGroup().addTo(map);

  // ---- Journey playback: a marker walks the stops in order with a floating years label ----
  const journey = jmCreatePlayer(map, trailLayer);

  function clear() {
    journey.reset();
    Object.values(layers).forEach(l => l.clearLayers());
    routeLayer.clearLayers();
  }

  function setLayer(type, on) {
    visible[type] = on;
    if (on) map.addLayer(layers[type]);
    else map.removeLayer(layers[type]);
  }

  function showComposer(composer) {
    currentComposer = composer;
    clear();
    journey.setColor("#ffffff"); // the card's route is white; the dots carry green / blue / red
    journey.setStops(jmBuildStops(composer));
    if (!composer || !composer.locations || composer.locations.length === 0) return;

    const points = [];

    composer.locations.forEach(loc => {
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
      points.push([loc.lat, loc.lng]);

      const color = TYPE_COLOR[loc.type] || "#888";

      const marker = L.circleMarker([loc.lat, loc.lng], {
        radius: loc.type === "lived" ? 6 : 7,
        color: "#0c0c0c",
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.95,
      });

      const country = loc.country || composer.birthPlace?.country || "";
      const popup = `
        <div class="popup-city">${escapeHtml(loc.city)}</div>
        ${country ? `<div class="popup-meta">${escapeHtml(country)}</div>` : ""}
        <div class="popup-meta">${escapeHtml(loc.type[0].toUpperCase() + loc.type.slice(1))} · ${escapeHtml(loc.years)}</div>
      `.trim();
      marker.bindPopup(popup);

      const grp = layers[loc.type] || layers.lived;
      grp.addLayer(marker);
    });

    // White route; the dots keep the green / blue / red of birth / lived / death.
    const route = jmBuildStops(composer).map(s => [s.lat, s.lng]);
    if (route.length >= 2) {
      routeLayer.addLayer(L.polyline(route, { color: "#ffffff", weight: 2, opacity: 0.75, lineJoin: "round" }));
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points).pad(0.25);
      map.fitBounds(bounds, { animate: false, maxZoom: 6, paddingTopLeft: [24, 78], paddingBottomRight: [24, 56] });
    }
  }

  function invalidateSize() {
    map.invalidateSize();
  }

  return {
    showComposer,
    playJourney: journey.start,
    pauseJourney: journey.pause,
    toggleJourney: journey.toggle,
    onJourneyState: journey.onState,
    setLayer,
    invalidateSize,
    isVisible: (type) => visible[type],
    map,
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
