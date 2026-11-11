# Composer Atlas

A personal classical-music exploration tool: **309 composers spanning ~950 years** of music history (Petrus Abaelardus, 1079 → present). A home page leads to an interactive D3.js timeline, a world map of where composers lived (filterable by 50-year bracket, era and birth/lived/death), and a searchable composers grid. Each composer opens in a detail panel with a Leaflet map of their journey.

## Run it locally

The app is a static site that needs to be served over HTTP (because it loads `composers.json` via `fetch` and uses ES modules).

**Easiest (Windows):** double-click `start.cmd`. It launches a static server and opens the browser to <http://atlas.localhost:8080>.

**Manual** — from this directory:

```powershell
npx serve -l 8080           # Node (any OS)
python3 -m http.server 8080 # Python 3 (if installed)
```

Then open <http://atlas.localhost:8080> or <http://localhost:8080>. Press `Ctrl+C` in the terminal to stop the server.

> Modern browsers auto-route any `*.localhost` hostname to 127.0.0.1, so `atlas.localhost` works with no hosts-file edit.

## Notion / offline single-file version

For an environment that can't serve a folder (a Notion HTML block, an email attachment, a USB drive), run:

```powershell
node build.cjs
```

Without network access, run `npm i d3@7.9.0 leaflet@1.9.4` in some folder and build with `ATLAS_LIBS=<that folder> node build.cjs`.

This produces `composer-atlas.html` (~1.4 MB) with **everything inlined** — CSS, all JS modules, `composers.json`, D3, and Leaflet. Just drop it anywhere and open. The build fetches D3 and Leaflet from their CDNs at build time so no internet is needed at runtime either.

## Files

- `index.html` — page shell: top bar with navigation, one `.view` section per page, shared detail panel.
- `app.js` — data loading, hash router (`#/`, `#/timeline`, `#/map?era=Romantic&b=1850`, `#/composers`; the old `#era=Baroque` still works), shared era filter, detail panel.
- `home.js` — landing page.
- `worldmap.js` — world map view: places aggregated into count pins, 50-year bracket strip with play button, era and place-type filters.
- `browse.js` — composers grid with search and sort.
- `links.js` — Connections view: every documented composer link on one vertical, time-ordered page (older at the top), with a period ribbon on the left. Click a composer, or search for one, to follow just their connections; layout is computed from `relationships` in `composers.json`.
- `portraits/` — local portrait images (set `"portrait": "portraits/<id>.jpg"`); the build inlines them.
- `styles.css` — dark theme, panel transitions, Leaflet overrides, the Clair-de-lune sheet-paper background baked in as a filtered SVG data URI.
- `timeline.js` — D3 timeline: sticky-top axis, vertical bar list, horizontal-scroll at zoom > 1, six zoom levels, world-event markers, dashed relationship lines, era filter.
- `map.js` — Leaflet map with CartoDB dark-matter tiles; birth/lived/death markers with toggleable layers; journey polyline.
- `panel.js` — composer detail card: portrait, dual-row Life & Works timeline with popover, key works with Listen link, connection cards with notes, world-context aside.
- `portraits.js` — initials fallback + lazy Wikipedia summary fetch (one cached request per article, shared by the portrait and the About text); higher-resolution swap for the lightbox.
- `openopus.js` — Open Opus integration: resolves a composer to an Open Opus id and loads their full works catalogue (cached; see below).
- `app.js` — glue: loads JSON, mirrors relationships, wires selection, zoom, lightbox, keyboard, tooltip, panel state machine, hash-based era filter.
- `composers.json` — the data file (194 composers).
- `build.cjs` — single-file bundler for the Notion / offline HTML.
- `start.cmd` — Windows launcher (opens browser, runs `npx serve`).

## Interaction

### Timeline
- **Click a composer bar** to open the side panel (peek mode, ~40% width from the right).
- **Zoom** with the `−` / `+` buttons top-right, the `+` / `−` keys, or `Ctrl/⌘ + scroll wheel`. Six levels (1× → 6×). At higher zooms the timeline scrolls horizontally.
- **Filter by era** — click any chip in the top-bar legend (Medieval, Renaissance, Baroque, Classical, Romantic, Modern, Contemporary). The URL updates to `#era=Romantic` so views are shareable and survive reload. Click **All** to clear.
- **World-event markers** — French Revolution, Napoleonic Wars, 1848, WWI, WWII appear as faint vertical bands on the axis.
- **Relationship lines** — selecting a composer draws soft dashed lines to the composers they knew personally.

