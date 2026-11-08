// Detail card: portrait (click to lightbox), interactive life events,
// key works with Listen link, connections with explanatory notes.

import { eraColor } from "./timeline.js";
import { initialsFor, mountPortrait, fetchWikiSummary } from "./portraits.js";
import { loadOpenOpusWorks } from "./openopus.js";

export function renderDetail(targetEl, composer, allComposersById, callbacks = {}) {
  const onConnectionClick = callbacks.onConnectionClick || (() => {});
  const onPortraitClick = callbacks.onPortraitClick || (() => {});

  const color = eraColor(composer.era);
  const initials = initialsFor(composer.name);
  const lifeMin = composer.born;
  const lifeMax = composer.died ?? new Date().getFullYear();

  const works = (composer.keyWorks || [])
    .slice()
    .sort((a, b) => (parseYear(a.year) ?? Infinity) - (parseYear(b.year) ?? Infinity))
    .map(w => {
    const url = w.mediaUrl || youtubeSearch(composer.name, w.title);
    return `
      <li class="work">
        <div class="work-head">
          <span class="work-title">${escapeHtml(w.title)}</span>
          <span class="work-year">${escapeHtml(w.year)}</span>
          <a class="work-listen" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="Listen on ${w.mediaUrl ? "this link" : "YouTube"}">
            <span class="play-tri">▶</span>Listen
          </a>
        </div>
        <div class="work-context">${escapeHtml(w.context)}</div>
      </li>
    `;
  }).join("");

  const connections = (composer.relationships || [])
    .slice()
    .sort((a, b) => {
      const aId = typeof a === "string" ? a : a.id;
      const bId = typeof b === "string" ? b : b.id;
      const aBorn = allComposersById.get(aId)?.born ?? Infinity;
      const bBorn = allComposersById.get(bId)?.born ?? Infinity;
      return aBorn - bBorn;
    })
    .map(rel => {
    const rid = typeof rel === "string" ? rel : rel.id;
    const note = typeof rel === "string" ? "" : (rel.note || "");
    const c = allComposersById.get(rid);
    if (!c) return "";
    return `<button class="connection-card" data-id="${escapeAttr(rid)}">
      <div class="connection-card-head">
        <span class="chip-dot" style="background:${eraColor(c.era)};width:8px;height:8px;border-radius:50%;display:inline-block;flex:0 0 auto;"></span>
        <span class="connection-card-name">${escapeHtml(c.name)}</span>
        <span class="connection-card-years">${c.born}–${c.died ?? "—"}</span>
      </div>
      ${note ? `<div class="connection-card-note">${escapeHtml(note)}</div>` : ""}
    </button>`;
  }).join("");

  const contextItems = (composer.worldContext || []).map(t => `<li>${escapeHtml(t)}</li>`).join("");

  targetEl.innerHTML = `
    <div class="detail">
      <div class="detail-head">
        <div class="portrait" id="detail-portrait" data-composer-id="${escapeAttr(composer.id)}" style="background:${color}" title="Click to enlarge">
          <span class="initials">${escapeHtml(initials)}</span>
        </div>
        <div class="detail-meta">
          <h2>${escapeHtml(composer.name)}</h2>
          <div class="detail-years">${composer.born}&nbsp;–&nbsp;${composer.died ?? "present"}</div>
          <span class="era-badge" style="background:${color}">${escapeHtml(composer.era)}</span>
        </div>
        <aside class="detail-context-aside" aria-label="World context">
          <h3>World context</h3>
          <ul class="context-list">${contextItems}</ul>
        </aside>
      </div>

      <div class="section section-about">
        <aside class="about about-callout" style="--about-accent:${color}">
          <div class="about-label">About <span class="catalogue-src">via Wikipedia</span></div>
          <div class="about-body" id="about">
            <div class="catalogue-note">Loading…</div>
          </div>
        </aside>
      </div>

      <div class="section">
        <h3>Life &amp; works</h3>
        <div class="life-tl" id="life-tl"></div>
      </div>

      <div class="section">
        <h3>Key works</h3>
        <ul class="works-list">${works}</ul>
      </div>

      <div class="section section-catalogue">
        <h3>Works catalogue <span class="catalogue-src">via Open Opus</span></h3>
        <div class="catalogue" id="catalogue">
          <div class="catalogue-note">Loading from Open Opus…</div>
        </div>
      </div>

      <div class="section">
        <h3>Connections</h3>
        ${connections
          ? `<div class="connections">${connections}</div>`
          : `<div class="connections-empty">No documented personal connections to composers in this set.</div>`}
      </div>

      <div class="section section-world-context">
        <h3>World context</h3>
        <ul class="context-list">${contextItems}</ul>
      </div>
    </div>
  `;

  // Lazy-load portrait (Wikipedia thumbnail fallback)
  const portraitEl = targetEl.querySelector("#detail-portrait");
  mountPortrait(portraitEl, composer);
  portraitEl.addEventListener("click", () => onPortraitClick(composer));

  // Short biography from Wikipedia (async; the section removes itself if there's nothing to show)
  mountAbout(targetEl.querySelector("#about"), composer);

  // Full works catalogue from Open Opus (async; the curated key works above stay as-is)
  mountCatalogue(targetEl.querySelector("#catalogue"), composer);

  // Life events + key works on a shared timeline
  drawTimeline(targetEl.querySelector("#life-tl"), composer.lifeEvents || [], composer.keyWorks || [], lifeMin, lifeMax, color);

  // Connection cards
  targetEl.querySelectorAll(".connection-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      onConnectionClick(id);
    });
  });
}

