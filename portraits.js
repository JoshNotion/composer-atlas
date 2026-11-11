// Portrait helpers: initials fallback + lazy fetch from Wikipedia REST API.
// If composer.portrait is set, that wins. Otherwise we look up composer.wiki
// via https://en.wikipedia.org/api/rest_v1/page/summary/{title}.

const cache = new Map();

// One cached Wikipedia REST summary per article title, shared by the portrait and the
// panel's "About" text so each composer costs a single request. Resolves to the parsed
// summary (thumbnail, extract, content_urls, ...) or null. A missing article (404) is
// remembered for the session; network errors and 5xx are not, so a later open retries.
export function fetchWikiSummary(composer) {
  if (!composer || !composer.wiki) return Promise.resolve(null);

  const key = composer.wiki;
  if (cache.has(key)) return cache.get(key);

  const title = encodeURIComponent(key.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;

  const promise = fetch(url, { headers: { accept: "application/json" } })
    .then(r => {
      if (r.ok) return r.json();
      if (r.status >= 500 || r.status === 429) cache.delete(key);
      return null;
    })
    .catch(() => {
      cache.delete(key);
      return null;
    });

  cache.set(key, promise);
  return promise;
}

export function initialsFor(name) {
  if (!name) return "?";
  const cleaned = name.replace(/[().,"]/g, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function resolvePortraitUrl(composer) {
  if (!composer) return Promise.resolve(null);
  if (composer.portrait) return Promise.resolve(composer.portrait);

  return fetchWikiSummary(composer).then(data => {
    if (!data) return null;
    return data.thumbnail?.source || data.originalimage?.source || null;
  });
}

// Mounts an img into `hostEl` once the URL resolves. Bails out if the host
// element has been detached (e.g. the panel re-rendered with a new composer).
export function mountPortrait(hostEl, composer, altText) {
  if (!hostEl) return Promise.resolve();
  return resolvePortraitUrl(composer).then(url => new Promise(resolve => {
    if (!url) return resolve();
    if (!hostEl.isConnected) return resolve();
    if (hostEl.dataset.composerId !== composer.id) return resolve();
    const img = new Image();
    img.alt = altText || composer.name;
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (!hostEl.isConnected) return resolve();
      if (hostEl.dataset.composerId !== composer.id) return resolve();
      hostEl.prepend(img);
      hostEl.classList.add("has-img");
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  }));
}
