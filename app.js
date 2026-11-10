// App glue: load data, normalize bidirectional relationships,
// initialize timeline / map / panel, wire selection, hover, zoom, lightbox.

import { createTimeline, eraColor, ZOOM_LEVELS } from "./timeline.js";
import { createMap } from "./map.js";
import { createWorldMap } from "./worldmap.js";
import { createHome } from "./home.js";
import { createBrowse } from "./browse.js";
import { renderDetail, renderEmpty } from "./panel.js";
import { initialsFor, mountPortrait, resolvePortraitUrl } from "./portraits.js";

const ERA_ORDER = ["Medieval", "Renaissance", "Baroque", "Classical", "Romantic", "Modern", "Contemporary"];

async function main() {
  const composers = await loadComposers();

  // Normalize relationships:
  //  - accept legacy string form ["handel"] and migrate to [{id:"handel", note:""}]
  //  - mirror to make symmetric
  const byId = new Map(composers.map(c => [c.id, c]));
  composers.forEach(c => {
    const list = Array.isArray(c.relationships) ? c.relationships : [];
    c.relationships = list.map(r => typeof r === "string" ? { id: r, note: "" } : { ...r });
  });
  composers.forEach(c => {
    c.relationships.forEach(rel => {
      const other = byId.get(rel.id);
      if (!other) return;
      if (!other.relationships.find(r => r.id === c.id)) {
        other.relationships.push({ id: c.id, note: rel.note || "" });
      }
    });
  });

  buildLegend(document.getElementById("legend"), (era) => setEraFilter(era));
  updateBrandSub(composers, null);

  // --- Tooltip
  const tooltip = document.getElementById("tooltip");
  const tlWrap = document.getElementById("timeline-wrap");

  function showTooltip(composer, event) {
    const color = eraColor(composer.era);
    const initials = initialsFor(composer.name);
    tooltip.innerHTML = `
      <div class="tt-portrait" id="tt-portrait" data-composer-id="${escapeAttr(composer.id)}" style="background:${color}">
        <span class="initials">${escapeHtml(initials)}</span>
      </div>
      <div class="tt-name">${escapeHtml(composer.name)}</div>
      <div class="tt-meta">${composer.born}&nbsp;–&nbsp;${composer.died ?? "present"}</div>
      <div><span class="tt-era" style="background:${color}">${escapeHtml(composer.era)}</span></div>
    `;
    tooltip.hidden = false;
    mountPortrait(tooltip.querySelector("#tt-portrait"), composer);
    positionTooltip(event);
  }
  function positionTooltip(event) {
    const wrapRect = tlWrap.getBoundingClientRect();
    const x = event.clientX - wrapRect.left + 14;
    const y = event.clientY - wrapRect.top + 14;
    const ttRect = tooltip.getBoundingClientRect();
    const maxX = wrapRect.width - ttRect.width - 12;
    const maxY = wrapRect.height - ttRect.height - 12;
    tooltip.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
  }
  function hideTooltip() { tooltip.hidden = true; }

  // --- Views (created lazily the first time they are shown, so Leaflet and D3
  //     always measure a visible container)
  const views = {
    home: document.getElementById("view-home"),
    timeline: document.getElementById("timeline-wrap"),
    map: document.getElementById("view-map"),
    composers: document.getElementById("view-composers"),
  };
  const VIEW_TITLES = { home: "Composer Atlas", timeline: "Timeline", map: "World map", composers: "Composers" };

  let currentView = null;
  let currentEra = null;
  let timeline = null;
  let worldMap = null;
  let browse = null;
  let homeBuilt = false;

  const zoomReadout = document.getElementById("zoom-readout");
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");

  function ensureTimeline() {
    if (timeline) return;
    timeline = createTimeline(
      document.getElementById("timeline-scroll"),
      composers,
      {
        onSelect: (id) => selectComposer(id),
        onHover: (c, ev) => showTooltip(c, ev),
        onHoverEnd: () => hideTooltip(),
        onZoomChange: (z) => updateZoomUi(z),
      }
    );
    // Ctrl/Cmd + wheel zooms the timeline
    document.getElementById("timeline-scroll").addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      nudgeZoom(e.deltaY > 0 ? -1 : +1);
    }, { passive: false });
    timeline.setFilter(currentEra);
    updateZoomUi(timeline.getZoom());
  }

  function ensureWorldMap(bracket) {
    if (!worldMap) {
      worldMap = createWorldMap(views.map, composers, {
        onSelect: (id) => selectComposer(id),
        onChange: () => writeHash(),
      });
      worldMap.setEra(currentEra);
    }
    if (bracket !== undefined && worldMap.getBracket() !== bracket) worldMap.setBracket(bracket);
  }

  function ensureBrowse() {
    if (browse) return;
    browse = createBrowse(views.composers, composers, { onSelect: (id) => selectComposer(id) });
    browse.setEra(currentEra);
  }

  function ensureHome() {
    if (homeBuilt) return;
    homeBuilt = true;
    createHome(views.home, composers, { onSelect: (id) => selectComposer(id) });
  }

  function updateZoomUi(z) {
    zoomReadout.textContent = formatZoom(z);
    zoomOutBtn.disabled = z <= ZOOM_LEVELS[0];
    zoomInBtn.disabled  = z >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  }
  function formatZoom(z) {
    return Number.isInteger(z) ? `${z}×` : `${z}×`;
  }
  function nudgeZoom(dir) {
    if (!timeline || currentView !== "timeline") return;
    const z = timeline.getZoom();
    const idx = ZOOM_LEVELS.findIndex(v => Math.abs(v - z) < 0.01);
    const nextIdx = idx === -1
      ? (dir > 0 ? ZOOM_LEVELS.findIndex(v => v > z) : ZOOM_LEVELS.findIndex(v => v > z) - 1)
      : idx + dir;
    const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, nextIdx))];
    timeline.setZoom(next);
  }
  zoomInBtn.addEventListener("click", () => nudgeZoom(+1));
  zoomOutBtn.addEventListener("click", () => nudgeZoom(-1));

  // --- Era filter (shared by the timeline, the world map and the composers grid)
  function setEraFilter(era, opts = {}) {
    const normalized = era && ERA_ORDER.includes(era) ? era : null;
    currentEra = normalized;
    if (timeline) timeline.setFilter(normalized);
    if (worldMap) worldMap.setEra(normalized);
    if (browse) browse.setEra(normalized);
    highlightLegend(document.getElementById("legend"), normalized);
    updateBrandSub(normalized ? composers.filter(c => c.era === normalized) : composers, normalized);
    if (!opts.skipHash) writeHash();
  }

  // --- Routing. Hash forms: #/  #/timeline  #/map  #/composers, each with an optional
  //     ?era=Baroque (map also takes &b=1700). The old #era=Baroque form still works.
  function parseRoute() {
    const h = location.hash;
    const legacy = h.match(/^#era=([^&]+)/);
    if (legacy) return { view: "timeline", era: safeDecode(legacy[1]), bracket: undefined };
    const m = h.match(/^#\/([a-z]*)(?:\?(.*))?$/);
    if (!m) return { view: "home", era: null, bracket: undefined };
    const view = views[m[1]] ? m[1] : "home";
    const params = new URLSearchParams(m[2] || "");
    const b = params.get("b");
    return {
      view,
      era: params.get("era"),
      bracket: view === "map" ? (b && /^\d+$/.test(b) ? parseInt(b, 10) : null) : undefined,
    };
  }

  function writeHash() {
    const params = new URLSearchParams();
    if (currentView !== "home" && currentEra) params.set("era", currentEra);
    if (currentView === "map" && worldMap && worldMap.getBracket() != null) params.set("b", String(worldMap.getBracket()));
    const q = params.toString();
    const hash = currentView === "home" ? "#/" : `#/${currentView}${q ? "?" + q : ""}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  function showView(name, route) {
    const changed = name !== currentView;
    if (changed) {
      if (worldMap && currentView === "map") worldMap.stop();
      closeLightbox();
      closePanel();
    }
    currentView = name;
    Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
    document.body.dataset.view = name;
    document.title = name === "home" ? "Composer Atlas" : `${VIEW_TITLES[name]} · Composer Atlas`;
    document.querySelectorAll("#nav a").forEach(a => {
      const on = a.getAttribute("data-view") === name;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });

    if (name === "home") ensureHome();
    if (name === "timeline") ensureTimeline();
    if (name === "map") ensureWorldMap(route ? route.bracket : undefined);
    if (name === "composers") ensureBrowse();
    if (name === "map" && worldMap) requestAnimationFrame(() => worldMap.invalidateSize());
  }

  function applyRoute() {
    const route = parseRoute();
    const era = route.era && ERA_ORDER.includes(route.era) ? route.era : null;
    currentEra = era;
    showView(route.view, route);
    setEraFilter(era, { skipHash: true });
    writeHash();
  }

  window.addEventListener("hashchange", applyRoute);

  // --- Panel + Map
  const panelEl = document.getElementById("panel");
  const panelInner = document.getElementById("panel-inner");
  const closeBtn = document.getElementById("panel-close");

  panelInner.innerHTML = `
    <section class="map-section">
      <div class="map-controls" id="map-controls">
        <button class="layer-btn on" data-layer="birth"><span class="dot birth"></span>Birth</button>
        <button class="layer-btn on" data-layer="lived"><span class="dot lived"></span>Lived</button>
        <button class="layer-btn on" data-layer="death"><span class="dot death"></span>Death</button>
      </div>
      <div class="map-host" id="map-host"></div>
    </section>
    <div id="detail-target"></div>
  `;

  const mapHost = document.getElementById("map-host");
  const detailTarget = document.getElementById("detail-target");
  const mapApi = createMap(mapHost);

  document.querySelectorAll(".layer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const layer = btn.getAttribute("data-layer");
      const on = !btn.classList.contains("on");
      btn.classList.toggle("on", on);
      mapApi.setLayer(layer, on);
    });
  });

  closeBtn.addEventListener("click", () => closePanel());

  const expandBtn = document.getElementById("panel-expand");
  expandBtn.addEventListener("click", () => togglePanelExpanded());

  // --- Lightbox
  const lightbox = document.getElementById("lightbox");
  const lightboxContent = document.getElementById("lightbox-content");
  const lightboxClose = document.getElementById("lightbox-close");

  function openLightbox(composer) {
    lightboxContent.innerHTML = `
      <img id="lb-img" alt="${escapeAttr(composer.name)}" />
      <div class="lightbox-caption">
        <strong>${escapeHtml(composer.name)}</strong>
        ${composer.wiki ? ` · <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(composer.wiki.replace(/ /g, "_"))}" target="_blank" rel="noopener noreferrer">Wikipedia</a>` : ""}
      </div>
    `;
    const img = lightboxContent.querySelector("#lb-img");
    img.src = ""; // start blank
    lightbox.hidden = false;

    resolvePortraitUrl(composer).then(url => {
      if (lightbox.hidden) return;
      if (!url) {
        img.alt = `${composer.name} — no portrait available`;
        return;
      }
      // Try to swap to higher-res by stripping Wikipedia thumb prefix
      img.src = upgradeWikiThumb(url);
      img.onerror = () => { img.onerror = null; img.src = url; };
    });
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxContent.innerHTML = "";
  }
  lightbox.addEventListener("click", (e) => {
    // Close when clicking outside the content
    if (e.target === lightbox) closeLightbox();
  });
  lightboxClose.addEventListener("click", closeLightbox);

  // --- Keyboard
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!lightbox.hidden) { closeLightbox(); return; }
      if (panelEl.classList.contains("open")) closePanel();
    } else if (e.key === "+" || e.key === "=") {
      if (!isTypingTarget(e.target)) { e.preventDefault(); nudgeZoom(+1); }
    } else if (e.key === "-" || e.key === "_") {
      if (!isTypingTarget(e.target)) { e.preventDefault(); nudgeZoom(-1); }
    }
  });

  // Panel mode: "closed" | "peek" | "full"
  let panelMode = "closed";

  let collapseTimer = null;
  // Panel slide duration comes from the CSS (--panel-dur) so open and close always match
  const panelDurMs = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--panel-dur").trim();
    const n = parseFloat(v) || 0.9;
    return Math.round((v.endsWith("ms") ? n : n * 1000));
  };

  function openPanel(mode = panelMode === "closed" ? "peek" : panelMode) {
    clearTimeout(collapseTimer);
    panelMode = mode;
    panelEl.classList.add("open");
    panelEl.classList.toggle("expanded", mode === "full");
    panelEl.setAttribute("aria-hidden", "false");
    const expandBtnEl = document.getElementById("panel-expand");
    if (expandBtnEl) {
      const label = mode === "full" ? "Collapse to side peek" : "Expand to full page";
      expandBtnEl.setAttribute("aria-label", label);
      expandBtnEl.setAttribute("title", label);
    }
    const refit = () => { mapApi.invalidateSize(); if (worldMap) worldMap.invalidateSize(); };
    requestAnimationFrame(refit);
    setTimeout(refit, panelDurMs() + 20);
  }
  function closePanel() {
    panelMode = "closed";
    // Slide out first; only drop the full-page width once the slide has finished,
    // so a full-page panel doesn't visibly shrink while it leaves.
    panelEl.classList.remove("open");
    panelEl.setAttribute("aria-hidden", "true");
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      if (panelMode === "closed") panelEl.classList.remove("expanded");
    }, panelDurMs() + 40);
    if (timeline) timeline.clear();
    if (worldMap) setTimeout(() => worldMap.invalidateSize(), panelDurMs() + 20);
  }

  function togglePanelExpanded() {
    if (panelMode === "closed") return;
    openPanel(panelMode === "full" ? "peek" : "full");
  }

  function selectComposer(id) {
    const c = byId.get(id);
    if (!c) return;
    if (timeline) timeline.select(id);
    renderDetail(detailTarget, c, byId, {
      onConnectionClick: (nextId) => selectComposer(nextId),
      onPortraitClick: (comp) => openLightbox(comp),
    });
    mapApi.showComposer(c);
    openPanel();
    panelInner.scrollTop = 0;
  }

  renderEmpty(detailTarget);
  applyRoute();
}

function safeDecode(v) {
  try { return decodeURIComponent(v); } catch { return null; }
}

function isTypingTarget(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === "INPUT" || t === "TEXTAREA" || el.isContentEditable;
}

// Convert .../thumb/a/ab/Foo.jpg/300px-Foo.jpg → .../a/ab/Foo.jpg (higher res)
function upgradeWikiThumb(url) {
  if (!url) return url;
  const m = url.match(/^(https?:\/\/[^/]+\/wikipedia\/commons\/)thumb\/([^/]+\/[^/]+\/[^/]+)\/\d+px-[^/]+$/);
  if (m) return m[1] + m[2];
  return url;
}

function updateBrandSub(composers, era) {
  const el = document.getElementById("brand-sub");
  if (!el || !composers.length) return;
  const currentYear = new Date().getFullYear();
  const earliest = composers.reduce((m, c) => Math.min(m, c.born), Infinity);
  const latest = composers.reduce((m, c) => Math.max(m, c.died ?? currentYear), -Infinity);
  const span = latest - earliest;
  const rounded = Math.ceil(span / 50) * 50;
  const suffix = era ? ` · ${era}` : "";
  el.textContent = `${rounded} years of music, ${composers.length} lives${suffix}`;
}

function buildLegend(host, onSelect) {
  if (!host) return;
  const items = [
    `<button class="legend-item" data-era="" title="Show all eras">
       <span class="legend-swatch legend-swatch-all"></span>All
     </button>`,
    ...ERA_ORDER.map(era => `
      <button class="legend-item" data-era="${escapeAttr(era)}" title="Filter to ${escapeAttr(era)}">
        <span class="legend-swatch" style="background:${eraColor(era)}"></span>${era}
      </button>
    `),
  ];
  host.innerHTML = items.join("");
  host.querySelectorAll(".legend-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const era = btn.getAttribute("data-era") || null;
      onSelect(era);
    });
  });
}

function highlightLegend(host, era) {
  if (!host) return;
  host.querySelectorAll(".legend-item").forEach(btn => {
    btn.classList.toggle("active", (btn.getAttribute("data-era") || null) === (era || null));
  });
}

async function loadComposers() {
  const resp = await fetch("composers.json");
  if (!resp.ok) throw new Error(`Failed to load composers.json: ${resp.status}`);
  return await resp.json();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s) { return escapeHtml(s); }

main().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML("beforeend",
    `<pre style="color:#E04060;padding:20px;">${escapeHtml(err.stack || err.message)}</pre>`);
});
