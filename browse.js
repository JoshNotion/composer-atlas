// Composers view: searchable, sortable grid. The era filter is shared with the top bar.

import { eraColor } from "./timeline.js";
import { initialsFor, mountPortrait } from "./portraits.js";

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
      </div>
      <div class="browse-grid" id="browse-grid"></div>
    </div>
  `;

  const grid = hostEl.querySelector("#browse-grid");
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

  function render() {
    const list = visible();
    countEl.textContent = `${list.length} composer${list.length === 1 ? "" : "s"}`;
    if (observer) observer.disconnect();
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = `<div class="browse-empty">No composers match.</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    list.forEach(c => {
      const color = eraColor(c.era);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "browse-card";
      card.innerHTML = `
        <span class="browse-portrait" data-composer-id="${escapeBrowse(c.id)}" style="background:${color}"><span class="initials">${escapeBrowse(initialsFor(c.name))}</span></span>
        <span class="browse-name">${escapeBrowse(c.name)}</span>
        <span class="browse-meta">${c.born}&nbsp;–&nbsp;${c.died ?? "present"}</span>
        <span class="browse-era" style="background:${color}">${escapeBrowse(c.era)}</span>
        ${c.birthPlace ? `<span class="browse-place">${escapeBrowse(c.birthPlace.city)}${c.birthPlace.country ? ", " + escapeBrowse(c.birthPlace.country) : ""}</span>` : ""}
      `;
      card.addEventListener("click", () => opts.onSelect && opts.onSelect(c.id));
      frag.appendChild(card);
      const portrait = card.querySelector(".browse-portrait");
      if (observer) observer.observe(portrait);
      else mountPortrait(portrait, c);
    });
    grid.appendChild(frag);
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
