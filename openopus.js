// Open Opus integration: a full works catalogue for each composer, fetched live.
//
// Open Opus (https://openopus.org) is a free, open (public-domain) catalogue of
// classical composers and their works. Its JSON API allows cross-origin requests,
// so the browser can call it directly: no backend and no API key.
//
// This module maps a composer from composers.json to an Open Opus composer id and
// loads their works list. The curated `keyWorks` in composers.json are untouched;
// panel.js shows this catalogue as an extra section underneath them.
//
// Open Opus focuses on the mainstream concert repertoire. Many film/contemporary
// composers, medieval figures and several women composers are not in it (yet), so
// callers must handle the "missing" state.

const OO_API = "https://api.openopus.org";
const OO_CACHE_PREFIX = "composer-atlas:openopus:v1:";
const OO_FOUND_TTL = 7 * 24 * 60 * 60 * 1000;   // found: re-check weekly
const OO_MISSING_TTL = 24 * 60 * 60 * 1000;     // not found: re-check daily
const OO_TIMEOUT_MS = 10000;

// composers.json `id` -> Open Opus composer id. Resolved ahead of time against the
// live API (exact name match, birth year within the tolerance in ooPickCandidate),
// so opening a composer costs one request instead of a name search. Composers that
// are not listed here (e.g. newly added ones) are looked up by name on first open.
// To pin or override a match, set `"openopusId": <number>` on the composer in
// composers.json (or `"openopusId": null` to skip Open Opus for that composer).
const OO_KNOWN_IDS = {
  machaut: 157, dufay: 82, ockeghem: 117, josquin: 50, obrecht: 28, janequin: 23, taverner: 54,
  tallis: 126, palestrina: 214, lassus: 88, byrd: 86, victoria: 205, sweelinck: 182, dowland:
  102, gesualdo: 14, monteverdi: 39, praetorius: 78, frescobaldi: 58, gibbons: 151, schutz: 191,
  lully: 10, buxtehude: 73, charpentier: 9, biber: 47, pachelbel: 115, corelli: 139, marais:
  204, purcell: 199, "a-scarlatti": 65, couperin: 128, albinoni: 27, vivaldi: 98, telemann: 83,
  rameau: 178, "alessandro-marcello": 187, handel: 67, bach: 87, "domenico-scarlatti": 97,
  "benedetto-marcello": 177, tartini: 167, pergolesi: 113, "cpe-bach": 192, gluck: 92, haydn:
  208, "jc-bach": 109, dittersdorf: 206, boccherini: 66, "c-stamitz": 209, salieri: 143, mozart:
  196, cherubini: 120, beethoven: 145, hummel: 30, sor: 212, paganini: 3, field: 74, spohr: 166,
  weber: 168, rossini: 60, berwald: 195, schubert: 183, donizetti: 89, bellini: 51, berlioz:
  175, glinka: 156, "felix-mendelssohn": 147, chopin: 152, "robert-schumann": 129, liszt: 197,
  wagner: 138, verdi: 35, gounod: 29, offenbach: 134, franck: 12, lalo: 59, smetana: 211,
  bruckner: 2, "strauss-jr": 165, goldmark: 1, brahms: 80, borodin: 43, "saint-saens": 45, cui:
  71, delibes: 193, gomes: 207, balakirev: 21, bizet: 68, bruch: 184, mussorgsky: 181,
  tchaikovsky: 79, dvorak: 189, chabrier: 123, massenet: 124, grieg: 162, "rimsky-korsakov":
  118, widor: 41, faure: 53, dindy: 127, janacek: 96, humperdinck: 15, chausson: 61, elgar: 198,
  leoncavallo: 194, ysaye: 141, puccini: 146, herbert: 94, mahler: 77, albeniz: 216, macdowell:
  114, wolf: 161, debussy: 105, delius: 8, mascagni: 69, "richard-strauss": 171, sibelius: 186,
  dukas: 116, nielsen: 52, glazunov: 179, satie: 104, busoni: 84, granados: 76, joplin: 148,
  roussel: 140, stenhammar: 4, zemlinsky: 25, "vaughan-williams": 36, scriabin: 18, rachmaninov:
  188, reger: 72, holst: 75, ives: 217, schoenberg: 62, schmidt: 160, suk: 33, ravel: 57,
  gliere: 85, "de-falla": 37, dohnanyi: 112, respighi: 173, bloch: 106, bartok: 125, enescu: 38,
  stravinsky: 190, grainger: 99, kodaly: 34, szymanowski: 49, webern: 6, varese: 22, bax: 103,
  berg: 210, "villa-lobos": 55, ibert: 122, martinu: 11, prokofiev: 185, honegger: 200, milhaud:
  121, moeran: 164, orff: 93, hindemith: 154, hanson: 42, korngold: 7, mignone: 64, gershwin:
  136, harris: 201, poulenc: 202, chavez: 174, copland: 170, antheil: 108, weill: 131, rodrigo:
  215, walton: 44, durufle: 91, khachaturian: 218, kabalevsky: 63, tippett: 13, shostakovich:
  46, "lopes-graca": 119, guarnieri: 159, messiaen: 150, carter: 163, holmboe: 158, barber: 19,
  schuman: 24, cage: 56, britten: 169, "morton-gould": 70, lutoslawski: 142, babbitt: 180,
  dutilleux: 110, ginastera: 32, bernstein: 135, piazzolla: 40, "malcolm-arnold": 20, xenakis:
  17, ligeti: 26, rorem: 107, "braga-santos": 153, nono: 111, boulez: 132, berio: 133, henze:
  155, stockhausen: 101, rautavaara: 100, crumb: 31, takemitsu: 213, gubaidulina: 172, gorecki:
  16, penderecki: 203, birtwistle: 48, schnittke: 137, part: 5, reich: 176, glass: 95,
  corigliano: 144, "john-adams": 149, rihm: 90, daugherty: 81, ades: 130
};