export function renderEmpty(targetEl) {
  targetEl.innerHTML = `<div class="empty">Select a composer in the timeline to begin.</div>`;
}

// ---- About (Wikipedia) ---------------------------------------------------------

async function mountAbout(host, composer) {
  if (!host) return;
  const data = await fetchWikiSummary(composer);
  if (!host.isConnected) return;   // the panel moved on to another composer

  const text = data && data.type !== "disambiguation" ? String(data.extract || "").trim() : "";
  if (!text) {
    // Nothing useful (no article, offline, disambiguation page): drop the section quietly.
    const section = host.closest(".section");
    if (section) section.remove();
    return;
  }

  const fallbackUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(String(composer.wiki).replace(/ /g, "_"))}`;
  const pageUrl = String(data.content_urls?.desktop?.page || "").startsWith("https://")
    ? data.content_urls.desktop.page
    : fallbackUrl;
  const isLong = text.length > 520;   // short intros (the usual case) show in full

  host.innerHTML = `
    <p class="about-text${isLong ? " clamp" : ""}">${escapeHtml(text)}</p>
    ${isLong ? `<button type="button" class="about-toggle" aria-expanded="false">Read more</button>` : ""}
    <div class="catalogue-foot">
      From <a href="${escapeAttr(pageUrl)}" target="_blank" rel="noopener noreferrer">Wikipedia</a>
      (<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>)
      · <a href="${escapeAttr(pageUrl)}" target="_blank" rel="noopener noreferrer">Read the full article</a>
    </div>
  `;

  const toggle = host.querySelector(".about-toggle");
  if (toggle) {
    const para = host.querySelector(".about-text");
    toggle.addEventListener("click", () => {
      const open = para.classList.toggle("clamp") === false;
      toggle.textContent = open ? "Show less" : "Read more";
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
}

// ---- Works catalogue (Open Opus) ---------------------------------------------

const CATALOGUE_GENRE_ORDER = ["Keyboard", "Orchestral", "Chamber", "Vocal", "Stage"];

async function mountCatalogue(host, composer) {
  if (!host) return;
  const result = await loadOpenOpusWorks(composer);
  // The panel re-renders on every selection; if this host was replaced while the
  // request was in flight, the user has moved on and there is nothing to update.
  if (!host.isConnected) return;
  renderCatalogue(host, composer, result);
}

function renderCatalogue(host, composer, result) {
  if (result.state === "missing") {
    host.innerHTML = `<div class="catalogue-note">${escapeHtml(composer.name)} isn't in the Open Opus catalogue (it focuses on the mainstream concert repertoire), so only the key works above are shown.</div>`;
    return;
  }

  if (result.state === "error") {
    host.innerHTML = `<div class="catalogue-note">Couldn't reach Open Opus right now. <button type="button" class="catalogue-retry">Try again</button></div>`;
    host.querySelector(".catalogue-retry").addEventListener("click", () => {
      host.innerHTML = `<div class="catalogue-note">Loading from Open Opus…</div>`;
      mountCatalogue(host, composer);
    });
    return;
  }

  const works = result.works;
  if (!works.length) {
    host.innerHTML = `<div class="catalogue-note">Open Opus lists no works for ${escapeHtml(composer.name)} yet.</div>`;
    return;
  }

  const recommendedCount = works.filter(w => w.recommended).length;
  let mode = recommendedCount > 0 ? "recommended" : "all";

  function draw() {
    const shown = mode === "recommended" ? works.filter(w => w.recommended) : works;

    const byGenre = new Map();
    shown.forEach(w => {
      const g = w.genre || "Other";
      if (!byGenre.has(g)) byGenre.set(g, []);
      byGenre.get(g).push(w);
    });
    const genres = [...byGenre.keys()].sort((a, b) => {
      const ia = CATALOGUE_GENRE_ORDER.indexOf(a);
      const ib = CATALOGUE_GENRE_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });

    // Short lists start fully open; long ones open only the first group, so the
    // panel isn't a wall of 900 titles or a column of collapsed headers.
    const openAll = shown.length <= 40;
    const groups = genres.map((g, gi) => {
      const items = byGenre.get(g).map(w => `
        <li class="catalogue-work">
          <span class="catalogue-title">${escapeHtml(w.title)}${w.subtitle ? ` <span class="catalogue-sub">${escapeHtml(w.subtitle)}</span>` : ""}</span>
          <a class="work-listen" href="${escapeAttr(youtubeSearch(composer.name, w.title))}" target="_blank" rel="noopener noreferrer" title="Search YouTube for this work">
            <span class="play-tri">▶</span>Listen
          </a>
        </li>`).join("");
      return `
        <details class="catalogue-group"${openAll || gi === 0 ? " open" : ""}>
          <summary><span class="catalogue-genre">${escapeHtml(g)}</span><span class="catalogue-count">${byGenre.get(g).length}</span></summary>
          <ul class="catalogue-list">${items}</ul>
        </details>`;
    }).join("");

    const filterBtn = (m, label, count) =>
      `<button type="button" class="catalogue-filter${mode === m ? " on" : ""}" data-mode="${m}">${label} <span class="catalogue-count">${count}</span></button>`;

    host.innerHTML = `
      <div class="catalogue-filters">
        ${recommendedCount > 0 ? filterBtn("recommended", "Recommended", recommendedCount) : ""}
        ${filterBtn("all", "All works", works.length)}
      </div>
      ${groups}
      <div class="catalogue-foot">Works data from <a href="https://openopus.org" target="_blank" rel="noopener noreferrer">Open Opus</a> (open data). “Listen” searches YouTube.</div>
    `;

    host.querySelectorAll(".catalogue-filter").forEach(btn => {
      btn.addEventListener("click", () => {
        mode = btn.getAttribute("data-mode");
        draw();
      });
    });
  }

  draw();
}

