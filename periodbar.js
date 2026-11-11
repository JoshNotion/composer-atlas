// Period bar for the Timeline tab: the same ribbon + 50-year buttons the World map uses.
// Clicking a button (or a period) zooms the timeline to those years; the buttons for the
// years currently on screen are outlined, and a selected composer's life is lit up.

import { eraColor } from "./timeline.js";
import { WM_PERIODS, WM_FIRST_BRACKET, WM_LAST_BRACKET, WM_STEP, wmPeriodGradient } from "./worldmap.js";

export function createPeriodBar(hostEl, opts = {}) {
  const countFor = opts.countFor || (() => 0);
  const onPick = opts.onPick || (() => {});
  const currentYear = new Date().getFullYear();
  const span = WM_LAST_BRACKET + WM_STEP - WM_FIRST_BRACKET;
  const brackets = [];
  for (let b = WM_FIRST_BRACKET; b <= WM_LAST_BRACKET; b += WM_STEP) brackets.push(b);

  let active = null; // "b:1700" | "p:1600" | null
  let life = null;   // selected composer
  let view = null;   // [from, to] years on screen

  hostEl.innerHTML = `
    <div class="wm-timeline">
      <div class="wm-timeline-inner">
        <div class="wm-ribbon" aria-label="Classical periods"></div>
        <div class="wm-brackets" role="group" aria-label="Jump to a time period"></div>
      </div>
    </div>`;
  const wrapEl = hostEl.querySelector(".wm-timeline");
  const ribbonEl = hostEl.querySelector(".wm-ribbon");
  const bracketsEl = hostEl.querySelector(".wm-brackets");

  function render() {
    const counts = brackets.map(b => countFor(b, b + WM_STEP - 1));
    const max = Math.max(1, ...counts);
    const total = countFor(-Infinity, Infinity);
    bracketsEl.innerHTML =
      `<button class="wm-bracket wm-bracket-all${active == null ? " active" : ""}" data-b="" title="Show the whole timeline">
         <span class="wm-bar" style="height:100%"></span><span class="wm-blabel">All time</span><span class="wm-bcount">${total}</span>
       </button>` +
      brackets.map((b, i) => `
        <button class="wm-bracket${active === "b:" + b ? " active" : ""}${counts[i] === 0 ? " empty" : ""}" data-b="${b}" title="${b}–${b + WM_STEP}: ${counts[i]} lives overlap">
          <span class="wm-bar" style="height:${Math.max(6, Math.round((counts[i] / max) * 100))}%"></span>
          <span class="wm-blabel">${b}</span><span class="wm-bcount">${counts[i]}</span>
          <span class="wm-period-line" style="background:${wmPeriodGradient(b)}"></span>
        </button>`).join("");
    ribbonEl.innerHTML = WM_PERIODS.map(p => {
      const left = ((p.from - WM_FIRST_BRACKET) / span) * 100;
      const width = ((p.to - p.from) / span) * 100;
      return `<button class="wm-period${active === "p:" + p.from ? " on" : ""}" data-from="${p.from}" style="left:${left}%;width:${width}%;--era:${eraColor(p.era)}" title="${p.era} · c. ${p.from}–${p.to}"><span>${p.era}</span></button>`;
    }).join("");
    paint();
  }

  // Outline what is on screen; light up a selected composer's years.
  function paint() {
    wrapEl.classList.toggle("has-life", !!life);
    ribbonEl.querySelectorAll(".wm-life-bar").forEach(n => n.remove());
    const showView = view && (view[1] - view[0]) < span * 0.85;
    const from = life ? life.born : null, to = life ? (life.died ?? currentYear) : null;
    if (life) wrapEl.style.setProperty("--life", eraColor(life.era));
    bracketsEl.querySelectorAll(".wm-bracket[data-b]").forEach(btn => {
      const v = btn.getAttribute("data-b");
      if (v === "") { btn.classList.remove("in-view", "in-life"); return; }
      const b = parseInt(v, 10);
      btn.classList.toggle("in-view", !!showView && b <= view[1] && b + WM_STEP - 1 >= view[0]);
      btn.classList.toggle("in-life", !!life && b <= to && b + WM_STEP - 1 >= from);
    });
    ribbonEl.querySelectorAll(".wm-period").forEach(seg => {
      const p = WM_PERIODS.find(x => x.from === parseInt(seg.getAttribute("data-from"), 10));
      seg.classList.toggle("in-life", !!life && !!p && p.from <= to && p.to > from);
    });
    if (life) {
      const lo = Math.max(from, WM_FIRST_BRACKET), hi = Math.min(to, WM_LAST_BRACKET + WM_STEP);
      if (hi > lo) {
        const bar = document.createElement("div");
        bar.className = "wm-life-bar";
        bar.style.left = `${((lo - WM_FIRST_BRACKET) / span) * 100}%`;
        bar.style.width = `${((hi - lo) / span) * 100}%`;
        bar.title = `${life.name} · ${from}–${life.died ?? "present"}`;
        ribbonEl.appendChild(bar);
      }
    }
  }

  bracketsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".wm-bracket");
    if (!btn) return;
    const v = btn.getAttribute("data-b");
    if (v === "" || active === "b:" + v) { active = null; render(); onPick(null); return; }
    const b = parseInt(v, 10);
    active = "b:" + b;
    render();
    onPick({ from: b, to: b + WM_STEP - 1 });
  });
  ribbonEl.addEventListener("click", (e) => {
    const seg = e.target.closest(".wm-period");
    if (!seg) return;
    const p = WM_PERIODS.find(x => x.from === parseInt(seg.getAttribute("data-from"), 10));
    if (!p) return;
    if (active === "p:" + p.from) { active = null; render(); onPick(null); return; }
    active = "p:" + p.from;
    render();
    onPick({ from: p.from, to: p.to });
  });

  render();

  return {
    render,
    setLife(c) { life = c && Number.isFinite(c.born) ? c : null; paint(); },
    setView(range) { view = range; paint(); },
  };
}