// ---- Name matching (only used for composers missing from OO_KNOWN_IDS) --------

const OO_STOP_WORDS = new Set([
  "van", "von", "de", "da", "di", "der", "den", "des", "la", "le", "del", "della",
  "el", "ten", "du", "y", "the", "jr", "sr", "ii", "sabio",
]);

function ooSigTokens(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(t => t.length > 1 && !OO_STOP_WORDS.has(t));
}

// Search terms to try, most specific first: surname, then first name, then the
// last word as written (keeps diacritics, which Open Opus search may need).
function ooSearchTerms(name) {
  const sig = ooSigTokens(name);
  const terms = [];
  if (sig.length) terms.push(sig[sig.length - 1]);
  if (sig.length > 1) terms.push(sig[0]);
  const lastWord = String(name).split(/\s+/).pop().toLowerCase().replace(/[^\p{L}\p{N}-]/gu, "");
  if (lastWord) terms.push(lastWord);
  return [...new Set(terms)];
}

// Accept a candidate when the name overlaps AND the birth year agrees:
//   - 1+ shared name token and birth year within 2, or
//   - 2+ shared tokens (first name + surname) and birth year within 10, because
//     birth years of early composers are uncertain (Byrd 1540/1543, Dufay 1397/1400).
function ooPickCandidate(candidates, name, born) {
  const wanted = ooSigTokens(name);
  let best = null;
  for (const c of candidates) {
    const birthYear = parseInt(c.birth, 10);
    const diff = Number.isNaN(birthYear) ? 99 : Math.abs(birthYear - born);
    const have = new Set(ooSigTokens(`${c.complete_name} ${c.name}`));
    const overlap = wanted.filter(t => have.has(t)).length;
    const ok = (overlap >= 1 && diff <= 2) || (overlap >= 2 && diff <= 10);
    if (!ok) continue;
    if (!best || diff < best.diff || (diff === best.diff && overlap > best.overlap)) {
      best = { c, diff, overlap };
    }
  }
  return best ? best.c : null;
}

// ---- Network ----------------------------------------------------------------