function youtubeSearch(composerName, workTitle) {
  const q = `${composerName} ${workTitle}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

function parseYear(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/\d{3,4}/);
  return m ? parseInt(m[0], 10) : null;
}

function drawTimeline(host, lifeEvents, keyWorks, minYear, maxYear, accent) {
  if (!host) return;

  const events = (lifeEvents || []).map(e => ({
    kind: "event",
    year: e.year,
    yearRaw: String(e.year),
    primary: e.event,
    secondary: "",
  }));

  const works = (keyWorks || []).map(w => {
    const y = parseYear(w.year);
    if (y == null) return null;
    return {
      kind: "work",
      year: y,
      yearRaw: String(w.year),
      primary: w.title,
      secondary: w.context || "",
    };
  }).filter(Boolean);

  if (!events.length && !works.length) {
    host.innerHTML = `<div style="color:var(--text-faint);font-size:12px;">No timeline data.</div>`;
    return;
  }

  const span = Math.max(1, maxYear - minYear);
  const margin = { l: 54, r: 8, top: 14, bottom: 8 };
  const eventsY = 22;
  const worksY = 52;
  const height = 76;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("preserveAspectRatio", "none");
  host.appendChild(svg);

  function render() {
    const w = host.clientWidth || 320;
    const innerW = Math.max(40, w - margin.l - margin.r);
    svg.setAttribute("width", w);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${w} ${height}`);
    svg.innerHTML = "";

    // Two baselines
    [eventsY, worksY].forEach(y => {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", margin.l);
      line.setAttribute("x2", margin.l + innerW);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "#3a3a3a");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
    });

    // Row labels on the left
    function rowLabel(text, y) {
      const t = document.createElementNS(svgNS, "text");
      t.textContent = text;
      t.setAttribute("x", margin.l - 8);
      t.setAttribute("y", y + 3);
      t.setAttribute("fill", "#9a9690");
      t.setAttribute("font-size", "10");
      t.setAttribute("font-weight", "600");
      t.setAttribute("text-anchor", "end");
      t.setAttribute("letter-spacing", "0.8");
      svg.appendChild(t);
    }
    rowLabel("LIFE", eventsY);
    rowLabel("WORKS", worksY);

    // Endpoint year labels above the events row
    const yLabelY = margin.top - 2;
    const tStart = document.createElementNS(svgNS, "text");
    tStart.textContent = minYear;
    tStart.setAttribute("x", margin.l);
    tStart.setAttribute("y", yLabelY);
    tStart.setAttribute("fill", "#9a9690");
    tStart.setAttribute("font-size", "10.5");
    svg.appendChild(tStart);

    const tEnd = document.createElementNS(svgNS, "text");
    tEnd.textContent = maxYear;
    tEnd.setAttribute("x", margin.l + innerW);
    tEnd.setAttribute("y", yLabelY);
    tEnd.setAttribute("fill", "#9a9690");
    tEnd.setAttribute("font-size", "10.5");
    tEnd.setAttribute("text-anchor", "end");
    svg.appendChild(tEnd);

    function addDot(item, y, filled) {
      const x = margin.l + ((item.year - minYear) / span) * innerW;
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("class", "life-dot");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", 4.5);
      if (filled) {
        dot.setAttribute("fill", accent);
        dot.setAttribute("stroke", "#0c0c0c");
        dot.setAttribute("stroke-width", "1");
      } else {
        dot.setAttribute("fill", "#1a1a1a");
        dot.setAttribute("stroke", accent);
        dot.setAttribute("stroke-width", "2");
      }
      svg.appendChild(dot);

      const title = document.createElementNS(svgNS, "title");
      title.textContent = `${item.yearRaw} — ${item.primary}`;
      dot.appendChild(title);

      dot.addEventListener("mouseenter", () => showLifePopover(host, item, x, y));
      dot.addEventListener("mouseleave", () => hideLifePopover(host));
      dot.addEventListener("focus", () => showLifePopover(host, item, x, y));
      dot.addEventListener("blur", () => hideLifePopover(host));
      dot.setAttribute("tabindex", "0");
    }

    events.forEach(e => addDot(e, eventsY, true));
    works.forEach(w => addDot(w, worksY, false));
  }

  render();
  const ro = new ResizeObserver(() => render());
  ro.observe(host);
}

