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
      art: `<img src="shots/timeline.jpg" alt="Screenshot of the Timeline view: bars for each Romantic-era composer across the decades" loading="lazy" decoding="async" />`,
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
      art: `<img src="shots/map.jpg" alt="Screenshot of the World map view: dots for composers' birthplaces and homes in 1850 to 1900" loading="lazy" decoding="async" />`,
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
      art: `<img src="shots/composers.jpg" alt="Screenshot of the Composers view: a grid of portraits grouped by period" loading="lazy" decoding="async" />`,
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
      art: `<img src="shots/links.jpg" alt="Screenshot of the Connections view: Johannes Brahms and the composers linked to him" loading="lazy" decoding="async" />`,
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
