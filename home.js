// Home view: landing page with entry cards into each section.

import { eraColor } from "./timeline.js";

const HOME_ERAS = ["Medieval", "Renaissance", "Baroque", "Classical", "Romantic", "Modern", "Contemporary"];

export function createHome(hostEl, composers, opts = {}) {
  const currentYear = new Date().getFullYear();
  const places = new Set();
  const countries = new Set();
  composers.forEach(c => {
    (c.locations || []).forEach(l => {
      if (Number.isFinite(l.lat)) places.add(`${l.lat.toFixed(2)},${l.lng.toFixed(2)}`);
    });
    if (c.birthPlace && c.birthPlace.country) countries.add(c.birthPlace.country);
  });
  const earliest = composers.reduce((m, c) => Math.min(m, c.born), Infinity);
  const eraCounts = {};
  composers.forEach(c => { eraCounts[c.era] = (eraCounts[c.era] || 0) + 1; });

  const stat = (n, label) => `<div class="home-stat"><strong>${n.toLocaleString()}</strong><span>${label}</span></div>`;

  hostEl.innerHTML = `
    <div class="home-inner">
      <section class="home-hero">
        <p class="home-kicker">Composer Atlas</p>
        <h2 class="home-title">${Math.ceil((currentYear - earliest) / 50) * 50} years of music,<br />in time and place.</h2>
        <p class="home-lede">Follow composers through the centuries, see where they were born, worked and died, and open any life to read its connections and works.</p>
        <div class="home-stats">
          ${stat(composers.length, "composers")}
          ${stat(places.size, "places")}
          ${stat(countries.size, "birth countries")}
          ${stat(HOME_ERAS.length, "eras")}
        </div>
      </section>

      <section class="home-cards">
        <a class="home-card" href="#/timeline">
          <span class="home-card-art home-art-timeline" aria-hidden="true"></span>
          <h3>Timeline</h3>
          <p>Every composer as a bar across the centuries, with relationships and world events. Zoom in on an era.</p>
          <span class="home-card-go">Open the timeline &rarr;</span>
        </a>
        <a class="home-card" href="#/map">
          <span class="home-card-art home-art-map" aria-hidden="true"></span>
          <h3>World map</h3>
          <p>Where composers lived, in 50-year brackets. Press play to watch music move from Paris to Vienna to New York.</p>
          <span class="home-card-go">Open the map &rarr;</span>
        </a>
        <a class="home-card" href="#/composers">
          <span class="home-card-art home-art-grid" aria-hidden="true"></span>
          <h3>Composers</h3>
          <p>Browse and search everyone by name, era or birth year, then open a life from the grid.</p>
          <span class="home-card-go">Browse composers &rarr;</span>
        </a>
      </section>

      <section class="home-eras">
        <h3>Start from an era</h3>
        <div class="home-era-row">
          ${HOME_ERAS.map(era => `
            <a class="home-era" href="#/timeline?era=${encodeURIComponent(era)}" style="--era:${eraColor(era)}">
              <span class="home-era-name">${era}</span>
              <span class="home-era-count">${eraCounts[era] || 0}</span>
            </a>`).join("")}
        </div>
        <button class="home-random" id="home-random" type="button">Surprise me with a composer</button>
      </section>
    </div>
  `;

  hostEl.querySelector("#home-random").addEventListener("click", () => {
    const pick = composers[Math.floor(Math.random() * composers.length)];
    if (pick && opts.onSelect) opts.onSelect(pick.id);
  });
}