### Panel
- **Peek** (default) — 40%-width overlay from the right, map above details.
- **Expand** — click the `⤢` icon (top-left of panel, next to the close arrow) to switch to full-page mode: map fills the left 50 %, details fill the right 50 % with the world-context bullets promoted to a card next to the composer's name. Click `⤡` to collapse back.
- **Close** — click the `»` arrow top-left of the panel or press `Esc`. `Esc` closes the lightbox first if it's open.
- **Portrait** — click the portrait to enlarge it in a lightbox with a link out to Wikipedia.
- **Life & Works timeline** — dual-row track sharing one x-axis. Filled dots = life events; open rings = key works. Hover any dot for the year, kind, title, and (for works) the era-context blurb.
- **▶ Listen** — every key work has a Listen pill that opens a YouTube search for `{composer} {work}`. Override per work by adding `mediaUrl` in `composers.json`.
- **About** — a short introduction to the composer at the top of the panel, taken from the composer's Wikipedia article (the `wiki` field in `composers.json`). It's a general summary, not a life story: the turning points live in the curated "Life & works" timeline right below it. Long summaries collapse behind "Read more"; the section removes itself when there's no article (or you're offline). Wikipedia text is CC BY-SA 4.0, so each About links back to the article.
- **Works catalogue** — below the curated key works, a full works list from [Open Opus](https://openopus.org), grouped by genre. Starts on Open Opus's *Recommended* works; switch to *All works* for the complete list (hundreds for the big names). Each work has a YouTube Listen link. See "Open Opus works catalogue" below.
- **Connection cards** — each shows the connected composer's name, lifespan, and a note explaining the relationship; click to jump to them. Cross-era navigation works even while the timeline is filtered.

### Keyboard
- `Esc` — close lightbox, then panel.
- `+` / `-` — zoom the timeline.
- `Ctrl/⌘ + scroll wheel` (over the timeline) — zoom.

## Editing data

All composer data lives in `composers.json`. Adding or editing entries doesn't require touching the UI code — the timeline sorts by `born`, the map auto-fits to the listed locations, and relationships are mirrored at load time so each link only needs to be listed on one side.

A composer entry looks like:

```json
{
  "id": "bach",
  "name": "Johann Sebastian Bach",
  "born": 1685,
  "died": 1750,
  "era": "Baroque",
  "portrait": "",
  "wiki": "Johann Sebastian Bach",
  "birthPlace": { "city": "Eisenach", "country": "Germany", "lat": 50.9743, "lng": 10.3233 },
  "locations": [
    { "city": "Eisenach", "type": "birth", "years": "1685",       "lat": 50.9743, "lng": 10.3233 },
    { "city": "Leipzig",  "type": "lived", "years": "1723–1750",  "lat": 51.3397, "lng": 12.3731 },
    { "city": "Leipzig",  "type": "death", "years": "1750",       "lat": 51.3397, "lng": 12.3731 }
  ],
  "relationships": [
    { "id": "handel",  "note": "Born the same year, 80 miles apart; never met" },
    { "id": "vivaldi", "note": "Bach transcribed several of Vivaldi's concertos" }
  ],
  "lifeEvents": [
    { "year": 1685, "event": "Born in Eisenach" }
  ],
  "keyWorks": [
    { "title": "Brandenburg Concertos", "year": "1721", "context": "...", "mediaUrl": "https://www.youtube.com/watch?v=..." }
  ],
  "worldContext": ["..."]
}
```

Notes on individual fields:

- **`born`** and **`died`** are integers. `died` may be `null` for living composers (the bar extends to the current year, and the header count reflects a rolling span).
- **`era`** must be one of: `Medieval`, `Renaissance`, `Baroque`, `Classical`, `Romantic`, `Modern`, `Contemporary`. It drives the bar colour and the legend chip that filters to that composer. Adding a new era means editing three files: `--era-*` in `styles.css`, `ERA_COLORS` in `timeline.js`, and `ERA_ORDER` in `app.js` (for legend order).
- **`portrait`** is left blank by default — the app lazily fetches a thumbnail from Wikipedia's REST API using the `wiki` field. To override with a curated image, set `portrait` to a direct URL (Wikimedia Commons' `Special:FilePath` redirect works well); that takes precedence. While the fetch is in flight or if it fails, the portrait shows the composer's initials on their era colour.
- **`wiki`** is the Wikipedia page title (with spaces, not underscores — the app URL-encodes it). Include parenthetical disambiguators when needed, e.g. `"John Powell (film composer)"`.
- **`locations[].type`** is `birth`, `lived`, or `death`. Each drives a different marker colour (green / blue / red) and can be toggled independently in the map controls.
- **`keyWorks[].year`** can be a single year (`"1721"`), a range (`"1722–1742"`), or a prefixed estimate (`"c.1680"`). The Life & Works timeline extracts the first four-digit number for positioning and shows the original string in the popover.
- **`keyWorks[].mediaUrl`** is optional. When absent, the ▶ Listen pill falls back to a YouTube search of `{composer name} {work title}`.
- **`relationships[]`** should list a note that describes the connection from either side (the mirroring copies the same note to the other composer). Relationships to composers not in the data file are silently ignored.

## Open Opus works catalogue

[Open Opus](https://openopus.org) is a free, open (public-domain) catalogue of classical composers and works. Its API allows cross-origin requests, so the browser calls it directly: no backend, no API key. It needs an internet connection; everything else in the app still works offline.

- **How it's wired:** `panel.js` calls `loadOpenOpusWorks(composer)` from `openopus.js` when you open a composer and fills the "Works catalogue" section when the response arrives. The curated `keyWorks` in `composers.json` are untouched.
- **Matching composers:** `openopus.js` carries a built-in map of `composers.json` ids to Open Opus ids (checked against the live API: exact name match with a matching birth year), so opening a composer is one request. Composers not in the map (for example newly added ones) are looked up by name and birth year the first time they're opened.
- **Not every composer is in Open Opus.** It focuses on the mainstream concert repertoire. Many film/contemporary composers, medieval figures and several women composers (Farrenc, Clara Schumann, Hildegard, Saariaho, …) aren't there, and the panel says so and shows only the curated key works. Open Opus is wiki-style, so entries can be added at openopus.org.
- **Override a match** by adding `"openopusId": 87` to a composer in `composers.json` (the number is Open Opus's composer id), or `"openopusId": null` to skip Open Opus for that composer.
- **Caching:** results are kept in memory and in `localStorage` (found: 7 days, not found: 1 day). Network errors are never cached; the panel shows a "Try again" button.

## Adding composers programmatically

Batches of new composers are typically added by writing a small one-off `_add_something.cjs` seed script that reads `composers.json`, pushes new entries into the array, calls a `pairs` block for relationships, and writes the file back. The `build.cjs` bundler then repackages the single-file HTML.
