// Portrait helpers: initials fallback + lazy fetch from Wikipedia REST API.
// If composer.portrait is set, that wins. Otherwise we look up composer.wiki
// via https://en.wikipedia.org/api/rest_v1/page/summary/{title}.

const cache = new Map();

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
  if (!composer.wiki) return Promise.resolve(null);

  const key = composer.wiki;
  if (cache.has(key)) return cache.get(key);

  const title = encodeURIComponent(key.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;

  const promise = fetch(url, { headers: { accept: "application/json" } })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      if (!data) return null;
      return data.thumbnail?.source || data.originalimage?.source || null;
    })
    .catch(() => null);

  cache.set(key, promise);
  return promise;
}

// Mounts an img into `hostEl` once the URL resolves. Bails out if the host
// element has been detached (e.g. the panel re-rendered with a new composer).
export function mountPortrait(hostEl, composer, altText) {
  if (!hostEl) return;
  resolvePortraitUrl(composer).then(url => {
    if (!url) return;
    if (!hostEl.isConnected) return;
    if (hostEl.dataset.composerId !== composer.id) return;
    const img = new Image();
    img.alt = altText || composer.name;
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (!hostEl.isConnected) return;
      if (hostEl.dataset.composerId !== composer.id) return;
      hostEl.prepend(img);
      hostEl.classList.add("has-img");
    };
    img.onerror = () => {};
    img.src = url;
  });
}
