// Detail card: portrait (click to lightbox), interactive life events,
// key works with Listen link, connections with explanatory notes.

import { eraColor } from "./timeline.js";
import { initialsFor, mountPortrait } from "./portraits.js";

export function renderDetail(targetEl, composer, allComposersById, callbacks = {}) {
  const onConnectionClick = callbacks.onConnectionClick || (() => {});
  const onPortraitClick = callbacks.onPortraitClick || (() => {});

  const color = eraColor(composer.era);
  const initials = initialsFor(composer.name);
  const lifeMin = composer.born;
  const lifeMax = composer.died ?? new Date().getFullYear();

  const works = (composer.keyWorks || []).map(w => {
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

  const connections = (composer.relationships || []).map(rel => {
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

      <div class="section">
        <h3>Life &amp; works</h3>
        <div class="life-tl" id="life-tl"></div>
      </div>

      <div class="section">
        <h3>Key works</h3>
        <ul class="works-list">${works}</ul>
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
