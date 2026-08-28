// Leaflet map module — shows a composer's journey with toggleable
// birth / lived / death layers, polyline route, dark CartoDB tiles.

const TYPE_COLOR = {
  birth: "#2EC090",
  lived: "#50A0E8",
  death: "#E04060",
};

export function createMap(mapHostEl) {
  const map = L.map(mapHostEl, {
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true,
  }).setView([48, 10], 4);

  // CARTO Basemaps raster tiles — classic dark_all style. The API key is
  // domain-restricted at CARTO to composer-atlas.joshnotion.workers.dev, so
  // it's fine to include client-side.
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2d9s_1_a32774cc0662c7d50b68627e", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  const layers = {
    birth: L.layerGroup().addTo(map),
    lived: L.layerGroup().addTo(map),
    death: L.layerGroup().addTo(map),
  };
  const routeLayer = L.layerGroup().addTo(map);

  const visible = { birth: true, lived: true, death: true };
  let currentComposer = null;

  function clear() {
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
      map.fitBounds(bounds, { animate: false, maxZoom: 6 });
    }
  }

  function invalidateSize() {
    map.invalidateSize();
  }

  return {
    showComposer,
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
