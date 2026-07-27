// =============================================
// SERVICE WORKER — Backlog Safra v3
// Incrementar CACHE_NAME para forçar atualização
// =============================================
const CACHE_NAME = "backlog-safra-v7";

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

// ---- Periodic Background Sync (Opção B) — lembrete diário de agendamentos ----
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "check-agendamentos") {
    e.waitUntil(_notificarAgendamentosBackground());
  }
});

async function _lerAgendamentosIDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("backlog_safra_db");
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("notif_agendamentos")) { resolve([]); return; }
      const r = db.transaction("notif_agendamentos").objectStore("notif_agendamentos").get("pendentes");
      r.onsuccess = () => resolve(r.result?.lista ?? []);
      r.onerror = () => resolve([]);
    };
    req.onerror = () => resolve([]);
  });
}

async function _notificarAgendamentosBackground() {
  const lista = await _lerAgendamentosIDB();
  if (!lista.length) return;

  const hoje = new Date();
  const hojeStr = [
    String(hoje.getDate()).padStart(2, "0"),
    String(hoje.getMonth() + 1).padStart(2, "0"),
    hoje.getFullYear(),
  ].join("/");

  const pendentes = lista.filter(
    (c) => c.dataAgend?.startsWith(hojeStr) && c.status !== "Retirado" && c.status !== "Parcial",
  ).length;
  if (!pendentes) return;

  await self.registration.showNotification(
    `📅 ${pendentes} agendamento${pendentes > 1 ? "s" : ""} pendente${pendentes > 1 ? "s" : ""} hoje`,
    {
      body: "Abra o app para ver seus agendamentos.",
      icon: "./icon.svg",
      badge: "./icon.svg",
      tag: "agend-resumo-dia",
      data: { tipo: "agendamentos" },
    },
  );
}

// ---- Clique na notificação — abre o app ----
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existente = clients.find((c) => c.url.startsWith(url));
      if (existente) return existente.focus();
      return self.clients.openWindow(url);
    }),
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
