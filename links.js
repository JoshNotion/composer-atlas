// Connections view: every documented composer-to-composer link on one vertical, time-ordered page.
// Older composers sit higher, younger ones lower; a left ribbon shows the classical periods.
// Quiet by default (a faint web); click a composer to follow just their connections.

import { eraColor } from "./timeline.js";
import { initialsFor, mountPortrait } from "./portraits.js";

const LK_ERAS = [
  { name: "Medieval", blurb: "Plainchant, troubadours and the first polyphony" },
  { name: "Renaissance", blurb: "Vocal polyphony, the madrigal and the printed score" },
  { name: "Baroque", blurb: "Counterpoint, ornament and the birth of opera" },
  { name: "Classical", blurb: "Balance, clarity and the sonata" },
  { name: "Romantic", blurb: "Feeling, nation and the virtuoso" },
  { name: "Modern", blurb: "Tonality stretched, broken and rebuilt" },
  { name: "Contemporary", blurb: "Minimalism, electronics and a global stage" },
];
const LK_RIBBON_W = 224;
const LK_NODE_W = 108;
const LK_NODE_H = 104;
const LK_PORTRAIT = 56;

function lkNorm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function lkEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function createLinks(hostEl, composers, opts = {}) {
  const byId = new Map(composers.map(c => [c.id, c]));
  // pin = the composer whose connections are locked in (set by a click, cleared by clicking empty space)
  const state = { era: null, pin: null };
  const current = () => state.pin;

  // ---- Graph: one undirected edge per pair, drawn from the older composer to the younger ----
  const edgeMap = new Map();
  const adj = new Map();
  const older = (x, y) => x.born < y.born || (x.born === y.born && x.id < y.id);

  composers.forEach(c => (c.relationships || []).forEach(rel => {
    const rid = typeof rel === "string" ? rel : rel.id;
    const note = typeof rel === "string" ? "" : (rel.note || "");
    const o = byId.get(rid);
    if (!o || o === c) return;
    const [a, b] = older(c, o) ? [c, o] : [o, c];
    const key = a.id + "|" + b.id;
    let e = edgeMap.get(key);
    if (!e) { e = { a: a.id, b: b.id, notes: [], by: {} }; edgeMap.set(key, e); }
    if (note && !e.notes.includes(note)) e.notes.push(note);
    if (note && !e.by[c.id]) e.by[c.id] = note;
    if (!adj.has(a.id)) adj.set(a.id, new Set());
    if (!adj.has(b.id)) adj.set(b.id, new Set());
    adj.get(a.id).add(b.id);
    adj.get(b.id).add(a.id);
  }));
  const edges = [...edgeMap.values()];
  const lkEraIdx = (c) => Math.max(0, LK_ERAS.findIndex(e => e.name === c.era));
  const linked = composers
    .filter(c => adj.has(c.id))
    .sort((x, y) => lkEraIdx(x) - lkEraIdx(y) || x.born - y.born || x.name.localeCompare(y.name));

  hostEl.innerHTML = `
    <div class="lk-toolbar">
      <div class="lk-toolbar-inner">
        <label class="browse-search-wrap lk-search-wrap">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
          <input class="browse-search" id="lk-search" type="search" placeholder="Find a composer" autocomplete="off" aria-label="Find a composer" />
          <div class="lk-suggest" id="lk-suggest" hidden></div>
        </label>
        <button class="wm-focus-chip" id="lk-focus" type="button" hidden></button>
        <span class="lk-count" id="lk-count"></span>
        <span class="lk-hint" id="lk-hint">Click a composer to see their connections</span>
      </div>
    </div>
    <div class="lk-inner" id="lk-inner"></div>
  `;
  const innerEl = hostEl.querySelector("#lk-inner");
  const searchEl = hostEl.querySelector("#lk-search");
  const suggestEl = hostEl.querySelector("#lk-suggest");
  const focusEl = hostEl.querySelector("#lk-focus");
  const countEl = hostEl.querySelector("#lk-count");
  const hintEl = hostEl.querySelector("#lk-hint");

  const observer = typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          observer.unobserve(en.target);
          mountNode(en.target.dataset.composerId);
        });
      }, { root: hostEl, rootMargin: "400px" })
    : null;

  // Portraits: the ones near the viewport load first (IntersectionObserver); a throttled
  // background pass then fetches the rest, so scrolling or jumping to a far-away composer
  // finds the images already there. A second pass retries any that were rate-limited.
  let mounted = new Set();
  let preloadToken = 0;
  function mountNode(id) {
    if (mounted.has(id)) return Promise.resolve();
    const el = nodeEls.get(id);
    const c = byId.get(id);
    if (!el || !c) return Promise.resolve();
    mounted.add(id);
    return mountPortrait(el.querySelector(".lk-portrait"), c);
  }
  async function preload() {
    const token = ++preloadToken;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    for (let pass = 0; pass < 2; pass++) {
      const ids = [...nodeEls.keys()].filter(id => {
        const el = nodeEls.get(id).querySelector(".lk-portrait");
        return !el.classList.contains("has-img") && byId.get(id).wiki !== undefined && !(pass === 0 && mounted.has(id));
      });
      const top = hostEl.scrollTop;
      ids.sort((a, b) => Math.abs(layout.pos.get(a).y - top) - Math.abs(layout.pos.get(b).y - top));
      let next = 0;
      const worker = async () => {
        while (token === preloadToken && next < ids.length) {
          const id = ids[next++];
          if (pass === 1) mounted.delete(id);
          await mountNode(id);
          await sleep(60);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (token !== preloadToken) return;
      await sleep(1500);
    }
  }

  let layout = null;
  let layoutW = 0;
  let nodeEls = new Map();
  let edgeEls = [];
  let tipEl = null;

  // ---- Layout: y follows birth year (compressed where it's sparse), x is chosen lane by lane
  //      so a composer lands near the people they're connected to, with a gentle west-to-east
  //      bias from their birthplace. ----
  function computeLayout(W) {
    const x0 = LK_RIBBON_W + 28;
    const usable = Math.max(760, W - x0 - 32);
    const lanes = Math.max(6, Math.floor(usable / LK_NODE_W));
    const step = usable / lanes;
    const laneX = i => x0 + step * (i + 0.5);
    const rowInc = ((LK_NODE_H + 8) / lanes) * 1.06;
    const pos = new Map();
    const placed = [];
    let y = 96;
    let prevBorn = linked[0].born;
    let curEra = -1;
    let maxY = 0;
    const bandTops = new Map();

    linked.forEach(c => {
      const ei = lkEraIdx(c);
      if (ei !== curEra) {
        // each period starts on a clean row below the previous one
        const top = curEra === -1 ? 0 : maxY + LK_NODE_H + 18;
        bandTops.set(ei, top);
        y = Math.max(y, top + 78);
        prevBorn = c.born;
        curEra = ei;
      }
      y += Math.min(60, Math.max(0, c.born - prevBorn)) * 0.45 + rowInc;
      prevBorn = c.born;
      const lng = c.birthPlace && c.birthPlace.lng != null ? c.birthPlace.lng : 10;
      const geo = Math.max(0, Math.min(1, (lng + 25) / 80));
      const geoX = x0 + usable * (0.06 + 0.88 * geo);
      const parents = [...adj.get(c.id)].filter(id => pos.has(id)).map(id => pos.get(id));

      let yy = y;
      for (let tries = 0; tries < 600; tries++, yy += 8) {
        let best = -1;
        let bestCost = Infinity;
        for (let l = 0; l < lanes; l++) {
          const x = laneX(l);
          let blocked = false;
          for (let k = placed.length - 1; k >= 0; k--) {
            const p = placed[k];
            if (yy - p.y >= LK_NODE_H) break; // placed is y-sorted ascending
            if (Math.abs(p.x - x) < LK_NODE_W - 1) { blocked = true; break; }
          }
          if (blocked) continue;
          let cost = 0.35 * Math.abs(x - geoX);
          parents.forEach(p => { cost += Math.abs(x - p.x); });
          if (cost < bestCost) { bestCost = cost; best = l; }
        }
        if (best >= 0) {
          const p = { id: c.id, x: laneX(best), y: yy };
          pos.set(c.id, p);
          placed.push(p);
          y = Math.max(y, yy);
          maxY = Math.max(maxY, yy);
          break;
        }
      }
    });

    const height = Math.max(...placed.map(p => p.y)) + LK_NODE_H + 80;

    // Era bands: each period owns the rows between its start and the next period's start.
    const bands = [];
    LK_ERAS.forEach((e, i) => {
      if (!bandTops.has(i)) return;
      bands.push({ era: e, top: bandTops.get(i), bottom: height });
    });
    bands.forEach((b, i) => { b.bottom = i + 1 < bands.length ? bands[i + 1].top : height; });

    // year -> y by interpolating along the (monotone) birth-year ladder
    const ladder = [];
    let runMax = -Infinity;
    linked.slice().sort((x, y) => x.born - y.born || pos.get(x.id).y - pos.get(y.id).y).forEach(c => {
      const yv = Math.max(runMax, pos.get(c.id).y);
      runMax = yv;
      const last = ladder[ladder.length - 1];
      if (last && last.year === c.born) last.y = (last.y + yv) / 2;
      else ladder.push({ year: c.born, y: yv });
    });
    const yAt = (year) => {
      if (year <= ladder[0].year) return ladder[0].y;
      const lastL = ladder[ladder.length - 1];
      if (year >= lastL.year) return lastL.y;
      for (let i = 1; i < ladder.length; i++) {
        if (year <= ladder[i].year) {
          const a = ladder[i - 1];
          const b = ladder[i];
          return a.y + (b.y - a.y) * ((year - a.year) / (b.year - a.year));
        }
      }
      return lastL.y;
    };

    return { pos, height, bands, yAt, first: ladder[0].year, last: ladder[ladder.length - 1].year };
  }

  // ---- Rendering ----
  function render() {
    const W = Math.max(960, hostEl.clientWidth || window.innerWidth);
    layoutW = W;
    layout = computeLayout(W);
    const { pos, height, bands, yAt } = layout;
    if (observer) observer.disconnect();
    nodeEls = new Map();
    edgeEls = [];
    mounted = new Set();

    innerEl.style.width = W + "px";
    innerEl.style.height = height + "px";

    const tints = bands.map(b => `
      <div class="lk-tint" style="top:${b.top}px;height:${b.bottom - b.top}px;--era:${eraColor(b.era.name)}"></div>`).join("");

    const ribbonBands = bands.map(b => {
      const years = linked.filter(c => c.era === b.era.name);
      const lo = years.length ? Math.min(...years.map(c => c.born)) : "";
      const hi = years.length ? Math.max(...years.map(c => c.born)) : "";
      return `
      <div class="lk-rband" style="top:${b.top}px;height:${b.bottom - b.top}px;--era:${eraColor(b.era.name)}">
        <div class="lk-rlabel">
          <span class="lk-rname">${lkEsc(b.era.name)}</span>
          <span class="lk-ryears">b. ${lo}–${hi}</span>
          <span class="lk-rblurb">${lkEsc(b.era.blurb)}</span>
        </div>
      </div>`;
    }).join("");

    let ticks = "";
    for (let yr = Math.ceil(layout.first / 50) * 50; yr <= layout.last; yr += 50) {
      ticks += `<div class="lk-tick" style="top:${Math.round(yAt(yr))}px"><span>${yr}</span></div>`;
    }

    innerEl.innerHTML = `
      ${tints}
      <div class="lk-ribbon" style="height:${height}px;margin-bottom:-${height}px">
        <div class="lk-spine"></div>
        ${ribbonBands}
        ${ticks}
      </div>
      <svg class="lk-edges" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" aria-hidden="true"></svg>
      <div class="lk-nodes"></div>
      <div class="lk-tip" hidden></div>
    `;
    const svg = innerEl.querySelector(".lk-edges");
    const nodesEl = innerEl.querySelector(".lk-nodes");
    tipEl = innerEl.querySelector(".lk-tip");
    const NS = "http://www.w3.org/2000/svg";
    const cy = LK_PORTRAIT / 2;

    edges.forEach(e => {
      const pa = pos.get(e.a);
      const pb = pos.get(e.b);
      if (!pa || !pb) return;
      const ya = pa.y + cy;
      const yb = pb.y + cy;
      let d;
      let mid;
      if (yb - ya < 36) {
        const mx = (pa.x + pb.x) / 2;
        d = `M${pa.x},${ya} Q${mx},${Math.min(ya, yb) - 46} ${pb.x},${yb}`;
        mid = { x: mx, y: (ya + 2 * (Math.min(ya, yb) - 46) + yb) / 4 };
      } else {
        const ym = ya + (yb - ya) * 0.55;
        d = `M${pa.x},${ya} C${pa.x},${ym} ${pb.x},${ym} ${pb.x},${yb}`;
        mid = { x: (pa.x + pb.x) / 2, y: (ya + yb + 6 * ym) / 8 };
      }
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "lk-edge");
      path.setAttribute("stroke", eraColor(byId.get(e.a).era));
      svg.appendChild(path);
      edgeEls.push({ el: path, e, mid });
    });

    linked.forEach(c => {
      const p = pos.get(c.id);
      if (!p) return;
      const btn = document.createElement("div");
      btn.setAttribute("role", "button");
      btn.tabIndex = 0;
      btn.className = "lk-node";
      btn.dataset.id = c.id;
      btn.style.left = (p.x - LK_NODE_W / 2) + "px";
      btn.style.top = p.y + "px";
      btn.style.setProperty("--era", eraColor(c.era));
      btn.innerHTML = `
        <span class="lk-pwrap">
          <span class="lk-portrait" data-composer-id="${lkEsc(c.id)}"><span class="initials">${lkEsc(initialsFor(c.name))}</span></span>
          <button type="button" class="lk-open" title="Open ${lkEsc(c.name)} in full" aria-label="Open ${lkEsc(c.name)} in full"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"></path></svg></button>
        </span>
        <span class="lk-name">${lkEsc(c.name)}</span>
        <span class="lk-years">${c.born}–${c.died ?? ""}</span>`;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (ev.target.closest(".lk-open")) { if (opts.onSelect) opts.onSelect(c.id); return; }
        pin(c.id);
      });
      btn.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pin(c.id); }
      });
      btn.addEventListener("mouseenter", () => showTip(c.id));
      btn.addEventListener("mouseleave", hideTip);
      btn.addEventListener("focus", () => showTip(c.id));
      btn.addEventListener("blur", hideTip);
      nodesEl.appendChild(btn);
      nodeEls.set(c.id, btn);
      const portrait = btn.querySelector(".lk-portrait");
      if (observer) observer.observe(portrait);
    });

    applyState();
    setTimeout(preload, 400);
  }

  // ---- Focus + dimming ----
  function applyState() {
    const f = current();
    const nb = f ? (adj.get(f) || new Set()) : null;
    nodeEls.forEach((el, id) => {
      const c = byId.get(id);
      const inEra = !state.era || c.era === state.era;
      const related = f && (id === f || nb.has(id));
      el.classList.toggle("lk-dim", f ? !related : !inEra);
      el.classList.toggle("lk-focus", id === f);
      el.classList.toggle("lk-nb", !!(f && nb.has(id)));
    });
    edgeEls.forEach(({ el, e }) => {
      const on = !!(f && (e.a === f || e.b === f));
      let off = false;
      if (f) off = !on;
      else if (state.era) off = !(byId.get(e.a).era === state.era && byId.get(e.b).era === state.era);
      el.classList.toggle("lk-edge-on", on);
      el.classList.toggle("lk-edge-off", off);
    });
    hostEl.classList.toggle("lk-focused", !!f);

    if (state.pin) {
      const c = byId.get(state.pin);
      focusEl.hidden = false;
      focusEl.innerHTML = `<span class="wm-focus-dot" style="background:${eraColor(c.era)}"></span><span>Showing <strong>${lkEsc(c.name)}</strong></span><span class="wm-focus-hint">click empty space to clear</span><span class="wm-focus-x">&times;</span>`;
    } else {
      focusEl.hidden = true;
    }
    if (f) {
      countEl.textContent = `${nb.size} connection${nb.size === 1 ? "" : "s"}`;
      hintEl.hidden = true;
    } else {
      countEl.textContent = `${linked.length} composers · ${edges.length} connections`;
      hintEl.hidden = false;
    }
    hideTip();
  }

  function relationText(from, to) {
    const x = byId.get(from);
    const y = byId.get(to);
    if (!x || !y) return "";
    const e = edgeMap.get(older(x, y) ? from + "|" + to : to + "|" + from);
    if (!e) return "";
    // Prefer the note written on the hovered composer's own record, else the other side's.
    return e.by[from] || e.by[to] || e.notes[0] || "";
  }

  // With a composer locked in, pointing at one of their connections shows how the two are related.
  const LK_TIP_W = 272;
  function showTip(id) {
    const f = state.pin;
    if (!f || id === f || !adj.get(f).has(id) || !tipEl) return;
    const other = byId.get(id);
    const me = byId.get(f);
    const note = relationText(f, id) || `Connected with ${me.name}.`;
    const p = layout.pos.get(id);
    tipEl.style.setProperty("--era", eraColor(other.era));
    tipEl.innerHTML = `<strong>${lkEsc(other.name)}</strong><em>with ${lkEsc(me.name)}</em><span>${lkEsc(note)}</span>`;
    tipEl.hidden = false;
    const right = p.x + LK_NODE_W / 2 + LK_TIP_W + 14 < layoutW;
    let x = right ? p.x + LK_NODE_W / 2 - 2 : p.x - LK_NODE_W / 2 - LK_TIP_W + 2;
    x = Math.max(LK_RIBBON_W + 8, x);
    tipEl.style.width = LK_TIP_W + "px";
    tipEl.style.left = x + "px";
    // Keep the whole card on screen: slide it up if the person sits near the bottom edge.
    const h = tipEl.offsetHeight;
    const bottom = hostEl.scrollTop + hostEl.clientHeight - 14;
    let y = p.y - 4;
    if (y + h > bottom) y = Math.max(hostEl.scrollTop + 96, bottom - h);
    tipEl.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  function scrollToFocus() {
    const f = state.pin;
    if (!f || !layout) return;
    const ids = [f, ...(adj.get(f) || [])];
    const pts = ids.map(id => layout.pos.get(id)).filter(Boolean);
    if (!pts.length) return;
    const ys = pts.map(p => p.y);
    const xs = pts.map(p => p.x);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + LK_NODE_H;
    const viewH = hostEl.clientHeight - 90;
    const fp = layout.pos.get(f);
    // Already all on screen? Then leave the page where it is.
    const st = hostEl.scrollTop;
    const sl = hostEl.scrollLeft;
    const onScreen = pts.every(p => p.y > st + 96 && p.y + LK_NODE_H < st + hostEl.clientHeight - 16 && p.x - LK_NODE_W / 2 > sl && p.x + LK_NODE_W / 2 < sl + hostEl.clientWidth);
    if (onScreen) return;
    let top;
    if (maxY - minY < viewH) top = (minY + maxY) / 2 - hostEl.clientHeight / 2 + 40;
    else top = fp.y - Math.min(220, viewH / 2);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const left = Math.max(0, Math.min(hostEl.scrollWidth - hostEl.clientWidth, cx - hostEl.clientWidth / 2));
    hostEl.scrollTo({ top: Math.max(0, top), left, behavior: "smooth" });
  }

  // pin(id): hold a composer's connections in view. `scroll` brings them on screen
  // (used by search and the card's rows, not by clicking a node that's already visible).
  function pin(id, scroll) {
    if (!adj.has(id)) { clearFocus(); return; }
    state.pin = id;
    applyState();
    if (scroll) scrollToFocus();
  }

  function clearFocus() {
    if (!state.pin) return;
    state.pin = null;
    applyState();
  }

  focusEl.addEventListener("click", clearFocus);
  innerEl.addEventListener("click", (e) => { if (!e.target.closest(".lk-node")) clearFocus(); });

  // ---- Search ----
  function suggestions(q) {
    const n = lkNorm(q).trim();
    if (!n) return [];
    const starts = [];
    const has = [];
    linked.forEach(c => {
      const name = lkNorm(c.name);
      if (name.startsWith(n) || name.split(" ").some(w => w.startsWith(n))) starts.push(c);
      else if (name.includes(n)) has.push(c);
    });
    return [...starts, ...has].slice(0, 7);
  }

  function pick(id) {
    suggestEl.hidden = true;
    searchEl.value = "";
    searchEl.blur();
    pin(id, true);
  }

  searchEl.addEventListener("input", () => {
    const list = suggestions(searchEl.value);
    if (!list.length) {
      suggestEl.hidden = !searchEl.value.trim();
      suggestEl.innerHTML = searchEl.value.trim() ? `<div class="lk-suggest-empty">No composer with documented connections</div>` : "";
      return;
    }
    suggestEl.hidden = false;
    suggestEl.innerHTML = list.map(c => `
      <button type="button" class="lk-suggest-item" data-id="${lkEsc(c.id)}">
        <span class="chip-dot" style="background:${eraColor(c.era)}"></span>
        <span>${lkEsc(c.name)}</span>
        <span class="lk-suggest-years">${c.born}–${c.died ?? ""}</span>
      </button>`).join("");
  });
  suggestEl.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".lk-suggest-item");
    if (item) { e.preventDefault(); pick(item.dataset.id); }
  });
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = suggestions(searchEl.value)[0];
      if (first) pick(first.id);
    } else if (e.key === "Escape") {
      suggestEl.hidden = true;
      searchEl.value = "";
    }
  });
  searchEl.addEventListener("blur", () => { suggestEl.hidden = true; });

  // ---- Re-layout when the window width changes meaningfully ----
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (hostEl.hidden) return;
      const w = Math.max(960, hostEl.clientWidth || 0);
      if (Math.abs(w - layoutW) > 120) { render(); if (state.pin) scrollToFocus(); }
    }, 250);
  });

  render();

  return {
    setEra(era) {
      state.era = era || null;
      applyState();
    },
    focus: (id) => pin(id, true),
    clearFocus,
    getFocus: () => state.pin,
    hasLinks: (id) => adj.has(id),
    // The view is built while visible, but a hidden build (or a width change) needs a fresh layout.
    refresh() {
      if (hostEl.hidden) return;
      const w = Math.max(960, hostEl.clientWidth || 0);
      if (Math.abs(w - layoutW) > 40) render();
    },
  };
}