async function ooFetchJson(path) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OO_TIMEOUT_MS);
    try {
      const resp = await fetch(OO_API + path, { signal: controller.signal });
      if (resp.ok) return await resp.json();
      lastError = new Error(`Open Opus responded HTTP ${resp.status}`);
      if (resp.status < 500) break;               // 4xx: retrying won't help
    } catch (err) {
      lastError = err;                            // network error or timeout
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 700));
  }
  throw lastError;
}

async function ooResolveId(composer) {
  if (composer.openopusId === null) return null;                    // explicit opt-out
  if (Number.isInteger(composer.openopusId)) return composer.openopusId;  // manual pin
  const known = OO_KNOWN_IDS[composer.id];
  if (known) return known;
  for (const term of ooSearchTerms(composer.name)) {
    const json = await ooFetchJson(`/composer/list/search/${encodeURIComponent(term)}.json`);
    const hit = ooPickCandidate(json.composers || [], composer.name, composer.born);
    if (hit) return Number(hit.id);
  }
  return null;
}

// ---- Cache (memory + localStorage, both best-effort) -------------------------

const ooMemory = new Map();    // composer.id -> result
const ooInflight = new Map();  // composer.id -> pending promise

function ooCacheGet(key) {
  try {
    const raw = localStorage.getItem(OO_CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() > entry.exp) {
      localStorage.removeItem(OO_CACHE_PREFIX + key);
      return null;
    }
    return entry.v;
  } catch { return null; }
}

function ooCacheSet(key, value, ttl) {
  try {
    localStorage.setItem(OO_CACHE_PREFIX + key, JSON.stringify({ exp: Date.now() + ttl, v: value }));
  } catch { /* storage full or unavailable: fine, we just refetch next time */ }
}

// Works are stored as compact rows [id, title, subtitle, genre, flags];
// flags: 1 = popular, 2 = recommended.
function ooExpand(rows) {
  return rows.map(([id, title, subtitle, genre, flags]) => ({
    id, title, subtitle, genre,
    popular: (flags & 1) === 1,
    recommended: (flags & 2) === 2,
  }));
}

async function ooLoad(composer) {
  const cached = ooCacheGet(composer.id);
  if (cached) {
    return cached.missing
      ? { state: "missing" }
      : { state: "ok", openopusId: cached.id, works: ooExpand(cached.w) };
  }
  try {
    const id = await ooResolveId(composer);
    if (id == null) {
      ooCacheSet(composer.id, { missing: true }, OO_MISSING_TTL);
      return { state: "missing" };
    }
    const json = await ooFetchJson(`/work/list/composer/${id}/genre/all.json`);
    if (!Array.isArray(json.works)) {
      ooCacheSet(composer.id, { missing: true }, OO_MISSING_TTL);
      return { state: "missing" };
    }
    const rows = json.works.map(w => [
      Number(w.id),
      String(w.title ?? ""),
      String(w.subtitle ?? ""),
      String(w.genre ?? ""),
      (w.popular === "1" ? 1 : 0) | (w.recommended === "1" ? 2 : 0),
    ]);
    ooCacheSet(composer.id, { id, w: rows }, OO_FOUND_TTL);
    return { state: "ok", openopusId: id, works: ooExpand(rows) };
  } catch (error) {
    return { state: "error", error };
  }
}

// Public API ------------------------------------------------------------------
// Resolves to one of:
//   { state: "ok",      openopusId, works: [{ id, title, subtitle, genre, popular, recommended }] }
//   { state: "missing" }                  composer isn't in Open Opus
//   { state: "error",   error }           network/API problem (not cached, safe to retry)
export function loadOpenOpusWorks(composer) {
  const key = composer.id;
  if (ooMemory.has(key)) return Promise.resolve(ooMemory.get(key));
  if (ooInflight.has(key)) return ooInflight.get(key);
  const pending = ooLoad(composer)
    .then(result => {
      if (result.state !== "error") ooMemory.set(key, result);
      return result;
    })
    .finally(() => ooInflight.delete(key));
  ooInflight.set(key, pending);
  return pending;
}
