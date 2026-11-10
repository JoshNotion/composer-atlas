// Composers view: searchable, sortable grid. The era filter is shared with the top bar.

import { eraColor } from "./timeline.js";
import { initialsFor, mountPortrait } from "./portraits.js";

const BROWSE_ERAS = [
  { name: "Medieval", blurb: "Plainchant, troubadours and the first polyphony" },
  { name: "Renaissance", blurb: "Vocal polyphony, the madrigal and the printed score" },
  { name: "Baroque", blurb: "Counterpoint, ornament and the birth of opera" },
  { name: "Classical", blurb: "Balance, clarity and the sonata" },
  { name: "Romantic", blurb: "Feeling, nation and the virtuoso" },
  { name: "Modern", blurb: "Tonality stretched, broken and rebuilt" },
  { name: "Contemporary", blurb: "Minimalism, electronics and a global stage" },
];

export function createBrowse(hostEl, composers, opts = {}) {
  const state = { era: null, query: "", sort: "born" };

  hostEl.innerHTML = `
    <div class="browse-inner">
      <div class="browse-toolbar">
        <input class="browse-search" id="browse-search" type="search" placeholder="Search composers, cities, countries" autocomplete="off" aria-label="Search composers" />
        <label class="browse-sort">Sort
          <select id="browse-sort" aria-label="Sort composers">
            <option value="born">Birth year</option>
            <option value="name">Name</option>
            <option value="died">Death year</option>
          </select>
        </label>
        <span class="browse-count" id="browse-count"></span>
        <div class="browse-jump" id="browse-jump" aria-label="Jump to a period"></div>
      </div>
      <div class="browse-groups" id="browse-groups"></div>
    </div>
  `;

  const groupsEl = hostEl.querySelector("#browse-groups");
  const jumpEl = hostEl.querySelector("#browse-jump");
  const countEl = hostEl.querySelector("#browse-count");
  const searchEl = hostEl.querySelector("#browse-search");
  const sortEl = hostEl.querySelector("#browse-sort");

  const observer = typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          observer.unobserve(en.target);
          const c = composers.find(x => x.id === en.target.dataset.composerId);
          if (c) mountPortrait(en.target, c);
        });
      }, { root: hostEl, rootMargin: "200px" })
    : null;

  function haystack(c) {
    const places = (c.locations || []).map(l => `${l.city} ${l.country || ""}`).join(" ");
    return `${c.name} ${c.era} ${c.birthPlace ? c.birthPlace.city + " " + c.birthPlace.country : ""} ${places}`.toLowerCase();
  }
  const index = new Map(composers.map(c => [c.id, haystack(c)]));

  function visible() {
    const q = state.query.trim().toLowerCase();
    const list = composers.filter(c =>
      (!state.era || c.era === state.era) && (!q || index.get(c.id).includes(q))
    );
    const key = state.sort;
    list.sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name);
      if (key === "died") return (a.died ?? 9999) - (b.died ?? 9999);
      return a.born - b.born;
    });
    return list;
  }

  function cardFor(c) {
    const color = eraColor(c.era);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "browse-card";
    card.innerHTML = `
      <span class="browse-portrait" data-composer-id="${escapeBrowse(c.id)}" style="background:${color}"><span class="initials">${escapeBrowse(initialsFor(c.name))}</span></span>
      <span class="browse-name">${escapeBrowse(c.name)}</span>
      <span class="browse-meta">${c.born}&nbsp;–&nbsp;${c.died ?? "present"}</span>
      ${c.birthPlace ? `<span class="browse-place">${escapeBrowse(c.birthPlace.city)}${c.birthPlace.country ? ", " + escapeBrowse(c.birthPlace.country) : ""}</span>` : ""}
    `;
    card.addEventListener("click", () => opts.onSelect && opts.onSelect(c.id));
    const portrait = card.querySelector(".browse-portrait");
    if (observer) observer.observe(portrait);
    else mountPortrait(portrait, c);
    return card;
  }

  function render() {
    const list = visible();
    countEl.textContent = `${list.length} composer${list.length === 1 ? "" : "s"}`;
    if (observer) observer.disconnect();
    groupsEl.innerHTML = "";
    jumpEl.innerHTML = "";
    if (!list.length) {
      groupsEl.innerHTML = `<div class="browse-empty">No composers match.</div>`;
      return;
    }
    const known = BROWSE_ERAS.map(e => e.name);
    const extra = [...new Set(list.map(c => c.era))].filter(e => !known.includes(e));
    const order = [...BROWSE_ERAS, ...extra.map(name => ({ name, blurb: "" }))];

    order.forEach(era => {
      const members = list.filter(c => c.era === era.name);
      if (!members.length) return;
      const color = eraColor(era.name);
      const born = members.map(c => c.born);
      const section = document.createElement("section");
      section.className = "browse-era-group";
      section.id = `browse-era-${era.name}`;
      section.style.setProperty("--era", color);
      section.innerHTML = `
        <header class="browse-era-head">
          <span class="browse-era-mark"></span>
          <h3>${escapeBrowse(era.name)}</h3>
          <span class="browse-era-range">born ${Math.min(...born)}–${Math.max(...born)}</span>
          <span class="browse-era-n">${members.length} composer${members.length === 1 ? "" : "s"}</span>
        </header>
        ${era.blurb ? `<p class="browse-era-blurb">${escapeBrowse(era.blurb)}</p>` : ""}
        <div class="browse-grid"></div>
      `;
      const grid = section.querySelector(".browse-grid");
      members.forEach(c => grid.appendChild(cardFor(c)));
      groupsEl.appendChild(section);

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "browse-jump-chip";
      chip.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${escapeBrowse(era.name)}<span class="browse-jump-n">${members.length}</span>`;
      chip.addEventListener("click", () => {
        // Scroll the view itself; scrollIntoView would also shift the page layout sideways.
        const top = section.getBoundingClientRect().top - hostEl.getBoundingClientRect().top + hostEl.scrollTop;
        const toolbar = hostEl.querySelector(".browse-toolbar");
        hostEl.scrollTo({ top: Math.max(0, top - (toolbar ? toolbar.offsetHeight : 0) - 8), behavior: "smooth" });
      });
      jumpEl.appendChild(chip);
    });
  }

  let debounce = null;
  searchEl.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.query = searchEl.value; render(); }, 120);
  });
  sortEl.addEventListener("change", () => { state.sort = sortEl.value; render(); });

  render();

  return {
    setEra(era) { state.era = era || null; render(); },
    focusSearch() { searchEl.focus(); },
  };
}

function escapeBrowse(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