function showLifePopover(host, item, x, y) {
  hideLifePopover(host);
  const pop = document.createElement("div");
  pop.className = "life-popover";
  const kindLabel = item.kind === "work" ? "Key work" : "Life event";
  pop.innerHTML = `
    <div class="life-popover-year">${escapeHtml(item.yearRaw)} · ${escapeHtml(kindLabel)}</div>
    <div class="life-popover-text"><strong>${escapeHtml(item.primary)}</strong></div>
    ${item.secondary ? `<div class="life-popover-secondary">${escapeHtml(item.secondary)}</div>` : ""}
  `;
  // Set y first; x is computed after we know the popover's rendered width.
  pop.style.top = `${y}px`;
  host.appendChild(pop);

  // Popover has an explicit CSS width, so its rendered width is stable regardless
  // of where inside the host we place it. Center on x, then clamp inside the host.
  const popW = pop.getBoundingClientRect().width;
  const hostW = host.clientWidth;
  const gap = 6;
  let left = x - popW / 2;
  if (left + popW > hostW - gap) left = hostW - popW - gap;
  if (left < gap) left = gap;
  pop.style.left = `${left}px`;
}
function hideLifePopover(host) {
  host.querySelectorAll(".life-popover").forEach(p => p.remove());
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s) { return escapeHtml(s); }
