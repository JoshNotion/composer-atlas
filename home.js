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

  // Unique documented links between composers (each pair counted once)
  const byIdHome = new Map(composers.map(c => [c.id, c]));
  const linkPairs = new Set();
  const linkedIds = new Set();
  composers.forEach(c => (c.relationships || []).forEach(rel => {
    const rid = typeof rel === "string" ? rel : rel.id;
    if (rid === c.id || !byIdHome.has(rid)) return;
    linkPairs.add([c.id, rid].sort().join("|"));
    linkedIds.add(c.id);
    linkedIds.add(rid);
  }));

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
          ${stat(linkPairs.size, "connections")}
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

      <section class="home-links">
        <div class="home-links-copy">
          <p class="home-kicker">Connections</p>
          <h3>Who taught whom, and who followed whom</h3>
          <p>${linkPairs.size} documented connections between ${linkedIds.size} composers, laid out from the Middle Ages at the top to today at the bottom. Hover anyone to light up their circle and read how they're linked.</p>
          <div class="home-links-chips">
            <a href="#/links?f=messiaen">Messiaen&rsquo;s circle</a>
            <a href="#/links?f=brahms">Brahms&rsquo;s circle</a>
            <a href="#/links?f=ravel">Ravel&rsquo;s circle</a>
          </div>
          <a class="home-links-go" href="#/links">Explore the connections &rarr;</a>
        </div>
        <a class="home-links-art" href="#/links" aria-label="Open the connections view" tabindex="-1">
          <svg viewBox="0 0 320 230" role="img" aria-hidden="true">
            <g fill="none" stroke-width="1.4" stroke-linecap="round">
              <path d="M70 34 C70 80 120 80 120 118" stroke="#9B8FE8" opacity=".7"/>
              <path d="M70 34 C70 90 40 96 40 150" stroke="#9B8FE8" opacity=".35"/>
              <path d="M160 30 C160 78 120 84 120 118" stroke="#E8A020" opacity=".7"/>
              <path d="M160 30 C160 90 200 90 200 122" stroke="#E8A020" opacity=".35"/>
              <path d="M240 38 C240 84 200 86 200 122" stroke="#E86040" opacity=".6"/>
              <path d="M120 118 C120 150 90 156 90 196" stroke="#E0608A" opacity=".8"/>
              <path d="M120 118 C120 154 150 158 150 196" stroke="#E0608A" opacity=".8"/>
              <path d="M200 122 C200 156 240 160 240 196" stroke="#50A0E8" opacity=".6"/>
              <path d="M120 118 C120 150 200 96 200 122" stroke="#E0608A" opacity=".25"/>
              <path d="M40 150 C40 176 90 170 90 196" stroke="#9B8FE8" opacity=".3"/>
            </g>
            <g stroke-width="2">
              <circle cx="70" cy="34" r="11" fill="#2a2740" stroke="#9B8FE8"/>
              <circle cx="160" cy="30" r="11" fill="#3a2e18" stroke="#E8A020"/>
              <circle cx="240" cy="38" r="11" fill="#3b2420" stroke="#E86040"/>
              <circle cx="120" cy="118" r="13" fill="#3b2230" stroke="#E0608A"/>
              <circle cx="200" cy="122" r="11" fill="#1f3040" stroke="#50A0E8"/>
              <circle cx="40" cy="150" r="9" fill="#2a2740" stroke="#9B8FE8"/>
              <circle cx="90" cy="196" r="11" fill="#243818" stroke="#70C030"/>
              <circle cx="150" cy="196" r="11" fill="#1f3040" stroke="#50A0E8"/>
              <circle cx="240" cy="196" r="11" fill="#243818" stroke="#70C030"/>
            </g>
          </svg>
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
