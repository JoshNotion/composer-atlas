// Leaflet map module — shows a composer's journey with toggleable
// birth / lived / death layers, polyline route, dark CartoDB tiles.

const TYPE_COLOR = {
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
// "lived 1712–1759" then "died 1759") merge into a single stop.
function jmBuildStops(composer) {
  const stops = [];
  ((composer && composer.locations) || []).forEach(loc => {
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
    const prev = stops[stops.length - 1];
    if (prev && Math.abs(prev.lat - loc.lat) < 0.01 && Math.abs(prev.lng - loc.lng) < 0.01) {
      prev.years = jmJoinYears(prev.years, String(loc.years || ""));
      return;
    }
    stops.push({ city: loc.city, lat: loc.lat, lng: loc.lng, years: String(loc.years || "") });
  });
  stops.forEach(s => { s.bounds = jmBounds(s.years); });
  return stops;
}

function jmEase(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

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
  const journey = {
    stops: [], idx: 0, phase: "dwell", elapsed: 0, travelMs: 1500,
    raf: null, last: 0, playing: false, finished: false,
    marker: null, trail: null, onState: null,
  };

  function emitJourney() {
    if (journey.onState) {
      journey.onState({
        playable: journey.stops.length > 1,
        playing: journey.playing,
        finished: journey.finished,
      });
    }
  }

  function journeyLabel(years, city) {
    const el = journey.marker && journey.marker.getElement();
    if (!el) return;
    const y = el.querySelector(".jm-years"), c = el.querySelector(".jm-city");
    if (y) y.textContent = years;
    if (c) c.textContent = city;
  }

  function journeyReset() {
    cancelAnimationFrame(journey.raf);
    journey.raf = null;
    journey.playing = false;
    journey.finished = false;
    journey.idx = 0;
    journey.phase = "dwell";
    journey.elapsed = 0;
    if (journey.marker) { map.removeLayer(journey.marker); journey.marker = null; }
    trailLayer.clearLayers();
    journey.trail = null;
  }

  function journeyStart() {
    if (journey.stops.length < 2) return;
    if (journey.finished) journeyReset();
    if (!journey.marker) {
      const s = journey.stops[journey.idx];
      const icon = L.divIcon({
        className: "jm-icon",
        html: '<div class="jm-label"><span class="jm-years"></span><span class="jm-city"></span></div><div class="jm-dot"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      journey.marker = L.marker([s.lat, s.lng], { icon, interactive: false, keyboard: false, zIndexOffset: 5000 }).addTo(map);
      journey.trail = L.polyline([[s.lat, s.lng]], { color: "#f0ede8", weight: 2.5, opacity: 0.85, lineJoin: "round" }).addTo(trailLayer);
      journeyLabel(s.years, s.city);
    }
    journey.playing = true;
    journey.last = performance.now();
    journey.raf = requestAnimationFrame(journeyFrame);
    emitJourney();
  }

  function journeyPause() {
    cancelAnimationFrame(journey.raf);
    journey.raf = null;
    if (journey.playing) { journey.playing = false; emitJourney(); }
  }

  function journeyFrame(now) {
    if (!journey.playing) return;
    const dt = Math.min(now - journey.last, 60);
    journey.last = now;
    journey.elapsed += dt;
    const here = journey.stops[journey.idx];
    const next = journey.stops[journey.idx + 1];

    if (journey.phase === "dwell") {
      if (journey.elapsed >= JM_DWELL_MS) {
        if (!next) {
          journey.playing = false;
          journey.finished = true;
          emitJourney();
          return;
        }
        journey.phase = "travel";
        journey.elapsed = 0;
        const km = map.distance([here.lat, here.lng], [next.lat, next.lng]) / 1000;
        journey.travelMs = Math.max(1000, Math.min(2800, 900 + km * 0.7));
      }
    } else {
      const p = Math.min(1, journey.elapsed / journey.travelMs);
      const e = jmEase(p);
      const lat = here.lat + (next.lat - here.lat) * e;
      const lng = here.lng + (next.lng - here.lng) * e;
      journey.marker.setLatLng([lat, lng]);
      const done = journey.stops.slice(0, journey.idx + 1).map(s => [s.lat, s.lng]);
      journey.trail.setLatLngs([...done, [lat, lng]]);
      // The year ticks forward from the end of the last stay to the start of the next.
      const y0 = here.bounds.end, y1 = next.bounds.start;
      const year = (y0 != null && y1 != null) ? Math.round(y0 + (y1 - y0) * p) : "";
      journeyLabel(String(year), p < 0.5 ? `leaving ${here.city}` : `towards ${next.city}`);
      if (p >= 1) {
        journey.idx += 1;
        journey.phase = "dwell";
        journey.elapsed = 0;
        journeyLabel(next.years, next.city);
      }
    }
    journey.raf = requestAnimationFrame(journeyFrame);
  }

  function clear() {
    journeyReset();
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
    journey.stops = jmBuildStops(composer);
    emitJourney();
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

    if (points.length >= 2) {
      const route = L.polyline(points, {
        color: "#f0ede8",
        weight: 1.5,
        opacity: 0.45,
        dashArray: "4 6",
        lineJoin: "round",
      });
      routeLayer.addLayer(route);
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
    playJourney: journeyStart,
    pauseJourney: journeyPause,
    toggleJourney() { if (journey.playing) journeyPause(); else journeyStart(); },
    onJourneyState(cb) { journey.onState = cb; emitJourney(); },
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
