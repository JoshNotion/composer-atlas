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

  const era = (n) => eraColor(n);
  const features = [
    {
      kicker: "Timeline", accent: era("Baroque"), href: "#/timeline", cta: "Open the timeline",
      title: "Every life as a bar across the centuries",
      lede: "See who overlapped with whom, with relationships and world events alongside. Zoom in on an era to read it closely.",
      how: [
        "Scroll sideways to travel through time; hold Ctrl or &#8984; and scroll to zoom",
        "Click a bar to open that composer&rsquo;s life, works and connections",
        "Use the era chips at the top to focus on a single period",
      ],
      art: `<svg viewBox="0 0 320 230" aria-hidden="true">
        <g stroke="#f0ede8" stroke-opacity=".08"><path d="M40 30v170M110 30v170M180 30v170M250 30v170"/></g>
        <g>
          <rect x="22" y="40" width="64" height="12" rx="6" fill="${era("Medieval")}"/>
          <rect x="58" y="66" width="108" height="12" rx="6" fill="${era("Renaissance")}"/>
          <rect x="112" y="92" width="112" height="12" rx="6" fill="${era("Baroque")}"/>
          <rect x="160" y="118" width="86" height="12" rx="6" fill="${era("Classical")}"/>
          <rect x="188" y="144" width="104" height="12" rx="6" fill="${era("Romantic")}"/>
          <rect x="226" y="170" width="74" height="12" rx="6" fill="${era("Modern")}"/>
        </g></svg>`,
    },
    {
      kicker: "World map", accent: era("Modern"), href: "#/map", cta: "Open the map",
      title: "Where the music happened",
      lede: "Where composers were born, lived and died, in 50-year brackets. Watch music move from Paris to Vienna to New York.",
      how: [
        "Pick a bracket or a period, or press play and set the speed from 0.5&times; to 4&times;",
        "Click a dot to follow one composer&rsquo;s whole journey, place by place",
        "Switch Born, Lived and Died on or off to change what you see",
      ],
      art: `<svg viewBox="0 0 320 230" aria-hidden="true">
        <circle cx="160" cy="115" r="86" fill="#222" stroke="#f0ede8" stroke-opacity=".08"/>
        <g stroke="#f0ede8" stroke-opacity=".07" fill="none"><ellipse cx="160" cy="115" rx="86" ry="34"/><ellipse cx="160" cy="115" rx="40" ry="86"/></g>
        <g fill-opacity=".85">
          <circle cx="150" cy="86" r="4" fill="${era("Baroque")}"/><circle cx="168" cy="92" r="5" fill="${era("Classical")}"/>
          <circle cx="182" cy="82" r="3.5" fill="${era("Romantic")}"/><circle cx="120" cy="98" r="3.5" fill="${era("Renaissance")}"/>
          <circle cx="232" cy="138" r="4.5" fill="${era("Modern")}"/><circle cx="104" cy="140" r="4" fill="${era("Contemporary")}"/>
          <circle cx="196" cy="150" r="3.5" fill="${era("Romantic")}"/>
        </g>
        <g fill="none" stroke-width="1.4"><circle cx="160" cy="98" r="12" stroke="${era("Baroque")}" stroke-opacity=".7"/><circle cx="92" cy="122" r="11" stroke="${era("Modern")}" stroke-opacity=".7"/></g>
        <g fill="#f0ede8" font-size="9" text-anchor="middle" font-family="sans-serif"><text x="160" y="101">7</text><text x="92" y="125">4</text></g>
      </svg>`,
    },
    {
      kicker: "Composers", accent: era("Renaissance"), href: "#/composers", cta: "Browse composers",
      title: "Everyone, grouped by period",
      lede: `Browse all ${composers.length} composers, grouped by classical period, and open any life from the grid.`,
      how: [
        "Search by name, city or country",
        "Sort by birth year, name or death year",
        "Jump between periods with the chips at the top",
      ],
      art: `<svg viewBox="0 0 320 230" aria-hidden="true">
        ${[0,1,2,3].map(r => [0,1,2,3,4].map(c => {
          const eras = ["Medieval","Renaissance","Baroque","Classical","Romantic","Modern","Contemporary"];
          const e = eras[Math.min(6, Math.floor((r * 5 + c) / 3))];
          const x = 52 + c * 54, y = 40 + r * 50;
          return `<circle cx="${x}" cy="${y}" r="17" fill="${era(e)}" fill-opacity=".2" stroke="${era(e)}" stroke-opacity=".8" stroke-width="1.6"/>`;
        }).join("")).join("")}
      </svg>`,
    },
    {
      kicker: "Connections", accent: era("Romantic"), href: "#/links", cta: "Explore the connections",
      title: "Who taught whom, and who followed whom",
      lede: `${linkPairs.size} documented connections between ${linkedIds.size} composers, from the Middle Ages at the top to today at the bottom.`,
      how: [
        "Click a composer to light up their circle, then hover each connection to read how they are related",
        "Use the small arrow on a portrait to open their full profile",
        "Search for a name to jump straight to them",
      ],
      chips: `<div class="home-links-chips">
        <a href="#/links?f=messiaen">Messiaen&rsquo;s circle</a>
        <a href="#/links?f=brahms">Brahms&rsquo;s circle</a>
        <a href="#/links?f=ravel">Ravel&rsquo;s circle</a>
      </div>`,
      art: `<svg viewBox="0 0 320 230" aria-hidden="true">
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
        </g></svg>`,
    },
  ];

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

      <section class="home-features">
        ${features.map(f => `
        <article class="home-feature" style="--accent:${f.accent}">
          <div class="home-feature-copy">
            <p class="home-kicker">${f.kicker}</p>
            <h3>${f.title}</h3>
            <p class="home-feature-lede">${f.lede}</p>
            <ul class="home-how">${f.how.map(t => `<li>${t}</li>`).join("")}</ul>
            ${f.chips || ""}
            <a class="home-feature-go" href="${f.href}">${f.cta} &rarr;</a>
          </div>
          <a class="home-feature-art" href="${f.href}" aria-label="${f.cta}" tabindex="-1">${f.art}</a>
        </article>`).join("")}
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

      <footer class="home-built">
        <p><strong>Built with open data.</strong> Composer biographies come from
        <a href="https://www.wikipedia.org" target="_blank" rel="noopener">Wikipedia</a>
        (text under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA</a>); works catalogues from
        <a href="https://openopus.org" target="_blank" rel="noopener">Open Opus</a>; maps from
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors,
        <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> and
        <a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>.</p>
        <p><strong>Portraits</strong> come from Wikipedia and Wikimedia Commons (public domain or freely licensed; each file's page lists its author and licence)
        and from the sources linked on the image where noted. <strong>Audio previews</strong> are 30-second clips courtesy of
        <a href="https://www.apple.com/apple-music/" target="_blank" rel="noopener">Apple Music</a>, played from Apple's servers and linked to the full recording; "Listen" links go to YouTube.
        All recordings and trademarks belong to their respective owners.</p>
        <p><strong>Privacy.</strong> This site has no accounts, cookies or analytics. Your browser loads map tiles from CARTO, portraits and text from Wikipedia/Wikimedia,
        works from Open Opus and previews from Apple, so those services see your IP address as with any website.</p>
      </footer>
    </div>
  `;

  hostEl.querySelector("#home-random").addEventListener("click", () => {
    const pick = composers[Math.floor(Math.random() * composers.length)];
    if (pick && opts.onSelect) opts.onSelect(pick.id);
  });
}
