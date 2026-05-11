// =============================================
// SERVICE WORKER — Backlog Safra v1
// Incrementar CACHE_NAME para forçar atualização
// =============================================
const CACHE_NAME = "backlog-safra-v2";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icon.svg",
];

// ---- Instalação: pré-cache dos assets estáticos ----
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          STATIC_ASSETS.map((url) => new Request(url, { cache: "reload" })),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

// ---- Ativação: remove caches antigos ----
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---- Interceptação de requests ----
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Só intercepta GET
  if (request.method !== "GET") return;

  // Só HTTP(S)
  if (!url.protocol.startsWith("http")) return;

  // APIs externas que precisam de rede — deixa passar sem cache
  const networkOnly = [
    "script.google.com", // Google Apps Script — dados da planilha
    "api.imgbb.com", // upload de fotos
    "nominatim.openstreetmap.org", // geocoding
  ];
  if (networkOnly.some((host) => url.hostname === host)) return;

  // Tudo mais (assets locais + CDN Lucide): cache-first, atualiza em background
  e.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return resp;
        })
        .catch(() => cached); // se rede falhar e não tinha cache, retorna undefined
      return cached || networkFetch;
    }),
  );
});
