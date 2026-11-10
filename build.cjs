// Bundle everything into a single self-contained HTML file for Notion / offline use.
// Output: composer-atlas.html
//
// Fixes vs first draft:
//   - No "use strict" in the IIFE wrapper (source has legal function redeclarations
//     across modules that strict mode rejects).
//   - JSON data is embedded with </script> escaped so a stray </SCRIPT>-like string
//     in composer text can't close our script tag early.
//   - D3 and Leaflet JS+CSS are pulled from CDN at build time and inlined, so the
//     file works even if the host (Notion) blocks external scripts.

const fs = require('fs');
const path = require('path');

const root = __dirname;
const p = (f) => path.join(root, f);
const read = (f) => fs.readFileSync(p(f), 'utf8');

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch ${url} → HTTP ${r.status}`);
  return await r.text();
}

// Serialize JSON safely for embedding inside <script>...</script>.
// The </ sequence is the only thing that can close the tag early.
function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
}

(async () => {
  // --- 1. Data
  const composers = JSON.parse(read('composers.json'));

  // --- 2. Concatenate our JS modules, stripping import/export
  const modules = ['portraits.js', 'timeline.js', 'map.js', 'worldmap.js', 'home.js', 'browse.js', 'openopus.js', 'panel.js', 'app.js'];
  let scripts = modules.map(f => {
    let code = read(f);
    code = code.replace(/^\s*import\s[^;]*;?\s*$/gm, '');
    code = code.replace(/^\s*export\s+(?=(function|const|let|class|async))/gm, '');
    return `\n// ===== ${f} =====\n` + code;
  }).join('\n');

  // Point loadComposers at the inline global instead of fetching a file.
  scripts = scripts.replace(
    /async function loadComposers\(\)\s*{[\s\S]*?\n\}/m,
    'async function loadComposers() { return window.__COMPOSER_ATLAS_DATA__; }'
  );

  // --- 3. Fetch external libraries (D3 + Leaflet JS/CSS) once at build time.
  // Set ATLAS_LIBS to a folder with node_modules/d3 and node_modules/leaflet to build
  // without network access (e.g. `npm i d3@7.9.0 leaflet@1.9.4` in that folder).
  let d3Src, leafletJs, leafletCss;
  if (process.env.ATLAS_LIBS) {
    console.log('Reading D3, Leaflet from', process.env.ATLAS_LIBS);
    const lib = (f) => fs.readFileSync(path.join(process.env.ATLAS_LIBS, 'node_modules', f), 'utf8');
    d3Src = lib('d3/dist/d3.min.js');
    leafletJs = lib('leaflet/dist/leaflet.js');
    leafletCss = lib('leaflet/dist/leaflet.css');
  } else {
    console.log('Fetching D3, Leaflet...');
    [d3Src, leafletJs, leafletCss] = await Promise.all([
      fetchText('https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'),
      fetchText('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'),
      fetchText('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'),
    ]);
  }

  // --- 4. Read HTML shell; strip the tags that pointed at local files / CDN
  let html = read('index.html');
  html = html
    .replace(/<link\s+rel="stylesheet"\s+href="https:\/\/unpkg\.com\/leaflet[^"]*"[^>]*>/, '')
    .replace(/<link\s+rel="stylesheet"\s+href="styles\.css"[^>]*>/, '')
    .replace(/<script\s+src="https:\/\/unpkg\.com\/leaflet[^"]*"[^>]*><\/script>/, '')
    .replace(/<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/d3[^"]*"[^>]*><\/script>/, '')
    .replace(/<script\s+type="module"\s+src="app\.js"[^>]*><\/script>/, '');

  // --- 5. Inject inline styles, data, and bundled scripts.
  const styleTag =
    `<style>\n${leafletCss}\n</style>\n` +
    `<style>\n${read('styles.css')}\n</style>`;
  // NB: replacements below use a function, not a string. With a string, JS expands
  // `$&`, `` $` `` and `$'` inside the replacement, and minified D3 contains those
  // sequences, which splices copies of the page into the middle of the library.
  html = html.replace('</head>', () => `${styleTag}\n</head>`);

  const libScript = `<script>${d3Src}\n${leafletJs}</script>`;
  const dataScript = `<script>window.__COMPOSER_ATLAS_DATA__ = ${safeJson(composers)};</script>`;
  const bundleScript = `<script>\n(function(){\n${scripts}\n})();\n</script>`;
  html = html.replace('</body>', () => `${libScript}\n${dataScript}\n${bundleScript}\n</body>`);

  // --- 6. Write output
  const out = p('composer-atlas.html');
  fs.writeFileSync(out, html);
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`Wrote ${out} — ${kb} KB`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
