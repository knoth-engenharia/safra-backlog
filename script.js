// =========================================
// CONFIGURAÇÃO DA API
// =========================================
// URL gerada ao implantar gas/Codigo.gs como App da Web no Google Apps Script
// Ver instruções em gas/Codigo.gs
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbwvgLR9qWWaeogxhlEZFzcOp5MYsFZ4t9KF2cfwqYWrN3TEspa7GRvSjhtRH9LuHCRp/exec";

// Cloudinary — upload de fotos (plano gratuito: 25GB storage)
// Como configurar: ver instruções abaixo de CLOUDINARY_UPLOAD_PRESET
const CLOUDINARY_CLOUD_NAME = "dn8ffld8c"; // ex: "dxyz1234"
const CLOUDINARY_UPLOAD_PRESET = "backlog-safra"; // ex: "backlog_safra"

const COL_CODIGO_OS = "CODIGO_OS";
const COL_DATA_EXEC = "DATA_EXEC";
const COL_OBS_EXEC = "OBS_EXEC";
const COL_TECNICO = "TECNICO_EXEC";
const COL_FOTO = "FOTO_EXEC";
const COL_BAIXA_SITE = "BAIXA_SITE";
const COL_SERIAIS_RET = "SERIAIS_RETIRADOS";
const COL_VISITAS = "VISITAS";
const COL_NO_CONNECT = "NO_CONNECT";
const COL_LAT_EXEC = "LAT_EXEC";
const COL_LNG_EXEC = "LNG_EXEC";
const COL_MSG_ENVIADA = "MSG_ENVIADA";

const POR_PAGINA = 30;
const APP_VERSION = "3.0";

const CODIGOS_QUEBRA = [
  "101 - Endereço Não Localizado",
  "106 - Cliente Ausente",
  "107 - Entrada não autorizada",
  "125 - Cliente Solicitou Reagendamento",
  "301 - Tipo de OS Incorreta",
  "302 - Desistência do Serviço",
  "306 - Cliente não reside no endereço",
  "312 - Cliente não Solicitou Serviço",
  "404 - Cliente se recusa à devolver o equipamento",
  "479 - Cliente alega já ter entregue o equipamento",
];

// =========================================
// UTILITÁRIOS
// =========================================
function toTitleCase(str) {
  if (!str?.trim()) return str || "";
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Lista de técnicos para lookup de nome e para a distribuição de carteira.
// Guardada SEM a coluna SENHA — o app nunca precisa dela depois do login.
const TECNICOS_KEY = "backlog_tecnicos";

function _salvarTecnicosCache(lista) {
  try {
    const limpa = (lista || []).map((t) => ({
      USUARIO: t["USUARIO"] || "",
      NOME: t["NOME"] || "",
      CIDADES: t["CIDADES"] || "",
      ADM: t["ADM"] || "",
    }));
    localStorage.setItem(TECNICOS_KEY, JSON.stringify(limpa));
  } catch {}
}

function _lerTecnicosCache() {
  try {
    return JSON.parse(localStorage.getItem(TECNICOS_KEY)) || [];
  } catch {
    return [];
  }
}

function nomeTecnico(usuario) {
  if (!usuario?.trim()) return "";
  const match = todosOsTecnicos.find(
    (t) =>
      (t["USUARIO"] || "").trim().toLowerCase() ===
      usuario.trim().toLowerCase(),
  );
  if (match?.["NOME"]) return toTitleCase(match["NOME"]);
  return toTitleCase(usuario.replace(/[._]/g, " "));
}

function parseDateBR(str) {
  if (!str) return 0;
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})(?:[\s,]+(\d{2}):(\d{2}))?/);
  if (!m) return 0;
  return new Date(
    +m[3],
    +m[2] - 1,
    +m[1],
    +(m[4] || 0),
    +(m[5] || 0),
  ).getTime();
}

// Normaliza qualquer formato de data (DD/MM/YYYY, ISO, JS toString) para exibição
function formatarData(str, incluirHora = false) {
  if (!str) return "";
  // Já está em DD/MM/YYYY (com ou sem hora)
  const brMatch = str.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2}))?/,
  );
  if (brMatch) {
    const base = `${brMatch[1]}/${brMatch[2]}/${brMatch[3]}`;
    if (incluirHora && brMatch[4] && brMatch[5])
      return `${base} ${brMatch[4]}:${brMatch[5]}`;
    return base;
  }
  // Qualquer outro formato (JS Date.toString, ISO, etc.)
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    if (incluirHora) {
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return str;
  }
}

function renderIcons() {
  if (window.lucide) lucide.createIcons();
}

// =========================================
// REDE — fetch com timeout
// `navigator.onLine` no Android só diz que existe interface de rede, não que
// existe internet. Em sinal fraco o fetch fica pendurado indefinidamente e a
// baixa nunca é salva nem enfileirada. O timeout força o caminho offline.
// =========================================
const FETCH_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 60000; // fotos são maiores — mais folga

async function fetchComTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function ehErroDeRede(e) {
  // AbortError (timeout) ou TypeError (DNS/conexão recusada) = sem internet real
  return e?.name === "AbortError" || e instanceof TypeError;
}

// =========================================
// WHATSAPP
// =========================================
function formatarTelefone(tel) {
  const d = tel.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) return d; // já tem código país
  if (d.length === 11) return "55" + d; // DDD + 9 dígitos
  if (d.length === 10) return "55" + d.slice(0, 2) + "9" + d.slice(2); // DDD + 8 → insere 9
  return "55" + d;
}

function registrarMsgEnviada(contratoId, event) {
  if (event) event.stopPropagation();
  const idx = contratos.findIndex((c) => c.id === contratoId);
  if (idx === -1) return;
  const agora = formatarDataExec();
  contratos[idx] = { ...contratos[idx], msgEnviada: agora };
  salvarContratosIDB(contratos, tecnicoLogado()?.usuario);
  // Persiste na planilha em background
  const contrato = contratos[idx];
  if (navigator.onLine) {
    const fd = new FormData();
    fd.append(
      "payload",
      JSON.stringify({
        sheet: "SAFRA",
        keyCol: "CONTRATO",
        keyVal: contrato.contrato,
        data: { [COL_MSG_ENVIADA]: agora },
      }),
    );
    fetchComTimeout(GAS_URL, { method: "POST", body: fd }).catch(() => {});
  }
  // Atualiza o card na tela sem recarregar tudo
  setTimeout(() => aplicarFiltros(), 150);
}

// ---- SLA ----
function calcularDiasSLA(c) {
  if (
    c.status !== "Pendente" &&
    c.status !== "Quebra" &&
    c.status !== "Parcial"
  )
    return null;
  const refStr = c.status === "Quebra" ? c.dataExec : c.dataPend;
  if (!refStr) return null;
  const m = refStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const ref = new Date(+m[3], +m[2] - 1, +m[1]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.floor((hoje - ref) / 86400000);
  return dias >= 0 ? dias : null;
}

function criarBadgeSLA(c) {
  const dias = calcularDiasSLA(c);
  if (dias === null) return "";
  const cls = dias > 14 ? "sla-critico" : dias > 7 ? "sla-aviso" : "sla-normal";
  const ref = c.status === "Quebra" ? "quebra" : "pendência";
  return `<span class="badge-sla ${cls}" title="${dias} dia(s) desde a ${ref}">⏱ ${dias}d</span>`;
}

// ---- Filtro de período (baseado em DATA_PEND) ----
// ---- Intervalo livre de datas (usado pela lista de contratos) ----
// Os <input type="date"> devolvem ISO "YYYY-MM-DD". Montamos a Date no fuso
// local — `new Date("2026-07-25")` seria interpretado como UTC e voltaria um dia
// em fusos negativos como o nosso.
function isoParaDateLocal(iso, fimDoDia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return null;
  return fimDoDia
    ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
    : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
}

function dataBRParaDate(str) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(str || "");
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

// Filtra por DATA_PEND (entrada no backlog). Intervalo inclusivo nas duas pontas.
function filtrarPorIntervalo(c, ini, fim) {
  if (!ini && !fim) return true;
  const data = dataBRParaDate(c.dataPend);
  if (!data) return false;
  let dIni = isoParaDateLocal(ini, false);
  let dFim = isoParaDateLocal(fim, true);
  // Datas invertidas: assume que a pessoa trocou os campos de lugar
  if (dIni && dFim && dIni > dFim) {
    dIni = isoParaDateLocal(fim, false);
    dFim = isoParaDateLocal(ini, true);
  }
  if (dIni && data < dIni) return false;
  if (dFim && data > dFim) return false;
  return true;
}

// Mantida para o painel admin, que segue com os períodos pré-definidos
function filtrarPorPeriodo(c, periodo) {
  if (!periodo) return true;
  if (!c.dataPend) return false;
  const m = c.dataPend.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return false;
  const data = new Date(+m[3], +m[2] - 1, +m[1]);
  const hoje = new Date();
  if (periodo === "semana") {
    const ini = new Date(hoje);
    ini.setDate(hoje.getDate() - hoje.getDay());
    ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini);
    fim.setDate(ini.getDate() + 6);
    fim.setHours(23, 59, 59, 999);
    return data >= ini && data <= fim;
  }
  if (periodo === "mes") {
    return (
      data.getMonth() === hoje.getMonth() &&
      data.getFullYear() === hoje.getFullYear()
    );
  }
  if (periodo === "mes-anterior") {
    const ma = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return (
      data.getMonth() === ma.getMonth() &&
      data.getFullYear() === ma.getFullYear()
    );
  }
  return true;
}

// ---- Detector de duplicatas ----
function detectarDuplicatas(contrato) {
  const novoEnd = extrairNovoEndereco(contrato.obs2);
  const endRef = (novoEnd || contrato.endereco || "").toLowerCase().trim();
  const nomeRef = (contrato.nome || "").toLowerCase().trim();
  return contratos.filter((c) => {
    if (c.id === contrato.id) return false;
    const ce = extrairNovoEndereco(c.obs2);
    const endC = (ce || c.endereco || "").toLowerCase().trim();
    const nomeC = (c.nome || "").toLowerCase().trim();
    return (
      (endRef.length > 5 && endC === endRef) ||
      (nomeRef.length > 4 && nomeC === nomeRef && c.cidade === contrato.cidade)
    );
  });
}

function criarAlertaDuplicatasHTML(dups) {
  if (!dups.length) return "";
  const items = dups
    .map((d) => {
      const cls = statusParaClasse(d.status);
      return `<li><span class="badge-status badge-${cls} badge-sm">${escHtml(d.status)}</span> <strong>${escHtml(d.contrato)}</strong></li>`;
    })
    .join("");
  return `<div class="alerta-duplicata"><i data-lucide="alert-triangle" class="icon icon-sm"></i> <strong>Atenção:</strong> Mesmo cliente/endereço em outros contratos:<ul class="duplicata-lista">${items}</ul></div>`;
}

// ---- Tentativas de visita ----
function criarVisitasHTML(visitas) {
  if (!visitas?.trim()) return "";
  const lista = visitas
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!lista.length) return "";
  const itens = lista
    .map(
      (v) =>
        `<li class="visita-item"><i data-lucide="clock" class="icon icon-sm"></i> ${escHtml(v)}</li>`,
    )
    .join("");
  return `<div class="detalhe-campo">
    <span class="detalhe-label">Tentativas de visita (${lista.length})</span>
    <ul class="visitas-lista">${itens}</ul>
  </div>`;
}

// =========================================
// GEOLOCALIZAÇÃO — distância até contratos
// =========================================
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatarDistancia(km) {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

function lerCacheGeocode() {
  try {
    return JSON.parse(sessionStorage.getItem(GEOCODE_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function salvarCacheGeocode(cache) {
  try {
    sessionStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// Expande abreviações comuns em endereços brasileiros (com e sem ponto)
function expandirAbreviaturas(end) {
  // Padrão: prefixo (com ou sem ponto) seguido de espaço e letra
  const sub = (re, rep) => end.replace(re, rep);
  end = sub(/\bR\.?\s+(?=[A-ZÀ-ÿ])/gi, "Rua ");
  end = sub(/\bAV\.?\s+(?=[A-ZÀ-ÿ])/gi, "Avenida ");
  end = sub(/\bAL\.?\s+(?=[A-ZÀ-ÿ])/gi, "Alameda ");
  end = sub(/\bTV\.?\s+(?=[A-ZÀ-ÿ])/gi, "Travessa ");
  end = sub(/\bTRAV\.?\s+(?=[A-ZÀ-ÿ])/gi, "Travessa ");
  end = sub(/\bPC\.?\s+(?=[A-ZÀ-ÿ])/gi, "Praça ");
  end = sub(/\bPCA\.?\s+(?=[A-ZÀ-ÿ])/gi, "Praça ");
  end = sub(/\bEST\.?\s+(?=[A-ZÀ-ÿ])/gi, "Estrada ");
  end = sub(/\bROD\.?\s+(?=[A-ZÀ-ÿ])/gi, "Rodovia ");
  end = sub(/\bCONJ\.?\s+(?=[A-ZÀ-ÿ])/gi, "Conjunto ");
  return end;
}

// Remove sufixo "- BAIRRO" comum em dados de telecom: "Rua X, 123 - Jardim Y"
function limparSufixoBairro(end) {
  return end.replace(/\s*-\s*[^,]+$/, "").trim();
}

// Chave de cache usa só a rua (sem número) para maximizar reuso
function enderecoParaChaveGeocode(endereco, cidade) {
  const rua = endereco
    .replace(/,?\s*n[ºo°]?\s*\d+.*/i, "")
    .replace(/,?\s*\d+\s*$/, "")
    .trim();
  return `${rua}, ${cidade}`.toLowerCase();
}

// Throttle: Nominatim exige no máximo 1 req/segundo
let _geocodeLastTs = 0;
async function _geocodeFetch(url) {
  const agora = Date.now();
  const espera = Math.max(0, _geocodeLastTs + 1150 - agora);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  _geocodeLastTs = Date.now();
  return fetch(url, {
    headers: {
      "Accept-Language": "pt-BR,pt",
      "User-Agent": "BacklogSafra/1.0 (internal)",
    },
  });
}

async function geocodificarEndereco(endereco, cidade) {
  const cache = lerCacheGeocode();
  const chave = enderecoParaChaveGeocode(endereco, cidade);
  if (cache[chave]) return cache[chave];

  // Limpa e expande o endereço antes de consultar
  const endLimpo = expandirAbreviaturas(limparSufixoBairro(endereco));

  // Tentativa 1: endereço completo com número + cidade
  const q1 = encodeURIComponent(`${endLimpo}, ${cidade}, Brasil`);
  // Tentativa 2: só rua sem número + cidade (fallback)
  const ruaSemNumero = endLimpo.replace(/,?\s*\d+.*$/, "").trim();
  const q2 = encodeURIComponent(`${ruaSemNumero}, ${cidade}, Brasil`);

  async function tentarGeocode(q) {
    const resp = await _geocodeFetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1&countrycodes=br`,
    );
    const json = await resp.json();
    return json.length > 0
      ? { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) }
      : null;
  }

  try {
    let coords = await tentarGeocode(q1);
    if (!coords) coords = await tentarGeocode(q2);
    if (coords) {
      cache[chave] = coords;
      salvarCacheGeocode(cache);
      return coords;
    }
  } catch {}
  return null;
}

function ativarLocalizacao() {
  if (!navigator.geolocation) {
    mostrarToast("Geolocalização não suportada neste dispositivo.", "erro");
    return;
  }
  const btn = document.getElementById("btn-localizacao");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Localizando...";
  }

  // Limpa cache de geocoding para reprocessar com o novo formato de query
  try {
    sessionStorage.removeItem(GEOCODE_CACHE_KEY);
  } catch {}
  contratoDistancias.clear();

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      atualizarBtnLocalizacao();
      mostrarToast("Localização ativa. Calculando distâncias...", "sucesso");
      aplicarFiltros();
    },
    () => {
      atualizarBtnLocalizacao();
      mostrarToast("Não foi possível obter sua localização.", "erro");
    },
    { timeout: 10000, enableHighAccuracy: true },
  );
}

function atualizarBtnLocalizacao() {
  const btn = document.getElementById("btn-localizacao");
  if (!btn) return;
  btn.disabled = false;
  if (userLocation) {
    btn.textContent = "Localização ativa";
    btn.classList.add("btn-loc-ativo");
  } else {
    btn.textContent = "Localização";
    btn.classList.remove("btn-loc-ativo");
  }
}

function atualizarProgressoGeocode(feito, total) {
  const el = document.getElementById("geocode-progress");
  if (!el) return;
  if (feito >= total) {
    el.classList.add("hidden");
  } else {
    el.textContent = `Calculando distâncias: ${feito}/${total}`;
    el.classList.remove("hidden");
  }
}

async function calcularDistanciasPagina(paginaContratos) {
  if (!userLocation || geocodificandoAtivo) return;
  geocodificandoAtivo = true;
  let houveMudanca = false;
  const cache = lerCacheGeocode();
  const chavesProcessadas = new Set();

  // Conta quantos precisam de requisição HTTP (não estão no cache)
  const pendentes = paginaContratos.filter((c) => {
    const novoEnd = extrairNovoEndereco(c.obs2);
    const chave = enderecoParaChaveGeocode(novoEnd || c.endereco, c.cidade);
    return !contratoDistancias.has(c.id) && !cache[chave];
  });
  let feito = 0;
  const totalPendentes = pendentes.length;
  if (totalPendentes > 0) atualizarProgressoGeocode(0, totalPendentes);

  for (const c of paginaContratos) {
    if (contratoDistancias.has(c.id)) continue;
    const novoEnd = extrairNovoEndereco(c.obs2);
    const end = novoEnd || c.endereco;
    const chave = enderecoParaChaveGeocode(end, c.cidade);

    // Cache hit — instantâneo
    if (cache[chave]) {
      const { lat, lng } = cache[chave];
      contratoDistancias.set(
        c.id,
        haversineKm(userLocation.lat, userLocation.lng, lat, lng),
      );
      houveMudanca = true;
      continue;
    }

    if (!chavesProcessadas.has(chave)) {
      chavesProcessadas.add(chave);
      const coords = await geocodificarEndereco(end, c.cidade);
      if (coords) {
        const km = haversineKm(
          userLocation.lat,
          userLocation.lng,
          coords.lat,
          coords.lng,
        );
        contratoDistancias.set(c.id, km);
        houveMudanca = true;
      }
      feito++;
      atualizarProgressoGeocode(feito, totalPendentes);
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim: 1 req/s
    }
  }

  geocodificandoAtivo = false;
  atualizarProgressoGeocode(totalPendentes, totalPendentes);
  if (houveMudanca) aplicarFiltros();
}

function criarBadgeDistancia(c) {
  if (!userLocation) return "";
  const km = contratoDistancias.get(c.id);
  if (km === undefined)
    return `<span class="badge-dist badge-dist-calc" title="Calculando...">…</span>`;
  return `<span class="badge-dist" title="Distância estimada">${formatarDistancia(km)}</span>`;
}

function filtrarPorDistancia(c, distFiltro) {
  if (!distFiltro || distFiltro === "mais-perto" || !userLocation) return true;
  const km = contratoDistancias.get(c.id);
  if (km === undefined) return true; // ainda não geocodificado — inclui por padrão
  const limites = { "500m": 0.5, "1km": 1, "5km": 5, "10km": 10 };
  return km <= (limites[distFiltro] ?? Infinity);
}

// =========================================
// MONTAGEM DE ROTA
// =========================================
function toggleModoRota() {
  modoRota = !modoRota;
  if (!modoRota) rotaSelecionados.clear();
  const btn = document.getElementById("btn-montar-rota");
  if (btn) {
    btn.classList.toggle("btn-acao-ativo", modoRota);
    btn.textContent = modoRota ? "Cancelar rota" : "Rota";
  }
  if (modoRota)
    mostrarToast("Toque nos contratos para adicionar à rota.", "aviso");
  atualizarBarraRota();
  aplicarFiltros();
}

function toggleSelecaoRota(id, event) {
  event.stopPropagation();
  if (rotaSelecionados.has(id)) {
    rotaSelecionados.delete(id);
  } else {
    if (rotaSelecionados.size >= 9) {
      mostrarToast(
        "Máximo de 9 paradas por rota (limite do Google Maps).",
        "aviso",
      );
      return;
    }
    rotaSelecionados.add(id);
  }
  const el = document.getElementById(`cartao-${id}`);
  if (el) {
    el.classList.toggle("cartao-na-rota", rotaSelecionados.has(id));
    // Atualiza o ícone do indicador
    const ind = el.querySelector(".rota-indicador");
    if (ind) {
      ind.classList.toggle("rota-selecionado", rotaSelecionados.has(id));
      ind.innerHTML = rotaSelecionados.has(id)
        ? `<i data-lucide="check-circle" class="icon icon-sm"></i>`
        : `<i data-lucide="circle" class="icon icon-sm"></i>`;
      renderIcons();
    }
  }
  atualizarBarraRota();
}

function atualizarBarraRota() {
  const barra = document.getElementById("barra-rota");
  if (!barra) return;
  if (!modoRota) {
    barra.classList.add("hidden");
    return;
  }
  barra.classList.remove("hidden");
  const n = rotaSelecionados.size;
  const info =
    n === 0
      ? "Nenhum contrato selecionado"
      : `${n} parada${n > 1 ? "s" : ""} na rota`;
  barra.innerHTML = `
    <button class="btn-cancelar-rota" onclick="toggleModoRota()" title="Cancelar rota"><i data-lucide="x" class="icon icon-sm"></i></button>
    <span class="barra-rota-info">${info}</span>
    <button class="btn-abrir-rota" onclick="abrirRotaMaps()" ${n < 1 ? "disabled" : ""}><i data-lucide="map" class="icon icon-sm"></i> Abrir no Maps</button>`;
  renderIcons();
}

function abrirRotaMaps() {
  const selecionados = contratos.filter((c) => rotaSelecionados.has(c.id));
  if (!selecionados.length) return;
  const enderecos = selecionados.map((c) => {
    const novoEnd = extrairNovoEndereco(c.obs2);
    return encodeURIComponent(`${novoEnd || c.endereco}, ${c.cidade}`);
  });
  const url =
    enderecos.length === 1
      ? `https://www.google.com/maps/search/?api=1&query=${enderecos[0]}`
      : `https://www.google.com/maps/dir/${enderecos.join("/")}`;
  window.open(url, "_blank");
}

// =========================================
// AGRUPAMENTO POR RUA
// =========================================
function toggleAgrupamento() {
  modoAgrupamento = modoAgrupamento === "rua" ? "" : "rua";
  const btn = document.getElementById("btn-agrupar");
  if (btn) btn.classList.toggle("btn-acao-ativo", modoAgrupamento === "rua");
  const sortSel = document.getElementById("sort-rua");
  if (sortSel) sortSel.classList.toggle("hidden", modoAgrupamento !== "rua");
  if (modoAgrupamento !== "rua") sortRua = "az";
  aplicarFiltros();
}

function alterarSortRua(valor) {
  sortRua = valor;
  aplicarFiltros();
}

function alterarSortQntd(valor) {
  sortQntd = valor;
  aplicarFiltros();
}

function extrairNomeRua(endereco) {
  if (!endereco) return "Sem endereço";
  // Tudo antes do primeiro número de casa ou vírgula
  const m = endereco.match(/^([^,\d]+)/);
  return m ? m[1].trim() : endereco;
}

async function registrarTentativa() {
  const btns = document.querySelectorAll("#acoes-modal .btn");
  btns.forEach((b) => (b.disabled = true));
  const data = formatarDataExec();
  const visitasAnt = contratoAtivo.visitas || "";
  const novas = visitasAnt ? `${visitasAnt}|${data}` : data;
  const aplicarLocal = () => {
    const idx = contratos.findIndex((c) => c.id === contratoAtivo.id);
    if (idx !== -1) {
      contratos[idx] = { ...contratos[idx], visitas: novas };
      contratoAtivo = contratos[idx];
    }
  };
  try {
    await salvarNaPlanilha(contratoAtivo, { [COL_VISITAS]: novas });
    aplicarLocal();
    mostrarToast("Tentativa de visita registrada.", "sucesso");
    abrirModal(contratoAtivo);
  } catch (e) {
    // Offline não é erro: a tentativa FOI enfileirada e sobe ao reconectar.
    // Dizer "erro, tente novamente" fazia o técnico repetir uma ação que deu certo.
    if (e instanceof OfflineError) {
      aplicarLocal();
      salvarContratosIDB(contratos, tecnicoLogado()?.usuario);
      atualizarIndicadorOffline();
      mostrarToast(
        "Sem conexão. Tentativa salva no aparelho e será enviada ao reconectar.",
        "aviso",
      );
      abrirModal(contratoAtivo);
      return;
    }
    console.error("Erro ao registrar tentativa:", e);
    mostrarToast("Erro ao salvar. Tente novamente.", "erro");
    btns.forEach((b) => (b.disabled = false));
  }
}

let _toastTimer = null;
function mostrarToast(msg, tipo = "sucesso") {
  const el = document.getElementById("toast");
  if (!el) return;
  clearTimeout(_toastTimer);
  el.innerHTML = msg;
  el.className = `toast toast-${tipo}`;
  _toastTimer = setTimeout(
    () => {
      el.classList.add("toast-saindo");
      setTimeout(() => {
        el.className = "toast hidden";
      }, 300);
    },
    tipo === "erro" ? 5000 : 3500,
  );
}

// =========================================
// AUTENTICAÇÃO
// Usa aba "TECNICOS" na planilha (colunas: USUARIO, SENHA, NOME)
// =========================================
const SESSAO_KEY = "backlog_tecnico";

function tecnicoLogado() {
  try {
    return JSON.parse(localStorage.getItem(SESSAO_KEY));
  } catch {
    return null;
  }
}

function salvarSessao(tecnico) {
  localStorage.setItem(SESSAO_KEY, JSON.stringify(tecnico));
}

function encerrarSessao() {
  pararHeartbeat();
  cancelarNotificacoes();
  localStorage.removeItem(SESSAO_KEY);
  location.reload();
}

// =========================================
// HEARTBEAT DE PRESENÇA
// =========================================
const HEARTBEAT_INTERVALO = 5 * 60 * 1000; // 5 min
let _heartbeatTimer = null;

function tsAgora() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function enviarHeartbeat(isLogin = false) {
  const { usuario } = tecnicoLogado() || {};
  if (!usuario) return;
  const fd = new FormData();
  fd.append(
    "payload",
    JSON.stringify({
      action: "heartbeat",
      usuario,
      ts: tsAgora(),
      isLogin,
    }),
  );
  fetchComTimeout(GAS_URL, { method: "POST", body: fd }).catch(() => {});
}

function iniciarHeartbeat() {
  enviarHeartbeat(true); // marca o login
  _heartbeatTimer = setInterval(() => {
    if (document.visibilityState === "visible") enviarHeartbeat();
  }, HEARTBEAT_INTERVALO);
  document.addEventListener("visibilitychange", _aoVoltar);
}

function _aoVoltar() {
  if (document.visibilityState === "visible") enviarHeartbeat();
}

function pararHeartbeat() {
  clearInterval(_heartbeatTimer);
  document.removeEventListener("visibilitychange", _aoVoltar);
}

// =========================================
// NOTIFICAÇÕES DE AGENDAMENTO
// =========================================
let _timersNotificacao = [];

function cancelarNotificacoes() {
  _timersNotificacao.forEach(clearTimeout);
  _timersNotificacao = [];
}

async function pedirPermissaoNotificacao() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

function _dispararNotificacao(titulo, corpo, tag) {
  if (Notification.permission !== "granted") return;
  navigator.serviceWorker.ready
    .then((reg) =>
      reg.showNotification(titulo, {
        body: corpo,
        icon: "./icon.svg",
        badge: "./icon.svg",
        tag: `agend-${tag}`,
        requireInteraction: true,
        data: { contratoId: tag },
      }),
    )
    .catch(
      () => new Notification(titulo, { body: corpo, tag: `agend-${tag}` }),
    );
}

// Checkpoints fixos do dia (horas)
const NOTIF_CHECKPOINTS = [8, 10, 12, 15, 17];

function _contarAgendadosPendentesHoje(usuario) {
  const usuarioLow = usuario.trim().toLowerCase();
  const hoje = new Date();
  const hojeStr = [
    String(hoje.getDate()).padStart(2, "0"),
    String(hoje.getMonth() + 1).padStart(2, "0"),
    hoje.getFullYear(),
  ].join("/");
  return contratos.filter(
    (c) =>
      c.obs1?.trim().toUpperCase() === "AGENDADO" &&
      c.tecnicoDesig?.trim().toLowerCase() === usuarioLow &&
      c.dataAgend?.startsWith(hojeStr) &&
      c.status !== "Retirado" &&
      c.status !== "Parcial",
  ).length;
}

async function agendarNotificacoesHoje() {
  const permitido = await pedirPermissaoNotificacao();
  cancelarNotificacoes();

  const { usuario } = tecnicoLogado() || {};
  if (!usuario) return;

  // Persiste agendamentos no IDB para o SW (periodic sync)
  const usuarioLow = usuario.trim().toLowerCase();
  const hoje = new Date();
  const hojeStr = [
    String(hoje.getDate()).padStart(2, "0"),
    String(hoje.getMonth() + 1).padStart(2, "0"),
    hoje.getFullYear(),
  ].join("/");
  const agendadosHoje = contratos.filter(
    (c) =>
      c.obs1?.trim().toUpperCase() === "AGENDADO" &&
      c.tecnicoDesig?.trim().toLowerCase() === usuarioLow &&
      c.dataAgend?.startsWith(hojeStr),
  );
  salvarAgendamentosNotifIDB(
    agendadosHoje.map((c) => ({
      id: c.id,
      dataAgend: c.dataAgend || "",
      status: c.status,
    })),
  );

  _registrarPeriodicSync();

  if (!permitido || !agendadosHoje.length) return;

  // Agenda um lembrete em cada checkpoint futuro do dia
  NOTIF_CHECKPOINTS.forEach((hora) => {
    const dt = new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      hoje.getDate(),
      hora,
      0,
      0,
    );
    const ms = dt.getTime() - Date.now();
    if (ms <= 0) return; // checkpoint já passou hoje
    _timersNotificacao.push(
      setTimeout(() => {
        const pendentes = _contarAgendadosPendentesHoje(usuario);
        if (!pendentes) return;
        _dispararNotificacao(
          `📅 ${pendentes} agendamento${pendentes > 1 ? "s" : ""} pendente${pendentes > 1 ? "s" : ""} hoje`,
          "Abra o app para ver seus agendamentos.",
          `checkpoint-${hora}h`,
        );
      }, ms),
    );
  });
}

function _registrarPeriodicSync() {
  if (
    !("serviceWorker" in navigator) ||
    !("periodicSync" in ServiceWorkerRegistration.prototype)
  )
    return;
  navigator.serviceWorker.ready.then((reg) => {
    navigator.permissions
      .query({ name: "periodic-background-sync" })
      .then((status) => {
        if (status.state === "granted") {
          reg.periodicSync
            .register("check-agendamentos", { minInterval: 8 * 60 * 60 * 1000 }) // 8h
            .catch(() => {});
        }
      })
      .catch(() => {});
  });
}

// =========================================
// GEOLOCALIZAÇÃO DE EXECUÇÃO
// =========================================
async function capturarGeolocalizacao() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), 3000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 },
    );
  });
}

// ---- Tempo relativo legível ----
function tempoRelativo(str) {
  if (!str?.trim()) return "Nunca";
  const ts = parseDateBR(str);
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "Agora mesmo";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

function statusPresenca(str) {
  if (!str?.trim()) return "nunca";
  const ts = parseDateBR(str);
  if (!ts) return "nunca";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 6) return "online";
  if (min < 30) return "recente";
  if (min < 480) return "ausente";
  return "offline";
}

async function tentarLogin() {
  const usuario = document
    .getElementById("login-usuario")
    .value.trim()
    .toLowerCase();
  const senha = document.getElementById("login-senha").value;
  const erro = document.getElementById("login-erro");
  const btn = document.getElementById("btn-entrar");

  if (!usuario || !senha) {
    erro.textContent = "Preencha usuário e senha.";
    erro.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Verificando...";
  erro.classList.add("hidden");

  try {
    const resp = await fetchComTimeout(`${GAS_URL}?sheet=TECNICOS`);
    const respJson = await resp.json();
    const lista = respJson.data ?? [];

    todosOsTecnicos = lista; // armazena para lookup de nomes
    _salvarTecnicosCache(lista); // versão sem SENHA, sobrevive ao reload
    const match = lista.find(
      (u) =>
        u["USUARIO"]?.trim().toLowerCase() === usuario &&
        u["SENHA"]?.trim() === senha,
    );

    if (match) {
      btn.textContent = "Entrando...";

      const cidadesRaw = match["CIDADES"]?.trim() || "TODOS";
      const cidades =
        cidadesRaw.toUpperCase() === "TODOS"
          ? null // null = acesso a todas as cidades
          : cidadesRaw
              .split(/[,;]/)
              .map((c) => c.trim())
              .filter(Boolean);
      const adm = match["ADM"]?.trim().toUpperCase() === "SIM";

      salvarSessao({
        usuario: match["USUARIO"],
        nome: match["NOME"] || match["USUARIO"],
        cidades,
        adm,
      });
      iniciarApp();
    } else {
      erro.textContent = "Usuário ou senha incorretos.";
      erro.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  } catch {
    erro.textContent = "Erro de conexão. Tente novamente.";
    erro.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
}

// =========================================
// MAPEAMENTO DAS COLUNAS
// =========================================
function mapearContrato(linha, indice) {
  return {
    id: linha["CONTRATO"] || String(indice),
    nome: toTitleCase(linha["NOME_TITULAR"]) || "—",
    contrato: linha["CONTRATO"] || "—",
    cidade: toTitleCase(linha["NM_CIDADE"]) || "—",
    bairro: toTitleCase(linha["BAIRRO"]) || "—",
    endereco: toTitleCase(linha["ENDEREÇO"]) || "—",
    dataPend: formatarData(linha["DATA_PEND"] || ""),
    baixaSite: linha[COL_BAIXA_SITE] || "",
    obs1: linha["OBS 1"] || "",
    obs2: linha["OBS 2"] || "",
    telefone: linha["TELEFONE"] || "",
    telComercial: linha["TELCOMERCIAL"] || "",
    outros: linha["OUTROS"] || "",
    telCelular: linha["TELCEL"] || "",
    cluster: linha["NM_CLUSTER"] || "",
    subcluster: linha["NM_SUBCLUSTER"] || "",
    base: linha["BASE"] || "",
    quantidade: linha["QNTD"] || "",
    terminais: linha["TERMINAIS"] || "",
    tipoDesconexao: linha["DS_TIPO_DESCONEXAO"] || "",
    codigoOS: linha[COL_CODIGO_OS] || "",
    dataExec: formatarData(linha[COL_DATA_EXEC] || "", true),
    obsExec: linha[COL_OBS_EXEC] || "",
    tecnicoExec: linha[COL_TECNICO] || "",
    fotoExec: linha[COL_FOTO] || "",
    seriaisRet: linha[COL_SERIAIS_RET] || "",
    visitas: linha[COL_VISITAS] || "",
    latExec: linha[COL_LAT_EXEC] || "",
    lngExec: linha[COL_LNG_EXEC] || "",
    dataAgend: formatarData(linha["DATA"] || ""),
    horario: linha["HORARIO"] || "",
    tecnicoDesig: linha["TECNICO_DESIG"] || "",
    status: linha["STATUS"] || "Pendente",
    noConnect: linha[COL_NO_CONNECT] || "",
    texto1: linha["TEXTO 1"] || "",
    msgEnviada: linha[COL_MSG_ENVIADA] || "",
  };
}

// =========================================
// ESTADO DA APLICAÇÃO
// =========================================
// =========================================
// MODO OFFLINE — IndexedDB + fila de baixas
// =========================================
class OfflineError extends Error {}

const IDB_NAME = "backlog_safra_db";
const IDB_VERSION = 3;

function abrirIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("contratos_cache")) {
        db.createObjectStore("contratos_cache", { keyPath: "chave" });
      }
      if (!db.objectStoreNames.contains("pending_baixas")) {
        db.createObjectStore("pending_baixas", { autoIncrement: true });
      }
      // v2: agendamentos do dia para o SW disparar notificações
      if (!db.objectStoreNames.contains("notif_agendamentos")) {
        db.createObjectStore("notif_agendamentos", { keyPath: "chave" });
      }
      // v3: fotos de evidência aguardando upload — sobrevivem a queda de sinal
      // e a kills de memória do Android
      if (!db.objectStoreNames.contains("pending_fotos")) {
        db.createObjectStore("pending_fotos", { autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function salvarAgendamentosNotifIDB(lista) {
  try {
    const db = await abrirIDB();
    const tx = db.transaction("notif_agendamentos", "readwrite");
    tx.objectStore("notif_agendamentos").put({
      chave: "pendentes",
      lista,
      ts: Date.now(),
    });
  } catch {}
}

async function salvarContratosIDB(lista, usuario) {
  try {
    const db = await abrirIDB();
    const tx = db.transaction("contratos_cache", "readwrite");
    tx.objectStore("contratos_cache").put({
      chave: `data_${usuario || "default"}`,
      lista,
      ts: Date.now(),
    });
  } catch {}
}

async function lerContratosIDB(usuario) {
  try {
    const db = await abrirIDB();
    return new Promise((resolve) => {
      const req = db
        .transaction("contratos_cache")
        .objectStore("contratos_cache")
        .get(`data_${usuario || "default"}`);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) {
          resolve(null);
          return;
        }
        // TTL de 4 horas — evita trabalhar com dados muito desatualizados
        const MAX_AGE = 4 * 60 * 60 * 1000;
        if (Date.now() - (record.ts || 0) > MAX_AGE) {
          resolve(null);
          return;
        }
        resolve(record.lista ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function enfileirarBaixa(contratoId, campos) {
  try {
    const db = await abrirIDB();
    const tx = db.transaction("pending_baixas", "readwrite");
    tx.objectStore("pending_baixas").add({
      contratoId,
      campos,
      ts: Date.now(),
    });
  } catch {}
}

// Grava as fotos no IDB ANTES de qualquer tentativa de rede. Retorna a chave
// para removê-las quando o upload confirmar. Enquanto estiverem aqui, a
// evidência sobrevive a queda de sinal, fechamento do app e kill de memória.
async function enfileirarFotos(contratoId, arquivos) {
  if (!arquivos?.length) return null;
  try {
    const db = await abrirIDB();
    return await new Promise((resolve) => {
      const tx = db.transaction("pending_fotos", "readwrite");
      const req = tx
        .objectStore("pending_fotos")
        .add({ contratoId, blobs: arquivos, ts: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function removerFotosDaFila(idbKey) {
  if (idbKey === null || idbKey === undefined) return;
  try {
    const db = await abrirIDB();
    const tx = db.transaction("pending_fotos", "readwrite");
    tx.objectStore("pending_fotos").delete(idbKey);
  } catch {}
}

async function _contarStore(store) {
  try {
    const db = await abrirIDB();
    return await new Promise((resolve) => {
      const req = db.transaction(store).objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

const contarFilaBaixas = () => _contarStore("pending_baixas");
const contarFilaFotos = () => _contarStore("pending_fotos");

function _lerStore(db, store) {
  return new Promise((resolve) => {
    const lista = [];
    const req = db.transaction(store).objectStore(store).openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        // idbKey por último: o registro salvo não pode sobrescrever a chave real
        lista.push({ ...cursor.value, idbKey: cursor.primaryKey });
        cursor.continue();
      } else {
        resolve(lista);
      }
    };
    req.onerror = () => resolve([]);
  });
}

const lerFilaBaixas = (db) => _lerStore(db, "pending_baixas");
const lerFilaFotos = (db) => _lerStore(db, "pending_fotos");

// Falha permanente (não é rede): conta a tentativa e descarta após MAX_TENTATIVAS
// para o item não travar a fila — e o indicador — indefinidamente.
const MAX_TENTATIVAS_FILA = 5;

async function _registrarFalhaFila(store, item) {
  try {
    const db = await abrirIDB();
    const { idbKey, ...registro } = item;
    const tentativas = (registro.tentativas || 0) + 1;
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    if (tentativas >= MAX_TENTATIVAS_FILA) {
      os.delete(idbKey);
      return true; // descartado
    }
    os.put({ ...registro, tentativas }, idbKey);
  } catch {}
  return false;
}

// POST cru no GAS — usado pelo salvamento normal e pelos processadores de fila
async function _postCampos(contratoId, campos) {
  const fd = new FormData();
  fd.append(
    "payload",
    JSON.stringify({
      sheet: "SAFRA",
      keyCol: "CONTRATO",
      keyVal: contratoId,
      data: campos,
    }),
  );
  const resp = await fetchComTimeout(GAS_URL, { method: "POST", body: fd });
  if (!resp.ok) throw new Error(`Erro HTTP ${resp.status}`);
  const json = await resp.json().catch(() => ({}));
  if (json.error) throw new Error(json.error);
}

let _sincronizando = false;

async function processarFilaBaixas() {
  if (!navigator.onLine || _sincronizando) return;
  const db = await abrirIDB().catch(() => null);
  if (!db) return;
  _sincronizando = true;
  try {
    const items = await lerFilaBaixas(db);

    let successes = 0;
    let descartadas = 0;
    for (const item of items) {
      try {
        await _postCampos(item.contratoId, item.campos);
        await new Promise((res) => {
          const tx = db.transaction("pending_baixas", "readwrite");
          tx.objectStore("pending_baixas").delete(item.idbKey);
          tx.oncomplete = res;
          tx.onerror = res; // continua mesmo se delete falhar
        });
        successes++;
      } catch (e) {
        // Sem internet real: para o loop, tenta tudo de novo na próxima vez
        if (ehErroDeRede(e)) break;
        if (await _registrarFalhaFila("pending_baixas", item)) descartadas++;
      }
    }

    // Fotos só depois das baixas — o FOTO_EXEC vai na mesma linha
    const fotosOk = await processarFilaFotos();

    if (successes > 0) {
      mostrarToast(
        `${successes} baixa${successes > 1 ? "s" : ""} sincronizada${successes > 1 ? "s" : ""} com sucesso.`,
        "sucesso",
      );
      carregarContratos(); // Atualiza lista com dados reais
    }
    if (fotosOk > 0) {
      mostrarToast(
        `${fotosOk} envio${fotosOk > 1 ? "s" : ""} de fotos concluído${fotosOk > 1 ? "s" : ""}.`,
        "sucesso",
      );
    }
    if (descartadas > 0) {
      mostrarToast(
        `${descartadas} baixa${descartadas > 1 ? "s" : ""} não pôde ser enviada após várias tentativas. Refaça pelo app.`,
        "erro",
      );
    }
  } finally {
    _sincronizando = false;
    atualizarIndicadorOffline();
  }
}

// Sobe as fotos que ficaram na fila (offline ou upload falhado) e grava a URL.
// Só remove do IDB depois que o FOTO_EXEC foi confirmado na planilha.
async function processarFilaFotos() {
  if (!navigator.onLine) return 0;
  if (CLOUDINARY_CLOUD_NAME === "SEU_CLOUD_NAME") return 0;
  const db = await abrirIDB().catch(() => null);
  if (!db) return 0;
  const items = await lerFilaFotos(db);
  if (!items.length) return 0;

  let ok = 0;
  for (const item of items) {
    try {
      const url = await uploadTodasFotos(item.blobs);
      if (!url) {
        await removerFotosDaFila(item.idbKey); // entrada vazia — descarta
        continue;
      }
      await _postCampos(item.contratoId, { [COL_FOTO]: url });
      await removerFotosDaFila(item.idbKey);
      const idx = contratos.findIndex((c) => c.contrato === item.contratoId);
      if (idx !== -1) contratos[idx].fotoExec = url;
      ok++;
    } catch (e) {
      if (ehErroDeRede(e)) break; // sem internet real — tenta tudo depois
      if (await _registrarFalhaFila("pending_fotos", item)) {
        mostrarToast(
          `Fotos do contrato ${escHtml(item.contratoId)} não puderam ser enviadas. Refaça a foto pelo app.`,
          "erro",
        );
      }
    }
  }
  if (ok > 0) salvarContratosIDB(contratos, tecnicoLogado()?.usuario);
  return ok;
}

async function atualizarIndicadorOffline() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  const elP = document.getElementById("offline-pendentes");
  const elT = document.getElementById("offline-texto");
  const elI = document.getElementById("offline-icone");

  const [nBaixas, nFotos] = await Promise.all([
    contarFilaBaixas(),
    contarFilaFotos(),
  ]);
  const partes = [];
  if (nBaixas > 0) partes.push(`${nBaixas} baixa${nBaixas > 1 ? "s" : ""}`);
  if (nFotos > 0) partes.push(`${nFotos} foto${nFotos > 1 ? "s" : ""}`);
  const resumo = partes.join(" e ");

  const setIcone = (nome) => {
    if (elI) elI.innerHTML = `<i data-lucide="${nome}" class="icon"></i>`;
  };

  if (!navigator.onLine) {
    banner.classList.remove("hidden", "offline-banner-pendente");
    setIcone("wifi-off");
    if (elT) elT.textContent = "Modo offline";
    if (elP) elP.textContent = resumo ? ` · ${resumo} na fila` : "";
  } else if (resumo) {
    // Online mas ainda há pendências — o técnico precisa saber antes de
    // encerrar o dia achando que tudo subiu
    banner.classList.remove("hidden");
    banner.classList.add("offline-banner-pendente");
    setIcone("cloud-upload");
    if (elT) elT.textContent = "Enviando";
    if (elP) elP.textContent = ` · ${resumo} na fila`;
  } else {
    banner.classList.add("hidden");
    banner.classList.remove("offline-banner-pendente");
    return;
  }
  renderIcons();
}

// =========================================
// ESTADO DA APLICAÇÃO
// =========================================
let contratos = [];
let contratoAtivo = null;
let todosOsTecnicos = []; // populado no login
let _connectCampos = []; // campos do último Connect aberto (para copiarTudoConnect)
let _fotoArquivos = []; // fotos acumuladas de câmera + galeria
let paginaAtual = 1;

// Geolocalização
let userLocation = null; // { lat, lng }
let contratoDistancias = new Map(); // id → km
let geocodificandoAtivo = false;
const GEOCODE_CACHE_KEY = "geocode_cache_v1";

// Rota
let modoRota = false;
let rotaSelecionados = new Set(); // Set de contrato.id

// Agrupamento
let modoAgrupamento = ""; // "" | "rua"
let sortRua = "az"; // "az" | "mais" | "menos"
let sortQntd = ""; // "" | "mais" | "menos"

// Admin histórico sub-view
let histSubView = "lista"; // "lista" | "dia"

// Contador de operações em background — mostra/oculta #loading-bar
let _loadingCount = 0;
function _setCarregando(delta) {
  _loadingCount = Math.max(0, _loadingCount + delta);
  document
    .getElementById("loading-bar")
    ?.classList.toggle("ativo", _loadingCount > 0);
}

// =========================================
// INICIALIZAÇÃO
// =========================================
document.addEventListener("DOMContentLoaded", () => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("./sw.js").catch(() => {}),
    );
  }
  const elVer = document.getElementById("header-versao");
  if (elVer) elVer.textContent = `v${APP_VERSION}`;
  renderIcons();
  const tecnico = tecnicoLogado();
  if (tecnico) {
    iniciarApp();
  } else {
    mostrarTelaLogin();
  }
});

// Quando a página é restaurada do bfcache (ex: ao voltar da câmera no Android)
// sem precisar recarregar tudo — dados já estão em contratos[]
window.addEventListener("pageshow", (e) => {
  if (e.persisted && tecnicoLogado() && contratos.length > 0) {
    renderIcons(); // Re-render ícones que podem ter sumido
  }
});

function mostrarTelaLogin() {
  document.getElementById("tela-login").classList.remove("hidden");
  document.getElementById("app-principal").classList.add("hidden");
  document.getElementById("header-user").classList.add("hidden");
  document.getElementById("btn-entrar").addEventListener("click", tentarLogin);
  document.getElementById("login-senha").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tentarLogin();
  });
}

function iniciarApp() {
  const tecnico = tecnicoLogado();
  document.getElementById("tela-login").classList.add("hidden");
  document.getElementById("app-principal").classList.remove("hidden");
  document.getElementById("header-user").classList.remove("hidden");
  document.getElementById("header-nome-tecnico").textContent = tecnico.nome;
  if (tecnico.adm) {
    document.getElementById("btn-admin").classList.remove("hidden");
  }
  document
    .getElementById("btn-logout")
    .addEventListener("click", encerrarSessao);

  // Listeners de conectividade
  window.addEventListener("online", () => {
    mostrarToast("Conexão restaurada!", "sucesso");
    atualizarIndicadorOffline();
    processarFilaBaixas();
  });
  window.addEventListener("offline", () => {
    mostrarToast("Sem conexão. Baixas serão salvas localmente.", "aviso");
    atualizarIndicadorOffline();
  });

  // Mostra botão "Histórico" para técnicos não-admin
  if (!tecnico.adm) {
    document.getElementById("btn-meu-historico").classList.remove("hidden");
  }

  // Reabrir o app também tenta esvaziar a fila — não depende do evento "online",
  // que não dispara se o app foi fechado enquanto estava sem sinal
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) processarFilaBaixas();
  });

  // Sessão salva não passa pelo login: reidrata a lista de técnicos do cache
  // para nomeTecnico() e a aba Distribuir continuarem funcionando após reload
  if (!todosOsTecnicos.length) todosOsTecnicos = _lerTecnicosCache();

  configurarEventos();
  atualizarIndicadorOffline();
  processarFilaBaixas();
  iniciarHeartbeat();
  carregarContratos();
}

// =========================================
// COMUNICAÇÃO COM A API
// =========================================
function _filtrarContratosPermitidos(lista) {
  const { cidades, usuario, adm } = tecnicoLogado() || {};
  const usuarioLow = usuario?.trim().toLowerCase() || "";
  const ehAgendadoParaMim = (c) =>
    c.obs1?.trim().toUpperCase() === "AGENDADO" &&
    c.tecnicoDesig?.trim().toLowerCase() === usuarioLow;
  let resultado = lista;
  if (cidades) {
    const permitidas = cidades.map((c) => c.toLowerCase());
    resultado = resultado.filter(
      (c) =>
        permitidas.includes(c.cidade.toLowerCase()) ||
        (!adm && ehAgendadoParaMim(c)),
    );
  }
  if (!adm) {
    resultado = resultado.filter(
      (c) =>
        c.obs1?.trim().toUpperCase() !==
        "CLIENTE SOLICITA RETIRADA EM OUTRO ENDEREÇO",
    );
  }
  return resultado;
}

async function carregarContratos() {
  const { usuario } = tecnicoLogado() || {};

  // Mostra cache IDB imediatamente — evita tela em branco ao voltar da câmera
  const cached = await lerContratosIDB(usuario);
  if (cached?.length) {
    contratos = cached;
    preencherFiltros();
    renderizarLista(contratos);
    _tentarRestaurarModal();
    _refreshContratosSilencioso(usuario); // atualiza em background sem spinner
    return;
  }

  // Sem cache: exibe loading e busca normalmente
  mostrarCarregando();
  await _fetchContratos(usuario, false);
}

async function _fetchContratos(usuario, silencioso) {
  _setCarregando(+1);
  try {
    const tecnico = tecnicoLogado();
    let url = `${GAS_URL}?sheet=SAFRA`;
    // Técnicos com cidades definidas: GAS filtra server-side antes de enviar
    if (tecnico?.cidades?.length) {
      url += `&usuario=${encodeURIComponent(tecnico.usuario)}&cidades=${encodeURIComponent(tecnico.cidades.join(","))}`;
    }
    const resposta = await fetchComTimeout(url);
    if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status}`);
    const resJson = await resposta.json();
    if (resJson.error) throw new Error(resJson.error);
    const dados = resJson.data ?? [];
    if (!Array.isArray(dados) || dados.length === 0) {
      if (!silencioso) mostrarVazio("Nenhum contrato encontrado na planilha.");
      return;
    }
    const novos = _filtrarContratosPermitidos(dados.map(mapearContrato));
    contratos = novos;
    salvarContratosIDB(contratos, usuario);
    preencherFiltros();
    renderizarLista(contratos);
    agendarNotificacoesHoje();
    if (!silencioso) _tentarRestaurarModal();
  } catch (erro) {
    if (silencioso) return; // falha silenciosa — o cache já está na tela
    console.error("Erro ao carregar contratos:", erro);
    const cached = await lerContratosIDB(usuario);
    if (cached?.length) {
      contratos = cached;
      atualizarIndicadorOffline();
      preencherFiltros();
      renderizarLista(contratos);
    } else {
      mostrarErro(
        "Sem conexão e sem cache disponível. Verifique sua internet.",
      );
    }
  } finally {
    _setCarregando(-1);
  }
}

function _refreshContratosSilencioso(usuario) {
  _fetchContratos(usuario, true);
}

async function salvarNaPlanilha(contrato, campos) {
  if (!navigator.onLine) {
    await enfileirarBaixa(contrato.contrato, campos);
    throw new OfflineError("Sem conexão — baixa enfileirada");
  }
  _setCarregando(+1);
  try {
    await _postCampos(contrato.contrato, campos);
  } catch (e) {
    // Timeout ou falha de conexão: `navigator.onLine` mentiu (sinal fraco).
    // Trata como offline em vez de perder a baixa.
    if (ehErroDeRede(e)) {
      await enfileirarBaixa(contrato.contrato, campos);
      throw new OfflineError("Conexão instável — baixa enfileirada");
    }
    throw e;
  } finally {
    _setCarregando(-1);
  }
}

function formatarDataExec() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// =========================================
// FILTROS — persistência no localStorage
// =========================================
const FILTROS_KEY = "backlog_filtros";

function lerFiltrosSalvos() {
  try {
    return JSON.parse(localStorage.getItem(FILTROS_KEY)) || {};
  } catch {
    return {};
  }
}

function salvarFiltros() {
  const f = {
    busca: document.getElementById("search").value,
    cidade: document.getElementById("filter-cidade").value,
    bairro: document.getElementById("filter-bairro").value,
    status: document.getElementById("filter-status").value,
    tipo: document.getElementById("filter-tipo").value,
    tecnico: document.getElementById("filter-tecnico").value,
    dataIni: document.getElementById("filter-data-ini")?.value || "",
    dataFim: document.getElementById("filter-data-fim")?.value || "",
    distancia: document.getElementById("filter-distancia")?.value || "",
    sortQntd: document.getElementById("sort-qntd")?.value || "",
  };
  localStorage.setItem(FILTROS_KEY, JSON.stringify(f));
}

function preencherFiltros() {
  const cidades = [
    ...new Set(contratos.map((c) => c.cidade).filter(Boolean)),
  ].sort();
  const tipos = [
    ...new Set(contratos.map((c) => c.tipoDesconexao).filter(Boolean)),
  ].sort();
  preencherSelect("filter-cidade", cidades, "Cidade");
  preencherSelect("filter-tipo", tipos, "Tipo");

  // Restaurar cidade salva antes de popular bairros
  const saved = lerFiltrosSalvos();
  if (saved.busca) {
    document.getElementById("search").value = saved.busca;
    atualizarBotaoLimparBusca();
  }
  if (saved.cidade)
    document.getElementById("filter-cidade").value = saved.cidade;
  if (saved.status)
    document.getElementById("filter-status").value = saved.status;
  if (saved.tipo) document.getElementById("filter-tipo").value = saved.tipo;

  // Popular bairros com cidade já selecionada, depois restaurar bairro
  atualizarBairros();
  if (saved.bairro)
    document.getElementById("filter-bairro").value = saved.bairro;

  // Filtro de técnico: visível apenas para ADMs
  const { adm } = tecnicoLogado() || {};
  if (adm) {
    const tecnicos = [
      ...new Set(
        [
          ...contratos.map((c) => c.tecnicoDesig),
          ...contratos.map((c) => c.tecnicoExec),
        ].filter(Boolean),
      ),
    ].sort();
    preencherSelect("filter-tecnico", tecnicos, "Técnico");
    document.getElementById("filter-tecnico").classList.remove("hidden");
    if (saved.tecnico)
      document.getElementById("filter-tecnico").value = saved.tecnico;
  }

  if (saved.dataIni) {
    const el = document.getElementById("filter-data-ini");
    if (el) el.value = saved.dataIni;
  }
  if (saved.dataFim) {
    const el = document.getElementById("filter-data-fim");
    if (el) el.value = saved.dataFim;
  }
  if (saved.distancia) {
    const elDist = document.getElementById("filter-distancia");
    if (elDist) elDist.value = saved.distancia;
  }
  if (saved.sortQntd) {
    const elSq = document.getElementById("sort-qntd");
    if (elSq) {
      elSq.value = saved.sortQntd;
      sortQntd = saved.sortQntd;
    }
  }

  aplicarFiltros();
}

function atualizarBairros(
  cidadeSel = document.getElementById("filter-cidade").value,
) {
  const normalizar = (s) => (s || "").trim().toLowerCase();
  const fonte = cidadeSel
    ? contratos.filter((c) => normalizar(c.cidade) === normalizar(cidadeSel))
    : contratos;
  const bairros = [
    ...new Set(fonte.map((c) => c.bairro).filter(Boolean)),
  ].sort();
  preencherSelect("filter-bairro", bairros, "Bairro");
}

function preencherSelect(id, opcoes, placeholder) {
  const select = document.getElementById(id);
  select.innerHTML = `<option value="">${placeholder}</option>`;
  opcoes.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
}

function limparFiltros() {
  document.getElementById("search").value = "";
  document.getElementById("filter-cidade").value = "";
  document.getElementById("filter-bairro").value = "";
  document.getElementById("filter-status").value = "";
  document.getElementById("filter-tipo").value = "";
  document.getElementById("filter-tecnico").value = "";
  const elIni = document.getElementById("filter-data-ini");
  if (elIni) elIni.value = "";
  const elFim = document.getElementById("filter-data-fim");
  if (elFim) elFim.value = "";
  const elDist = document.getElementById("filter-distancia");
  if (elDist) elDist.value = "";
  const elSq = document.getElementById("sort-qntd");
  if (elSq) elSq.value = "";
  sortQntd = "";
  // Reseta agrupamento por rua
  if (modoAgrupamento === "rua") {
    modoAgrupamento = "";
    sortRua = "az";
    const btnAg = document.getElementById("btn-agrupar");
    if (btnAg) btnAg.classList.remove("btn-acao-ativo");
    const sortSel = document.getElementById("sort-rua");
    if (sortSel) {
      sortSel.value = "az";
      sortSel.classList.add("hidden");
    }
  }
  atualizarBairros();
  atualizarBotaoLimparBusca();
  localStorage.removeItem(FILTROS_KEY);
  paginaAtual = 1;
  aplicarFiltros();
}

// Chamado ao mudar filtro (reseta para pg 1)
function filtroAlterado() {
  paginaAtual = 1;
  aplicarFiltros();
}

function toggleFiltros() {
  const panel = document.getElementById("filtros-panel");
  const btn = document.getElementById("btn-toggle-filtros");
  const abrindo = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !abrindo);
  btn.classList.toggle("btn-filtros-aberto", abrindo);
  renderIcons();
}

function atualizarBadgeFiltros() {
  const badge = document.getElementById("badge-filtros-ativos");
  if (!badge) return;
  const ids = [
    "filter-cidade",
    "filter-bairro",
    "filter-status",
    "filter-tipo",
    "filter-tecnico",
    "filter-data-ini",
    "filter-data-fim",
    "filter-distancia",
    "sort-qntd",
  ];
  let count = ids.filter((id) => document.getElementById(id)?.value).length;
  if (userLocation) count++;
  if (modoAgrupamento) count++;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function aplicarFiltros() {
  atualizarBadgeFiltros();
  const busca = document.getElementById("search").value.toLowerCase().trim();
  const cidade = document.getElementById("filter-cidade").value;
  const bairro = document.getElementById("filter-bairro").value;
  const status = document.getElementById("filter-status").value;
  const tipo = document.getElementById("filter-tipo").value;
  const tecnico = document.getElementById("filter-tecnico").value;
  const dataIni = document.getElementById("filter-data-ini")?.value || "";
  const dataFim = document.getElementById("filter-data-fim")?.value || "";
  const distFiltro = document.getElementById("filter-distancia")?.value || "";

  const { usuario: usuarioLogado, adm: isAdm } = tecnicoLogado() || {};
  const usuarioLow = usuarioLogado?.trim().toLowerCase() || "";
  const ehMeuAgendamento = (c) =>
    !isAdm &&
    c.obs1?.trim().toUpperCase() === "AGENDADO" &&
    c.tecnicoDesig?.trim().toLowerCase() === usuarioLow;

  const resultado = contratos.filter((c) => {
    const novoEnd = extrairNovoEndereco(c.obs2) || "";
    const matchBusca =
      !busca ||
      c.nome.toLowerCase().includes(busca) ||
      c.contrato.toLowerCase().includes(busca) ||
      c.endereco.toLowerCase().includes(busca) ||
      novoEnd.toLowerCase().includes(busca) ||
      c.terminais.toLowerCase().includes(busca);
    // Agendamentos do próprio técnico ignoram filtro de cidade e bairro
    const skipGeofiltro = ehMeuAgendamento(c);
    return (
      matchBusca &&
      (skipGeofiltro || !cidade || c.cidade === cidade) &&
      (skipGeofiltro || !bairro || c.bairro === bairro) &&
      (!status || c.status === status) &&
      (!tipo || c.tipoDesconexao === tipo) &&
      (!tecnico || c.tecnicoDesig === tecnico || c.tecnicoExec === tecnico) &&
      filtrarPorIntervalo(c, dataIni, dataFim) &&
      filtrarPorDistancia(c, distFiltro)
    );
  });

  salvarFiltros();
  atualizarBarraMeta();
  renderizarLista(resultado);
}

// =========================================
// BUSCA — botão × para limpar
// =========================================
function atualizarBotaoLimparBusca() {
  const btn = document.getElementById("btn-limpar-busca");
  if (!btn) return;
  const temTexto = document.getElementById("search").value.length > 0;
  btn.classList.toggle("hidden", !temTexto);
}

// =========================================
// SERIAIS DE EQUIPAMENTO
// Formato: "F4E84F81CA88 / 14CA56D5D0A9 /" — split por /, trim, filtra vazio
// =========================================
function parsearSeriais(terminais) {
  if (!terminais?.trim()) return [];
  return terminais
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function criarSeriaisHTML(terminais) {
  const lista = parsearSeriais(terminais);
  if (!lista.length) return "";
  const chips = lista
    .map((s) => `<span class="serial-chip">${escHtml(s)}</span>`)
    .join("");
  return `<div class="detalhe-campo">
    <span class="detalhe-label">Equipamentos a retirar (${lista.length})</span>
    <div class="seriais-lista">${chips}</div>
  </div>`;
}

// =========================================
// ENDEREÇO INTELIGENTE (OBS 2)
// =========================================
function extrairNovoEndereco(obs2) {
  if (!obs2) return null;
  const match = obs2.match(/Novo endere[çc]o:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

// =========================================
// META DE RECUPERAÇÃO — por EQUIPAMENTO, não por contrato
//
// Numerador   = nº de seriais em SERIAIS_RETIRADOS (o campo vem "AAA / BBB")
// Denominador = soma de QNTD dos contratos da cidade
//
// Depende SÓ do filtro de cidade. Status, bairro e período não entram: a meta
// é da cidade inteira, não da visão atual — senão o número dançaria a cada filtro.
// =========================================
const METAS = { total: 0.78, opcao: 0.9, inad: 0.7 };
const META_ROTULOS = {
  total: "Total",
  opcao: "Opção",
  inad: "Inadimplência",
};

// Cidades que o técnico realmente atende. Agendamentos cross-cidade entram na
// lista de contratos mas NÃO contam para a meta dele.
function _cidadesPermitidas() {
  const t = tecnicoLogado();
  if (!t?.cidades?.length) return null; // null = admin / "TODOS" = todas
  return new Set(t.cidades.map((c) => c.trim().toLowerCase()));
}

function _grupoVazio() {
  return { ret: 0, tot: 0 };
}

function calcularMetaEquipamentos(cidadeFiltro) {
  const acesso = _cidadesPermitidas();
  const alvo = cidadeFiltro?.trim().toLowerCase() || "";
  const mapa = {};

  contratos.forEach((c) => {
    const cidade = c.cidade || "—";
    const cidadeLow = cidade.trim().toLowerCase();
    if (acesso && !acesso.has(cidadeLow)) return;
    if (alvo && cidadeLow !== alvo) return;

    if (!mapa[cidade]) {
      mapa[cidade] = {
        cidade,
        total: _grupoVazio(),
        opcao: _grupoVazio(),
        inad: _grupoVazio(),
      };
    }
    const g = mapa[cidade];

    const retirados = parsearSeriais(c.seriaisRet).length;
    // QNTD é a fonte oficial. Quando vem vazia, cai para a contagem de TERMINAIS
    // — sem isso o contrato entraria no numerador e não no denominador, gerando %
    // acima de 100.
    const total = parseInt(c.quantidade) || parsearSeriais(c.terminais).length;

    g.total.ret += retirados;
    g.total.tot += total;
    const cat = categoriaTipo(c);
    if (cat === "opcao" || cat === "inad") {
      g[cat].ret += retirados;
      g[cat].tot += total;
    }
  });

  return Object.values(mapa).sort((a, b) => a.cidade.localeCompare(b.cidade));
}

function _somarGrupos(dados, chave) {
  return dados.reduce(
    (acc, d) => ({ ret: acc.ret + d[chave].ret, tot: acc.tot + d[chave].tot }),
    _grupoVazio(),
  );
}

// Faixas fixas 20/40/60 e verde a partir da meta do segmento
function classeMeta(pct, meta) {
  if (pct >= meta * 100) return "meta-verde";
  if (pct >= 60) return "meta-verde-claro";
  if (pct >= 40) return "meta-amarelo";
  if (pct >= 20) return "meta-laranja";
  return "meta-vermelho";
}

function _pctMeta(grupo) {
  return grupo.tot > 0 ? (grupo.ret / grupo.tot) * 100 : 0;
}

function _fmtPct(pct) {
  return pct.toFixed(2).replace(".", ",") + "%";
}

// Quantos equipamentos ainda faltam para bater a meta
function _faltaParaMeta(grupo, meta) {
  if (!grupo.tot) return 0;
  return Math.max(0, Math.ceil(meta * grupo.tot) - grupo.ret);
}

function atualizarBarraMeta() {
  const el = document.getElementById("meta-barra");
  if (!el) return;
  const cidadeFiltro = document.getElementById("filter-cidade")?.value || "";
  const dados = calcularMetaEquipamentos(cidadeFiltro);
  const geral = _somarGrupos(dados, "total");

  if (!geral.tot) {
    el.classList.add("hidden");
    return;
  }

  const pct = _pctMeta(geral);
  const falta = _faltaParaMeta(geral, METAS.total);
  const escopo = cidadeFiltro
    ? escHtml(cidadeFiltro)
    : dados.length === 1
      ? escHtml(dados[0].cidade)
      : `${dados.length} cidades`;

  el.className = `meta-barra ${classeMeta(pct, METAS.total)}`;
  el.innerHTML = `
    <span class="meta-escopo"><i data-lucide="target" class="icon icon-sm"></i> ${escopo}</span>
    <span class="meta-numeros">${geral.ret}/${geral.tot}</span>
    <span class="meta-pct">(${_fmtPct(pct)})</span>
    <span class="meta-falta">${falta > 0 ? `faltam ${falta}` : "meta batida"}</span>
    <i data-lucide="chevron-right" class="icon icon-sm meta-seta"></i>`;
  renderIcons();
}

function _linhaMetaHTML(rotulo, grupo, meta) {
  if (!grupo.tot) return "";
  const pct = _pctMeta(grupo);
  const falta = _faltaParaMeta(grupo, meta);
  return `
    <div class="meta-linha ${classeMeta(pct, meta)}">
      <span class="meta-linha-rotulo">${rotulo}</span>
      <span class="meta-linha-num">${grupo.ret}/${grupo.tot}</span>
      <span class="meta-linha-pct">${_fmtPct(pct)}</span>
      <span class="meta-linha-meta">meta ${Math.round(meta * 100)}%</span>
      <span class="meta-linha-falta">${falta > 0 ? `faltam ${falta}` : "✓"}</span>
    </div>`;
}

function _blocoCidadeHTML(d) {
  const linhas = ["total", "opcao", "inad"]
    .map((k) => _linhaMetaHTML(META_ROTULOS[k], d[k], METAS[k]))
    .join("");
  return `
    <div class="meta-cidade">
      <div class="meta-cidade-nome">${escHtml(d.cidade)}</div>
      ${linhas}
    </div>`;
}

function abrirMetaDetalhe() {
  const cidadeFiltro = document.getElementById("filter-cidade")?.value || "";
  const dados = calcularMetaEquipamentos(cidadeFiltro);
  if (!dados.length) return;

  // Mais de uma cidade: consolidado no topo para não precisar filtrar uma a uma
  const consolidado =
    dados.length > 1
      ? `<div class="meta-cidade meta-cidade-geral">
           <div class="meta-cidade-nome">Todas as suas cidades</div>
           ${["total", "opcao", "inad"]
             .map((k) =>
               _linhaMetaHTML(META_ROTULOS[k], _somarGrupos(dados, k), METAS[k]),
             )
             .join("")}
         </div>`
      : "";

  document.getElementById("meta-body").innerHTML = `
    <p class="meta-legenda">
      Equipamentos retirados sobre o total de equipamentos da cidade.
    </p>
    ${consolidado}
    ${dados.map(_blocoCidadeHTML).join("")}`;
  document.getElementById("modal-meta").classList.remove("hidden");
  renderIcons();
}

function fecharMetaDetalhe() {
  document.getElementById("modal-meta").classList.add("hidden");
}

// =========================================
// RENDERIZAÇÃO + PAGINAÇÃO
// =========================================
function renderizarLista(lista) {
  const container = document.getElementById("lista-contratos");
  const contador = document.getElementById("resultado-count");

  if (lista.length === 0) {
    contador.textContent = "0 contrato(s) encontrado(s)";
    mostrarVazio("Nenhum contrato corresponde aos filtros.");
    renderizarPaginacao(0, 0);
    return;
  }

  const distFiltro = document.getElementById("filter-distancia")?.value || "";
  let ordenada;

  if (userLocation && distFiltro === "mais-perto") {
    // Ordena tudo por distância (sem geocodificados vai ao final)
    ordenada = [...lista].sort((a, b) => {
      const da = contratoDistancias.get(a.id) ?? Infinity;
      const db = contratoDistancias.get(b.id) ?? Infinity;
      return da - db;
    });
  } else if (sortQntd === "mais") {
    ordenada = [...lista].sort(
      (a, b) => (parseInt(b.quantidade) || 0) - (parseInt(a.quantidade) || 0),
    );
  } else if (sortQntd === "menos") {
    ordenada = [...lista].sort(
      (a, b) => (parseInt(a.quantidade) || 0) - (parseInt(b.quantidade) || 0),
    );
  } else {
    // Ordem padrão: agendados (mais próximo primeiro) → Pendente → Parcial → Quebra → Retirado
    const STATUS_ORDEM = {
      Pendente: 0,
      Parcial: 1,
      Quebra: 2,
      Ausente: 2,
      Retirado: 3,
    };
    const usuario = tecnicoLogado()?.usuario?.toLowerCase() || "";
    const ehAgendado = (c) =>
      c.obs1?.trim().toUpperCase() === "AGENDADO" &&
      c.tecnicoDesig?.trim().toLowerCase() === usuario;
    const parseDateTimeAgend = (c) => {
      const m = c.dataAgend?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) return Infinity;
      const hm = c.horario?.match(/(\d{1,2})[h:](\d{2})/i);
      return new Date(
        +m[3],
        +m[2] - 1,
        +m[1],
        hm ? +hm[1] : 23,
        hm ? +hm[2] : 59,
      ).getTime();
    };
    const agendados = lista
      .filter(ehAgendado)
      .sort((a, b) => parseDateTimeAgend(a) - parseDateTimeAgend(b));
    const outros = lista
      .filter((c) => !ehAgendado(c))
      .sort(
        (a, b) => (STATUS_ORDEM[a.status] ?? 2) - (STATUS_ORDEM[b.status] ?? 2),
      );
    ordenada = [...agendados, ...outros];
  }

  const total = ordenada.length;

  // --- MODO AGRUPAMENTO POR RUA: agrupa lista inteira, sem paginação por contrato ---
  if (modoAgrupamento === "rua") {
    const grupos = {};
    ordenada.forEach((c) => {
      const novoEnd = extrairNovoEndereco(c.obs2);
      const rua = extrairNomeRua(novoEnd || c.endereco);
      if (!grupos[rua]) grupos[rua] = [];
      grupos[rua].push(c);
    });
    let chaves = Object.keys(grupos);
    if (sortRua === "mais") {
      chaves.sort((a, b) => grupos[b].length - grupos[a].length);
    } else if (sortRua === "menos") {
      chaves.sort((a, b) => grupos[a].length - grupos[b].length);
    } else {
      chaves.sort();
    }
    contador.textContent = `${total} contrato(s) em ${chaves.length} rua(s)`;
    let html = "";
    chaves.forEach((rua) => {
      html += `<div class="grupo-rua-header"><i data-lucide="map-pin" class="icon icon-sm"></i> ${rua} <span class="grupo-count">${grupos[rua].length}</span></div>`;
      html += grupos[rua].map(criarCartaoHTML).join("");
    });
    container.innerHTML = html;
    ordenada.forEach((c) => {
      const el = document.getElementById(`cartao-${c.id}`);
      if (!el) return;
      if (modoRota) {
        el.addEventListener("click", (e) => toggleSelecaoRota(c.id, e));
        if (rotaSelecionados.has(c.id)) el.classList.add("cartao-na-rota");
      } else {
        el.addEventListener("click", () => abrirModal(c));
      }
    });
    renderizarPaginacao(0, 0);
    renderIcons();
    if (userLocation && !geocodificandoAtivo) {
      setTimeout(() => calcularDistanciasPagina(ordenada), 100);
    }
    return;
  }

  // --- MODO NORMAL: paginação por contrato ---
  const totalPags = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginaAtual > totalPags) paginaAtual = totalPags;

  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const pagina = ordenada.slice(inicio, inicio + POR_PAGINA);
  const fim = Math.min(inicio + POR_PAGINA, total);

  contador.textContent = `${total} contrato(s) — exibindo ${inicio + 1}–${fim}`;
  container.innerHTML = pagina.map(criarCartaoHTML).join("");

  pagina.forEach((c) => {
    const el = document.getElementById(`cartao-${c.id}`);
    if (!el) return;
    if (modoRota) {
      el.addEventListener("click", (e) => toggleSelecaoRota(c.id, e));
      if (rotaSelecionados.has(c.id)) el.classList.add("cartao-na-rota");
    } else {
      el.addEventListener("click", () => abrirModal(c));
    }
  });

  renderizarPaginacao(totalPags, total);
  renderIcons();

  if (userLocation && !geocodificandoAtivo) {
    const cidadeFiltrada = document.getElementById("filter-cidade")?.value;
    if (cidadeFiltrada || ordenada.length <= 150) {
      // Cidade filtrada ou lista pequena: geocodifica tudo
      setTimeout(() => calcularDistanciasPagina(ordenada), 100);
    } else {
      // Lista grande sem filtro: só a página atual + avisa
      setTimeout(() => calcularDistanciasPagina(pagina), 100);
      mostrarToast(
        "Filtre por cidade para calcular distâncias de todos os contratos.",
        "aviso",
      );
    }
  }
}

function renderizarPaginacao(totalPags, total) {
  const div = document.getElementById("paginacao");
  if (totalPags <= 1) {
    div.classList.add("hidden");
    return;
  }

  div.classList.remove("hidden");
  div.innerHTML = `
    <button class="btn-pag" id="pag-prev" ${paginaAtual <= 1 ? "disabled" : ""}>←</button>
    <div class="pag-centro">
      <input
        type="number"
        id="pag-input"
        class="pag-input"
        min="1"
        max="${totalPags}"
        value="${paginaAtual}"
      />
      <span class="pag-de-total">de ${totalPags}</span>
    </div>
    <button class="btn-pag" id="pag-next" ${paginaAtual >= totalPags ? "disabled" : ""}>→</button>`;

  document.getElementById("pag-prev").addEventListener("click", () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      aplicarFiltros();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  document.getElementById("pag-next").addEventListener("click", () => {
    if (paginaAtual < totalPags) {
      paginaAtual++;
      aplicarFiltros();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  const input = document.getElementById("pag-input");
  // Só permite dígitos
  input.addEventListener("keydown", (e) => {
    if (
      !/^\d$/.test(e.key) &&
      ![
        "Backspace",
        "Delete",
        "Tab",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
      ].includes(e.key)
    ) {
      e.preventDefault();
    }
    if (e.key === "Enter") irParaPagina(parseInt(input.value), totalPags);
  });
  input.addEventListener("blur", () =>
    irParaPagina(parseInt(input.value), totalPags),
  );
}

function irParaPagina(pag, totalPags) {
  if (!pag || pag < 1) pag = 1;
  if (pag > totalPags) pag = totalPags;
  if (pag === paginaAtual) return;
  paginaAtual = pag;
  aplicarFiltros();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function criarCartaoHTML(c) {
  const cls = statusParaClasse(c.status);
  const novoEnd = extrairNovoEndereco(c.obs2);
  const endExib = novoEnd || c.endereco;
  const telExib =
    c.telefone || c.telCelular || c.telComercial || c.outros || "";
  const telParaWa = telExib;
  const waHref =
    telParaWa && c.texto1
      ? `whatsapp://send?phone=${formatarTelefone(telParaWa)}&text=${encodeURIComponent(c.texto1)}`
      : null;
  const usuario = tecnicoLogado()?.usuario?.toLowerCase() || "";
  const agendado =
    c.obs1?.trim().toUpperCase() === "AGENDADO" &&
    c.tecnicoDesig?.trim().toLowerCase() === usuario;
  const hojeStr = new Date().toLocaleDateString("pt-BR");
  const amanhaDate = new Date();
  amanhaDate.setDate(amanhaDate.getDate() + 1);
  const amanhaStr = amanhaDate.toLocaleDateString("pt-BR");
  const agendadoHoje = agendado && c.dataAgend?.trim() === hojeStr;
  const agendadoAmanha = agendado && c.dataAgend?.trim() === amanhaStr;

  const labelDia = (() => {
    if (!agendado) return "";
    if (agendadoHoje) return "HOJE";
    if (agendadoAmanha) return "AMANHÃ";
    const m = c.dataAgend?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) {
      const d = new Date(+m[3], +m[2] - 1, +m[1]);
      const dia = d
        .toLocaleDateString("pt-BR", { weekday: "short" })
        .replace(".", "")
        .toUpperCase();
      return dia;
    }
    return "AGENDADO";
  })();

  const agendadoHeader = agendado
    ? `<div class="cartao-agendado-header${agendadoHoje ? " cartao-agendado-hoje-header" : agendadoAmanha ? " cartao-agendado-amanha-header" : ""}">
        <i data-lucide="calendar" class="icon icon-sm"></i>
        <span class="agend-label-dia">${labelDia}</span>
        <span class="agend-data">${escHtml(c.dataAgend || "")}</span>
        ${c.horario ? `<span class="agend-hora">às ${escHtml(c.horario)}</span>` : ""}
      </div>`
    : "";

  const dataExecHTML = c.dataExec
    ? `<div class="cartao-data-exec">Exec: ${escHtml(c.dataExec)}${c.tecnicoExec ? ` · ${escHtml(c.tecnicoExec)}` : ""}</div>`
    : "";

  const msgEnviadaHTML = c.msgEnviada
    ? `<div class="cartao-msg-enviada"><i data-lucide="check" class="icon icon-xs"></i> Msg enviada ${escHtml(c.msgEnviada)}</div>`
    : "";

  const tipoBadge = c.tipoDesconexao
    ? `<span class="badge-tipo badge-tipo-${escHtml(c.tipoDesconexao.toLowerCase())}">${escHtml(c.tipoDesconexao)}</span>`
    : "";

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${endExib}, ${c.cidade}`)}`;

  const rotaIndicador = modoRota
    ? `<div class="rota-indicador${rotaSelecionados.has(c.id) ? " rota-selecionado" : ""}"><i data-lucide="${rotaSelecionados.has(c.id) ? "check-circle" : "circle"}" class="icon icon-sm"></i></div>`
    : "";

  return `
    <div class="cartao status-${cls}${agendado ? " cartao-agendado" : ""}${modoRota ? " cartao-modo-rota" : ""}" id="cartao-${c.id}">
      ${rotaIndicador}
      ${agendadoHeader}
      <div class="cartao-nome">${escHtml(c.nome)}</div>
      <div class="cartao-info">
        ${escHtml(c.cidade)} — ${escHtml(c.bairro)}<br/>
        <div class="end-row">
          <span>${novoEnd ? `<span class="tag-novo-end">Novo end.</span> ` : ""}${escHtml(endExib)}</span>
          <div class="end-row-acoes">
            <a href="${mapsUrl}" class="btn-mapa-card" target="_blank" onclick="event.stopPropagation()" title="Ver no mapa"><i data-lucide="map-pin" class="icon icon-sm"></i></a>
            ${waHref ? `<a href="${waHref}" class="btn-wa-card${c.msgEnviada ? " btn-wa-enviado" : ""}" onclick="registrarMsgEnviada('${escHtml(c.id)}', event)" title="${c.msgEnviada ? "Mensagem já enviada" : "Enviar pelo WhatsApp"}"><i data-lucide="message-circle" class="icon icon-sm"></i></a>` : ""}
          </div>
        </div>
        ${telExib ? `<br/>${escHtml(telExib)}` : ""}
      </div>
      <div class="cartao-footer">
        <span class="badge-status badge-${cls}">${escHtml(c.status)}</span>
        ${criarBadgeSLA(c)}
        ${criarBadgeDistancia(c)}
        <span class="cartao-detalhe">${escHtml(c.contrato)}</span>
        ${tipoBadge}
      </div>
      ${dataExecHTML}
      ${msgEnviadaHTML}
    </div>`;
}

function statusParaClasse(s) {
  return (
    {
      Pendente: "pendente",
      Retirado: "retirado",
      Quebra: "quebra",
      Ausente: "ausente",
      Parcial: "parcial",
    }[s] || "pendente"
  );
}

// =========================================
// MODAL DE DETALHES
// =========================================
function abrirModal(contrato) {
  contratoAtivo = contrato;
  const body = document.getElementById("modal-body");
  const novoEnd = extrairNovoEndereco(contrato.obs2);
  const endParaMaps = novoEnd || contrato.endereco;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${endParaMaps}, ${contrato.cidade}`)}`;
  const duplicatas = detectarDuplicatas(contrato);
  const cls = statusParaClasse(contrato.status);
  const nomeDesig = nomeTecnico(contrato.tecnicoDesig);

  const f = (label, valor, destaque = false) =>
    valor
      ? `<div class="detalhe-campo"><span class="detalhe-label">${label}</span><span class="detalhe-valor${destaque ? " detalhe-destaque" : ""}">${escHtml(valor)}</span></div>`
      : "";

  const g2 = (a, b) =>
    a || b ? `<div class="modal-grid-2">${a || ""}${b || ""}</div>` : "";

  const secao = (titulo, html) =>
    html?.trim()
      ? `<div class="modal-secao"><div class="modal-secao-titulo">${titulo}</div><div class="modal-secao-corpo">${html}</div></div>`
      : "";

  const temExec =
    contrato.codigoOS ||
    contrato.dataExec ||
    contrato.tecnicoExec ||
    contrato.obsExec;
  const geoExecUrl =
    contrato.latExec && contrato.lngExec
      ? `https://www.google.com/maps?q=${contrato.latExec},${contrato.lngExec}`
      : null;
  const agendStr = [
    contrato.dataAgend,
    contrato.horario ? `às ${contrato.horario}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  body.innerHTML = `
    ${criarAlertaDuplicatasHTML(duplicatas)}
    <div class="modal-nome">${escHtml(contrato.nome)}</div>
    <div class="modal-status-row">
      <span class="badge-status badge-${cls}">${escHtml(contrato.status)}</span>
      ${criarBadgeSLA(contrato)}
      ${criarBadgeDistancia(contrato)}
    </div>

    ${secao(
      "Identificação",
      g2(
        f("Contrato", contrato.contrato),
        f("Data Pendente", contrato.dataPend),
      ),
    )}

    ${secao(
      "Localização",
      `
      ${novoEnd ? f("Endereço Original", contrato.endereco) : ""}
      ${f(novoEnd ? "Novo Endereço" : "Endereço", endParaMaps, !!novoEnd)}
      ${g2(f("Bairro", contrato.bairro), f("Cidade", contrato.cidade))}
      <a href="${mapsUrl}" class="btn-mapa-modal" target="_blank">
        <i data-lucide="map-pin" class="icon icon-sm"></i> Ver no Google Maps
      </a>
    `,
    )}

    ${secao(
      "Serviço",
      `
      ${f("Tipo Desconexão", contrato.tipoDesconexao)}
      ${criarSeriaisHTML(contrato.terminais)}
      ${f("OBS 1", contrato.obs1)}
      ${f("OBS 2", contrato.obs2)}
    `,
    )}

    ${
      agendStr || nomeDesig
        ? secao(
            "Agendamento",
            g2(
              agendStr ? f("Data", agendStr) : "",
              nomeDesig ? f("Técnico Designado", nomeDesig) : "",
            ),
          )
        : ""
    }

    ${
      temExec
        ? secao(
            "Execução",
            `
      ${g2(f("Técnico", contrato.tecnicoExec), f("Data", contrato.dataExec))}
      ${f("Código OS", contrato.codigoOS)}
      ${f("Obs. Execução", contrato.obsExec)}
      ${criarFotosModal(contrato.fotoExec)}
      ${criarVisitasHTML(contrato.visitas)}
      ${geoExecUrl ? `<a href="${geoExecUrl}" class="btn-mapa-modal btn-mapa-exec" target="_blank"><i data-lucide="navigation" class="icon icon-sm"></i> Ver localização da execução</a>` : ""}
    `,
          )
        : ""
    }

    ${(() => {
      const telWa =
        contrato.telefone ||
        contrato.telCelular ||
        contrato.telComercial ||
        contrato.outros ||
        "";
      if (!telWa || !contrato.texto1) return "";
      const waUrl = `whatsapp://send?phone=${formatarTelefone(telWa)}&text=${encodeURIComponent(contrato.texto1)}`;
      return `<div class="secao-wa-modal">
        <a href="${waUrl}" class="btn-wa-modal${contrato.msgEnviada ? " btn-wa-enviado" : ""}" onclick="registrarMsgEnviada('${escHtml(contrato.id)}', event)">
          <i data-lucide="message-circle" class="icon icon-sm"></i>
          ${contrato.msgEnviada ? "Reenviar mensagem" : "Enviar mensagem WhatsApp"}
        </a>
        ${contrato.msgEnviada ? `<span class="msg-enviada-info"><i data-lucide="check-circle" class="icon icon-xs"></i> Enviada em ${escHtml(contrato.msgEnviada)}</span>` : ""}
      </div>`;
    })()}
    <div class="secao-telefones">${criarBotoesPhone(contrato)}</div>
    <div class="acoes" id="acoes-modal">${criarAcoesHTML()}</div>
    ${tecnicoLogado()?.adm ? `<button class="btn-connect" onclick="abrirModalConnect(contratoAtivo)"><i data-lucide="clipboard-list" class="icon icon-sm"></i> Dados para Connect</button>` : ""}`;

  document.getElementById("modal").classList.remove("hidden");
  renderIcons();
}

// =========================================
// MODAL CONNECT (admin)
// =========================================
function abrirModalConnect(c) {
  const novoEnd = extrairNovoEndereco(c.obs2);
  const endereco = novoEnd || c.endereco;

  const campos = [
    {
      label: "Data de Execução",
      valor: c.dataExec ? c.dataExec.split(" ")[0] : "—",
    },
    { label: "Nome do Cliente", valor: c.nome },
    { label: "Endereço", valor: endereco },
    { label: "Bairro", valor: c.bairro },
    { label: "Cidade", valor: c.cidade },
    { label: "Contrato", valor: c.contrato },
    {
      label: "Técnico",
      valor: c.tecnicoExec || nomeTecnico(c.tecnicoDesig) || "—",
    },
  ];

  _connectCampos = campos;
  const linhas = campos
    .map(
      (f, i) => `
    <div class="connect-row">
      <span class="connect-label">${f.label}</span>
      <span class="connect-valor">${f.valor}</span>
      <button class="btn-copiar-campo" onclick="copiarCampoConnect(${i})" title="Copiar">
        <i data-lucide="copy" class="icon icon-sm"></i>
      </button>
    </div>`,
    )
    .join("");

  const jaLancado = !!c.noConnect;
  const btnConnect = jaLancado
    ? `<div class="connect-lancado"><i data-lucide="check-circle" class="icon icon-sm"></i> Lançado no Connect</div>`
    : `<button class="btn-marcar-connect" onclick="marcarNoConnect()"><i data-lucide="check" class="icon icon-sm"></i> Marcar como lançado no Connect</button>`;

  document.getElementById("connect-body").innerHTML = linhas;
  document.getElementById("connect-footer").innerHTML = btnConnect;
  document.getElementById("modal-connect").classList.remove("hidden");
  renderIcons();
}

function marcarNoConnect() {
  if (!contratoAtivo) return;
  const id = contratoAtivo.id;

  // Atualização otimista — UI responde imediatamente
  contratoAtivo.noConnect = "SIM";
  document.getElementById("connect-footer").innerHTML =
    `<div class="connect-lancado"><i data-lucide="check-circle" class="icon icon-sm"></i> Lançado no Connect</div>`;
  renderIcons();

  // Atualiza badge na linha do histórico admin (se visível), sem re-render
  const tr = document.querySelector(`.hist-linha[data-id="${id}"]`);
  if (tr) {
    const cell = tr.querySelector(".col-connect");
    if (cell)
      cell.innerHTML = `<span class="badge-connect-ok" title="Lançado no Connect">✓</span>`;
  }

  mostrarToast("Lançado no Connect!", "sucesso");

  // Salva em background — não bloqueia o usuário
  salvarNaPlanilha(contratoAtivo, { [COL_NO_CONNECT]: "SIM" }).catch(() => {
    // Reverte se a requisição falhar
    contratoAtivo.noConnect = "";
    document.getElementById("connect-footer").innerHTML =
      `<button class="btn-marcar-connect" onclick="marcarNoConnect()"><i data-lucide="check" class="icon icon-sm"></i> Marcar como lançado no Connect</button>`;
    if (tr) {
      const cell = tr.querySelector(".col-connect");
      if (cell)
        cell.innerHTML = `<span class="badge-connect-pendente" title="Pendente no Connect">—</span>`;
    }
    renderIcons();
    mostrarToast("Falha ao salvar no Connect. Tente novamente.", "erro");
  });
}

function fecharModalConnect() {
  document.getElementById("modal-connect").classList.add("hidden");
}

function copiarCampoConnect(idx) {
  const val = _connectCampos[idx]?.valor || "";
  navigator.clipboard
    .writeText(val)
    .then(() => mostrarToast("Copiado!", "sucesso"));
}

function copiarTudoConnect() {
  const texto = _connectCampos.map((f) => `${f.label}: ${f.valor}`).join("\n");
  navigator.clipboard
    .writeText(texto)
    .then(() => mostrarToast("Todos os campos copiados!", "sucesso"));
}

function criarAcoesHTML() {
  return `
    <button class="btn btn-retirado" onclick="mostrarConfirmacaoRetirado()">Marcar como Retirado</button>
    <button class="btn btn-quebra"   onclick="mostrarSeletorQuebra()">Marcar como Quebra</button>`;
}

// --- Persistência de estado do modal (câmera Android mata a página) ---
function _salvarEstadoModal(updates) {
  try {
    const raw = localStorage.getItem("safra_modal_state") || "{}";
    localStorage.setItem(
      "safra_modal_state",
      JSON.stringify({ ...JSON.parse(raw), ...updates }),
    );
  } catch {}
}

function _limparEstadoModal() {
  try {
    localStorage.removeItem("safra_modal_state");
  } catch {}
}

function _tentarRestaurarModal() {
  try {
    const raw = localStorage.getItem("safra_modal_state");
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state?.contratoId) return;
    const c = contratos.find((x) => x.id === state.contratoId);
    if (!c || c.status !== "Pendente") {
      _limparEstadoModal();
      return;
    }
    _limparEstadoModal(); // limpa antes de abrir para não restaurar em loop
    abrirModal(c);
    requestAnimationFrame(() => {
      if (state.fluxo === "retirado") {
        mostrarConfirmacaoRetirado();
        requestAnimationFrame(() => {
          const el = document.getElementById("obs-exec-input");
          if (el && state.obs) el.value = state.obs;
          if (state.seriais) {
            state.seriais
              .split(" / ")
              .filter(Boolean)
              .forEach((ser) => {
                const chip = document.querySelector(
                  `#seriais-selec [data-serial="${ser.trim()}"]`,
                );
                if (chip) chip.classList.add("serial-selecionado");
              });
          }
        });
      } else if (state.fluxo === "quebra") {
        mostrarSeletorQuebra();
        requestAnimationFrame(() => {
          const sel = document.getElementById("select-codigo-quebra");
          if (sel && state.codigoQuebra) sel.value = state.codigoQuebra;
          const el = document.getElementById("obs-exec-input");
          if (el && state.obs) el.value = state.obs;
        });
      }
    });
  } catch {
    _limparEstadoModal();
  }
}

// --- Fluxo Retirado ---
function mostrarConfirmacaoRetirado() {
  _salvarEstadoModal({
    contratoId: contratoAtivo?.id,
    fluxo: "retirado",
    obs: "",
    seriais: "",
  });
  document.getElementById("acoes-modal").innerHTML = `
    ${criarSeletorSeriaisHTML(contratoAtivo?.terminais || "")}
    <label class="detalhe-label" style="margin-bottom:6px;display:block">Observação (opcional)</label>
    <textarea id="obs-exec-input" class="obs-textarea" placeholder="Alguma observação sobre a retirada..." oninput="_salvarEstadoModal({obs:this.value})"></textarea>
    ${criarInputFoto()}
    <button class="btn btn-retirado" onclick="confirmarRetirado()">Confirmar Retirado</button>
    <button class="btn btn-cancelar" onclick="restaurarAcoes()">Cancelar</button>`;
  configurarPreviewFotos();
  renderIcons();
}

async function confirmarRetirado() {
  const listaSer = parsearSeriais(contratoAtivo?.terminais || "");
  if (listaSer.length > 0 && !getSeriaisSelecionados()) {
    mostrarToast("Selecione ao menos um equipamento retirado.", "aviso");
    return;
  }
  if (!validarFotos()) return;
  const seriaisRet = getSeriaisSelecionados();
  const qtdSel = seriaisRet
    ? seriaisRet.split(" / ").filter(Boolean).length
    : 0;
  const isParcial =
    listaSer.length > 0 && qtdSel > 0 && qtdSel < listaSer.length;
  const novoStatus = isParcial ? "Parcial" : "Retirado";
  const codigoOS = isParcial ? "Parcial" : "430 - Equipamento retirado";
  await executarSalvamento(
    {
      STATUS: novoStatus,
      [COL_CODIGO_OS]: codigoOS,
      [COL_SERIAIS_RET]: seriaisRet,
    },
    novoStatus,
  );
}

// --- Fluxo Quebra ---
function mostrarSeletorQuebra() {
  _salvarEstadoModal({
    contratoId: contratoAtivo?.id,
    fluxo: "quebra",
    obs: "",
    codigoQuebra: "",
  });
  const opcoes = CODIGOS_QUEBRA.map(
    (c) => `<option value="${c}">${c}</option>`,
  ).join("");
  document.getElementById("acoes-modal").innerHTML = `
    <label class="detalhe-label" style="margin-bottom:6px;display:block">Código de retorno</label>
    <select id="select-codigo-quebra" class="input-select" style="width:100%;margin-bottom:12px" onchange="_salvarEstadoModal({codigoQuebra:this.value})">
      <option value="">Selecione o motivo...</option>${opcoes}
    </select>
    <label class="detalhe-label" style="margin-bottom:6px;display:block">Observação (opcional)</label>
    <textarea id="obs-exec-input" class="obs-textarea" placeholder="Alguma observação sobre a quebra..." oninput="_salvarEstadoModal({obs:this.value})"></textarea>
    ${criarInputFoto()}
    <button class="btn btn-quebra"   onclick="confirmarQuebra()">Confirmar Quebra</button>
    <button class="btn btn-cancelar" onclick="restaurarAcoes()">Cancelar</button>`;
  configurarPreviewFotos();
  renderIcons();
}

async function confirmarQuebra() {
  const select = document.getElementById("select-codigo-quebra");
  if (!select?.value) {
    mostrarToast("Selecione o motivo da quebra.", "aviso");
    select.style.borderColor = "#ef4444";
    return;
  }
  if (!validarFotos()) return;
  await executarSalvamento(
    { STATUS: "Quebra", [COL_CODIGO_OS]: select.value },
    "Quebra",
  );
}

function restaurarAcoes() {
  _limparEstadoModal();
  document.getElementById("acoes-modal").innerHTML = criarAcoesHTML();
  renderIcons();
}

// --- Salvamento ---
async function executarSalvamento(camposBase, novoStatus) {
  const obsExec =
    document.getElementById("obs-exec-input")?.value?.trim() || "";
  const dataExec = formatarDataExec();
  const tecnico = tecnicoLogado()?.usuario || "";
  const visitasAnt = contratoAtivo.visitas || "";
  const novasVisitas = visitasAnt ? `${visitasAnt}|${dataExec}` : dataExec;
  const fotosParaUpload = [..._fotoArquivos]; // captura antes de fechar modal
  const contratoParaSalvar = contratoAtivo; // captura ref antes de fecharModal()

  // Atualização otimista — fecha modal e atualiza lista imediatamente
  const idx = contratos.findIndex((c) => c.id === contratoAtivo.id);
  const contratoOriginal = idx !== -1 ? { ...contratos[idx] } : null;
  if (idx !== -1) {
    contratos[idx] = {
      ...contratos[idx],
      status: novoStatus,
      codigoOS: camposBase[COL_CODIGO_OS],
      obsExec,
      dataExec,
      tecnicoExec: tecnico,
      seriaisRet: camposBase[COL_SERIAIS_RET] || contratos[idx].seriaisRet,
      baixaSite: "Sim",
      visitas: novasVisitas,
    };
  }
  fecharModal(); // também chama _limparEstadoModal()
  aplicarFiltros();

  // Salva estado otimista no IDB IMEDIATAMENTE — se o Android matar a página
  // durante o upload/GPS, o IDB já tem o novo status e não reverte ao recarregar
  const usuarioAtual = tecnicoLogado()?.usuario;
  salvarContratosIDB(contratos, usuarioAtual);

  // Fotos vão para o IDB ANTES de qualquer rede. Se a conexão cair, o upload
  // falhar ou o Android matar o app, a evidência continua no aparelho e é
  // reenviada sozinha. Só sai da fila com o FOTO_EXEC confirmado na planilha.
  const temCloudinary = CLOUDINARY_CLOUD_NAME !== "SEU_CLOUD_NAME";
  let fotosKey = null;
  if (temCloudinary && fotosParaUpload.length) {
    fotosKey = await enfileirarFotos(
      contratoParaSalvar.contrato,
      fotosParaUpload,
    );
    atualizarIndicadorOffline();
  }

  // GPS + escrita GAS em background — loading bar indica progresso
  _setCarregando(+1);
  try {
    const geo = await capturarGeolocalizacao();
    if (geo && idx !== -1) {
      contratos[idx].latExec = geo.lat;
      contratos[idx].lngExec = geo.lng;
    }

    // 1. Escrita crítica no GAS — sem esperar pelo upload de foto
    const campos = {
      ...camposBase,
      [COL_OBS_EXEC]: obsExec,
      [COL_DATA_EXEC]: dataExec,
      [COL_TECNICO]: tecnico,
      [COL_BAIXA_SITE]: "Sim",
      [COL_VISITAS]: novasVisitas,
      ...(geo ? { [COL_LAT_EXEC]: geo.lat, [COL_LNG_EXEC]: geo.lng } : {}),
    };
    await salvarNaPlanilha(contratoParaSalvar, campos);
    salvarContratosIDB(contratos, usuarioAtual);
    agendarNotificacoesHoje();
    mostrarToast("Baixa registrada com sucesso.", "sucesso");

    // 2. Upload de foto em background verdadeiro — não trava a UI nem o loading bar
    if (fotosKey !== null) {
      uploadTodasFotos(fotosParaUpload)
        .then(async (fotoExec) => {
          if (!fotoExec) {
            await removerFotosDaFila(fotosKey);
            return;
          }
          await _postCampos(contratoParaSalvar.contrato, {
            [COL_FOTO]: fotoExec,
          });
          await removerFotosDaFila(fotosKey);
          if (idx !== -1) contratos[idx].fotoExec = fotoExec;
          salvarContratosIDB(contratos, usuarioAtual);
        })
        .catch(() => {
          // Fotos seguem na fila do IDB — nada se perde, reenvio automático
          mostrarToast(
            "Fotos não enviadas agora. Ficaram salvas no aparelho e sobem sozinhas quando o sinal melhorar.",
            "aviso",
          );
        })
        .finally(atualizarIndicadorOffline);
    }
  } catch (erro) {
    if (erro instanceof OfflineError) {
      if (idx !== -1) contratos[idx]._pendente = true;
      mostrarToast(
        fotosKey !== null
          ? "Sem conexão. Baixa e fotos salvas no aparelho — serão enviadas ao reconectar."
          : "Sem conexão. Baixa salva localmente e será enviada ao reconectar.",
        "aviso",
      );
      atualizarIndicadorOffline();
    } else {
      console.error("Erro ao salvar:", erro);
      // Rollback: reverte contrato ao estado original
      if (idx !== -1 && contratoOriginal) contratos[idx] = contratoOriginal;
      aplicarFiltros();
      salvarContratosIDB(contratos, usuarioAtual); // reverte IDB também
      // A baixa inteira falhou — fotos órfãs num contrato Pendente não servem
      // de evidência e travariam a fila para sempre
      await removerFotosDaFila(fotosKey);
      atualizarIndicadorOffline();
      mostrarToast(
        fotosKey !== null
          ? "Erro ao salvar. Nada foi registrado — refaça a baixa com as fotos."
          : "Erro ao salvar. Verifique sua conexão e tente novamente.",
        "erro",
      );
    }
  } finally {
    _setCarregando(-1);
  }
}

function mostrarStatusUpload(msg) {
  const area = document.getElementById("foto-preview");
  if (area)
    area.innerHTML = `<span style="font-size:0.82rem;color:#555">${msg}</span>`;
}

function fecharModal() {
  _limparEstadoModal();
  // Revoga blob URLs do preview e limpa array — evita acúmulo de blobs entre aberturas
  const preview = document.getElementById("foto-preview");
  if (preview) {
    preview
      .querySelectorAll("img[data-blob-url]")
      .forEach((img) => URL.revokeObjectURL(img.dataset.blobUrl));
    preview.innerHTML = "";
  }
  _fotoArquivos = [];
  document.getElementById("modal").classList.add("hidden");
  contratoAtivo = null;
}

// =========================================
// AVISO DE EVIDÊNCIAS
// =========================================
function mostrarAvisoEvidencias() {
  const aviso = document.getElementById("aviso-evidencia");
  aviso.classList.remove("hidden");
  setTimeout(() => aviso.classList.add("hidden"), 5000);
}

// =========================================
// BOTÕES DE TELEFONE
// =========================================
function criarBotoesPhone(c) {
  const lista = [
    { label: "Telefone", valor: c.telefone },
    { label: "Comercial", valor: c.telComercial },
    { label: "Outros", valor: c.outros },
    { label: "Celular", valor: c.telCelular },
  ].filter((p) => p.valor?.trim());

  if (!lista.length) return "";

  const msg = encodeURIComponent(
    `Olá, ${c.nome}. O contato é referente à uma retirada de equipamento da Claro no contrato ${c.contrato}`,
  );

  const itens = lista
    .map(({ label, valor }) => {
      const digits = valor.replace(/\D/g, "").replace(/^0/, "");
      const intl = digits.startsWith("55") ? digits : `55${digits}`;
      return `
      <div class="phone-item">
        <span class="phone-label">${label}: <strong>${escHtml(valor)}</strong></span>
        <div class="phone-btns">
          <a href="tel:+${digits}" class="btn-phone btn-ligar"><i data-lucide="phone" class="icon icon-sm"></i> Ligar</a>
          <a href="https://wa.me/${intl}?text=${msg}" class="btn-phone btn-whats" target="_blank"><i data-lucide="message-circle" class="icon icon-sm"></i> WhatsApp</a>
        </div>
      </div>`;
    })
    .join("");

  return `<div class="phone-titulo">Telefones</div>${itens}`;
}

// =========================================
// UPLOAD DE FOTOS (ImgBB)
// =========================================
async function uploadFoto(file) {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const resp = await fetchComTimeout(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: form },
    UPLOAD_TIMEOUT_MS,
  );
  if (!resp.ok) throw new Error("Falha no upload da foto");
  const json = await resp.json();
  return json.secure_url;
}

async function uploadTodasFotos(arquivos) {
  if (!arquivos?.length) return "";
  const urls = [];
  for (const file of arquivos) {
    const url = await uploadFoto(file);
    urls.push(url);
  }
  return urls.join(" | ");
}

// Comprime foto via Canvas antes de armazenar — reduz de ~5MB para ~300KB
// Resolve "espaço insuficiente" em dispositivos com pouca memória
async function comprimirFoto(file, maxLado = 1280, qualidade = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxLado || h > maxLado) {
        if (w >= h) {
          h = Math.round((h * maxLado) / w);
          w = maxLado;
        } else {
          w = Math.round((w * maxLado) / h);
          h = maxLado;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      img.src = ""; // libera decoded image da memória antes de gerar o blob
      canvas.toBlob(
        (blob) => {
          canvas.width = 0; // libera buffer RGBA do canvas imediatamente
          canvas.height = 0;
          if (!blob) {
            resolve(file);
            return;
          }
          const nome = file.name.replace(/\.\w+$/, ".jpg");
          resolve(new File([blob], nome, { type: "image/jpeg" }));
        },
        "image/jpeg",
        qualidade,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function criarInputFoto() {
  return `
    <label class="detalhe-label" style="margin:10px 0 6px;display:block">
      Fotos de evidência
    </label>
    <div class="foto-btns-row">
      <label class="btn-foto-label btn-foto-camera">
        <i data-lucide="camera" class="icon icon-sm"></i> Câmera
        <input type="file" id="foto-camera" accept="image/*" capture="environment" class="foto-input-hidden" />
      </label>
      <label class="btn-foto-label btn-foto-galeria">
        <i data-lucide="image" class="icon icon-sm"></i> Galeria
        <input type="file" id="foto-galeria" accept="image/*" multiple class="foto-input-hidden" />
      </label>
    </div>
    <div id="foto-preview" class="foto-preview"></div>`;
}

function configurarPreviewFotos() {
  _fotoArquivos = [];

  async function adicionarFotos(files) {
    const preview = document.getElementById("foto-preview");
    if (preview)
      preview.innerHTML = `<span class="foto-comprimindo">Processando...</span>`;
    for (const file of Array.from(files)) {
      const comprimido = await comprimirFoto(file);
      _fotoArquivos.push(comprimido);
    }
    renderizarPreviewFotos();
  }

  const camera = document.getElementById("foto-camera");
  const galeria = document.getElementById("foto-galeria");
  if (camera)
    camera.addEventListener("change", (e) =>
      adicionarFotos(Array.from(e.target.files)),
    );
  if (galeria)
    galeria.addEventListener("change", (e) =>
      adicionarFotos(Array.from(e.target.files)),
    );
}

function renderizarPreviewFotos() {
  const preview = document.getElementById("foto-preview");
  if (!preview) return;
  // Revoga blob URLs anteriores antes de limpar o DOM
  preview.querySelectorAll("img[data-blob-url]").forEach((img) => {
    URL.revokeObjectURL(img.dataset.blobUrl);
  });
  preview.innerHTML = "";
  _fotoArquivos.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "foto-thumb-wrap";
    const img = document.createElement("img");
    img.className = "foto-thumb-preview";
    const blobUrl = URL.createObjectURL(file);
    img.src = blobUrl;
    img.dataset.blobUrl = blobUrl;
    const btn = document.createElement("button");
    btn.className = "foto-thumb-remove";
    btn.title = "Remover";
    btn.textContent = "×";
    btn.addEventListener("click", () => {
      URL.revokeObjectURL(blobUrl);
      _fotoArquivos.splice(idx, 1);
      renderizarPreviewFotos();
    });
    wrap.appendChild(img);
    wrap.appendChild(btn);
    preview.appendChild(wrap);
  });
}

function criarFotosModal(fotoExec) {
  if (!fotoExec?.trim()) return "";
  const urls = fotoExec.split(/\s*\|\s*/).filter(Boolean);
  const thumbs = urls
    .map(
      (url) =>
        `<a href="${url}" target="_blank"><img src="${url}" class="foto-thumb" loading="lazy" /></a>`,
    )
    .join("");
  return `<div class="detalhe-campo">
    <span class="detalhe-label">Evidências (${urls.length} foto${urls.length > 1 ? "s" : ""})</span>
    <div class="fotos-grid">${thumbs}</div>
  </div>`;
}

// =========================================
// VALIDAÇÃO DE FOTOS + SELEÇÃO DE SERIAIS
// =========================================
function validarFotos() {
  if (!_fotoArquivos.length) {
    if (!navigator.onLine) return true; // offline: bypass
    mostrarToast("Anexe ao menos uma foto de evidência.", "aviso");
    return false;
  }
  return true;
}

function criarSeletorSeriaisHTML(terminais) {
  const lista = parsearSeriais(terminais);
  if (!lista.length) return "";
  const chips = lista
    .map(
      (s) =>
        `<span class="serial-chip serial-selec" data-serial="${s}" onclick="toggleSerial(this)">${s}</span>`,
    )
    .join("");
  return `<div class="detalhe-campo" style="margin-bottom:14px">
    <span class="detalhe-label">Equipamentos retirados — toque para selecionar</span>
    <button type="button" class="btn-sel-todos" onclick="selecionarTodosSeriais()">Selecionar todos</button>
    <div class="seriais-lista" id="seriais-selec">${chips}</div>
  </div>`;
}

function toggleSerial(el) {
  el.classList.toggle("serial-selecionado");
  _salvarEstadoModal({ seriais: getSeriaisSelecionados() });
}

function selecionarTodosSeriais() {
  document
    .querySelectorAll("#seriais-selec .serial-selec")
    .forEach((el) => el.classList.add("serial-selecionado"));
  _salvarEstadoModal({ seriais: getSeriaisSelecionados() });
}

function getSeriaisSelecionados() {
  return Array.from(
    document.querySelectorAll("#seriais-selec .serial-selecionado"),
  )
    .map((el) => el.dataset.serial)
    .join(" / ");
}

// =========================================
// TUTORIAL
// =========================================
const TUTORIAL_PASSOS = [
  {
    lucideIcon: "sparkles",
    titulo: "Bem-vindo ao Backlog Safra",
    texto: `Este sistema mostra os contratos de retirada de equipamentos da Claro.<br/><br/>
            Só você e sua equipe têm acesso. Qualquer atualização feita aqui é salva automaticamente na planilha.`,
  },
  {
    lucideIcon: "search",
    titulo: "Busca e Filtros",
    texto: `Use a <strong>barra de busca</strong> para encontrar um cliente pelo nome, número do contrato ou endereço.<br/><br/>
            Use os <strong>filtros</strong> abaixo para refinar por cidade, bairro, status e tipo de desconexão.<br/><br/>
            O botão <strong>"Limpar filtros"</strong> reseta tudo de uma vez. Os filtros ficam salvos entre sessões.`,
  },
  {
    lucideIcon: "layout-list",
    titulo: "Entendendo os Cartões",
    texto: `Cada cartão é um contrato. A <strong>cor da borda esquerda</strong> indica o status:<br/><br/>
            🟡 <strong>Amarelo</strong> — Pendente (ainda não atendido)<br/>
            🟢 <strong>Verde</strong> — Retirado com sucesso<br/>
            🔴 <strong>Vermelho</strong> — Quebra (não foi possível retirar)<br/><br/>
            Se houver um novo endereço em OBS 2, ele aparece no cartão com a tag <em>"Novo end."</em>`,
  },
  {
    lucideIcon: "file-text",
    titulo: "Detalhes do Contrato",
    texto: `Toque em qualquer cartão para ver <strong>todos os detalhes</strong>:<br/><br/>
            • Endereço completo e novo endereço (se houver)<br/>
            • OBS 1 (observação padrão) e OBS 2 (observação específica)<br/>
            • Seriais dos equipamentos a retirar<br/>
            • Tipo de desconexão<br/>
            • Histórico de execução (quem fez, quando, código OS)`,
  },
  {
    lucideIcon: "phone",
    titulo: "Ligar e enviar WhatsApp",
    texto: `Dentro dos detalhes, para cada telefone cadastrado aparecem dois botões:<br/><br/>
            📞 <strong>Ligar</strong> — abre o discador do celular diretamente<br/>
            💬 <strong>WhatsApp</strong> — abre o WhatsApp com a mensagem já preenchida automaticamente, informando o nome do cliente e o número do contrato.<br/><br/>
            Basta tocar em <em>Enviar</em> no WhatsApp.`,
  },
  {
    lucideIcon: "check-circle",
    titulo: "Marcar como Retirado",
    texto: `Quando conseguir retirar o equipamento:<br/><br/>
            1. Abra o contrato<br/>
            2. Toque em <strong>"Marcar como Retirado"</strong><br/>
            3. Escreva uma observação se necessário<br/>
            4. Anexe as <strong>fotos de evidência</strong> (recomendado)<br/>
            5. Toque em <strong>"Confirmar Retirado"</strong><br/><br/>
            O status é atualizado na planilha automaticamente com data, hora e seu nome.`,
  },
  {
    lucideIcon: "x-circle",
    titulo: "Marcar como Quebra",
    texto: `Se não for possível retirar o equipamento:<br/><br/>
            1. Abra o contrato<br/>
            2. Toque em <strong>"Marcar como Quebra"</strong><br/>
            3. Selecione o <strong>motivo correto</strong> na lista (ex: 106 - Cliente Ausente)<br/>
            4. Escreva uma observação e anexe fotos se tiver<br/>
            5. Toque em <strong>"Confirmar Quebra"</strong><br/><br/>
            ⚠️ Escolha o motivo certo — isso alimenta os relatórios do supervisor.`,
  },
  {
    lucideIcon: "camera",
    titulo: "Enviando Evidências",
    texto: `Ao confirmar uma baixa (retirado ou quebra), você pode <strong>anexar fotos</strong> diretamente pelo site.<br/><br/>
            As fotos ficam salvas na nuvem e qualquer pessoa com acesso ao sistema pode ver.<br/><br/>
            Isso substitui o envio pelo grupo do WhatsApp.<br/><br/>
            💡 <em>Tire a foto do serial do equipamento, geolocalização e tentativa de contato.</em>`,
  },
  {
    lucideIcon: "navigation",
    titulo: "Localização e Distâncias",
    texto: `O botão <strong>Localização</strong> nos filtros ativa o GPS do seu celular.<br/><br/>
            Com a localização ativa, cada contrato exibe a distância até o endereço (ex: <em>1,2 km</em>), calculada em linha reta.<br/><br/>
            Você também pode usar o filtro <strong>Distância</strong> para mostrar apenas contratos dentro de um raio (500m, 1km, 5km, 10km).<br/><br/>
            💡 As distâncias são aproximadas — o trânsito real pode variar.`,
  },
  {
    lucideIcon: "route",
    titulo: "Modo Rota",
    texto: `O botão <strong>Rota</strong> ativa um modo especial onde você seleciona os contratos que quer visitar em sequência.<br/><br/>
            1. Toque em <strong>Rota</strong> nos filtros<br/>
            2. Toque nos cartões dos contratos desejados (até 9 paradas)<br/>
            3. Toque em <strong>Abrir no Maps</strong> na barra inferior para abrir a rota no Google Maps<br/><br/>
            Para cancelar o modo rota, toque no <strong>X</strong> na barra inferior ou no botão <strong>Cancelar rota</strong>.`,
  },
  {
    lucideIcon: "layers",
    titulo: "Agrupar por Rua",
    texto: `O botão <strong>Por rua</strong> reorganiza a lista agrupando todos os contratos de uma mesma rua juntos.<br/><br/>
            Isso facilita planejar visitas numa mesma região sem precisar se deslocar várias vezes.<br/><br/>
            Quando o agrupamento está ativo, aparece um seletor de <strong>Ordenação</strong>:<br/>
            • <em>A–Z</em> — alfabética pelo nome da rua<br/>
            • <em>Mais contratos</em> — ruas com mais trabalho primeiro<br/>
            • <em>Menos contratos</em> — ruas com menos trabalho primeiro`,
  },
];

let tutorialPasso = 0;

function abrirTutorial() {
  tutorialPasso = 0;
  renderizarPasso();
  document.getElementById("modal-tutorial").classList.remove("hidden");
}

function fecharTutorial() {
  document.getElementById("modal-tutorial").classList.add("hidden");
}

function renderizarPasso() {
  const total = TUTORIAL_PASSOS.length;
  const passo = TUTORIAL_PASSOS[tutorialPasso];

  document.getElementById("tut-atual").textContent = tutorialPasso + 1;
  document.getElementById("tut-total").textContent = total;

  // Dots
  document.getElementById("tutorial-dots").innerHTML = TUTORIAL_PASSOS.map(
    (_, i) =>
      `<span class="tut-dot ${i === tutorialPasso ? "tut-dot-ativo" : ""}"></span>`,
  ).join("");

  // Conteúdo
  document.getElementById("tutorial-body").innerHTML = `
    <div class="tut-icone"><i data-lucide="${passo.lucideIcon}" class="icon icon-tut-grande"></i></div>
    <div class="tut-titulo">${passo.titulo}</div>
    <div class="tut-texto">${passo.texto}</div>`;
  renderIcons();

  // Botões
  const prev = document.getElementById("tut-prev");
  const next = document.getElementById("tut-next");
  prev.disabled = tutorialPasso === 0;
  next.textContent = tutorialPasso === total - 1 ? "Fechar ✓" : "Próximo →";
}

function tutorialAnterior() {
  if (tutorialPasso > 0) {
    tutorialPasso--;
    renderizarPasso();
  }
}

function tutorialProximo() {
  if (tutorialPasso < TUTORIAL_PASSOS.length - 1) {
    tutorialPasso++;
    renderizarPasso();
  } else {
    fecharTutorial();
  }
}

// =========================================
// ESTADOS VISUAIS
// =========================================
function mostrarCarregando() {
  document.getElementById("resultado-count").textContent =
    "Carregando contratos...";
  document.getElementById("lista-contratos").innerHTML =
    `<div class="estado-vazio"><div class="icone"><i data-lucide="loader" class="icon icon-estado"></i></div><p>Buscando contratos na planilha...</p></div>`;
  renderIcons();
}

function mostrarErro(msg) {
  document.getElementById("resultado-count").textContent = "Erro ao carregar";
  document.getElementById("lista-contratos").innerHTML =
    `<div class="estado-erro"><p><i data-lucide="alert-triangle" class="icon icon-sm"></i> ${msg}</p><button class="btn-tentar-novamente" onclick="carregarContratos()">Tentar novamente</button></div>`;
  renderIcons();
}

function mostrarVazio(msg) {
  document.getElementById("lista-contratos").innerHTML =
    `<div class="estado-vazio"><div class="icone"><i data-lucide="clipboard-list" class="icon icon-estado"></i></div><p>${msg}</p></div>`;
  renderIcons();
}

// =========================================
// HISTÓRICO PESSOAL DO TÉCNICO
// =========================================
function abrirHistoricoPessoal() {
  document.getElementById("app-principal").classList.add("hidden");
  document.getElementById("tela-historico-pessoal").classList.remove("hidden");
  renderizarHistoricoPessoal();
}

function fecharHistoricoPessoal() {
  document.getElementById("tela-historico-pessoal").classList.add("hidden");
  document.getElementById("app-principal").classList.remove("hidden");
}

function renderizarHistoricoPessoal() {
  const conteudo = document.getElementById("mh-conteudo");
  if (!conteudo) return;
  const statusFiltro = document.getElementById("mh-filter-status")?.value || "";
  const busca = (
    document.getElementById("mh-search")?.value || ""
  ).toLowerCase();
  const { usuario } = tecnicoLogado() || {};
  const usuarioLow = usuario?.trim().toLowerCase() || "";

  const EXEC_STATUS = new Set(["Retirado", "Parcial", "Quebra"]);
  let lista = contratos.filter((c) => {
    if (!EXEC_STATUS.has(c.status)) return false;
    if (c.tecnicoExec?.trim().toLowerCase() !== usuarioLow) return false;
    if (statusFiltro && c.status !== statusFiltro) return false;
    if (busca) {
      const texto =
        `${c.contrato} ${c.nome} ${c.endereco} ${c.cidade}`.toLowerCase();
      if (!texto.includes(busca)) return false;
    }
    return true;
  });

  lista = lista.sort(
    (a, b) => parseDateBR(b.dataExec) - parseDateBR(a.dataExec),
  );

  if (!lista.length) {
    conteudo.innerHTML = `<div class="estado-vazio"><p>Nenhuma execução encontrada.</p></div>`;
    return;
  }

  const total = lista.length;
  const totRet = lista.filter((c) => c.status === "Retirado").length;
  const totPar = lista.filter((c) => c.status === "Parcial").length;
  const totQbr = lista.filter((c) => c.status === "Quebra").length;

  const itens = lista
    .map((c) => {
      const stCls = statusParaClasse(c.status);
      const connectBadge = c.noConnect
        ? `<span class="mh-badge-connect">Connect ✓</span>`
        : "";
      const seriais = c.seriaisRet
        ? `<div class="mh-seriais"><i data-lucide="package" class="icon icon-xs"></i> ${escHtml(c.seriaisRet)}</div>`
        : "";
      const obs = c.obsExec
        ? `<div class="mh-obs">${escHtml(c.obsExec)}</div>`
        : "";
      const fotos = c.fotoExec
        ? `<span class="mh-badge-foto"><i data-lucide="camera" class="icon icon-xs"></i> ${c.fotoExec.split(/\s*\|\s*/).filter(Boolean).length} foto(s)</span>`
        : "";
      return `<div class="mh-item" onclick="abrirModalPorId('${escHtml(c.id)}')">
      <div class="mh-item-header">
        <span class="badge ${stCls}">${escHtml(c.status)}</span>
        <span class="mh-data">${escHtml(c.dataExec || "—")}</span>
      </div>
      <div class="mh-nome">${escHtml(c.nome)}</div>
      <div class="mh-end">${escHtml(c.endereco)}${c.cidade !== "—" ? `, ${escHtml(c.cidade)}` : ""}</div>
      <div class="mh-item-footer">
        ${fotos}${connectBadge}
      </div>
      ${seriais}${obs}
    </div>`;
    })
    .join("");

  // Meta do dia por cidade
  const { cidades: cidadesTec } = tecnicoLogado() || {};
  let metaHTML = "";
  if (cidadesTec?.length) {
    const agora = new Date();
    const inicioHoje = new Date(agora);
    inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(agora);
    fimHoje.setHours(23, 59, 59, 999);
    const diasNoMes = new Date(
      agora.getFullYear(),
      agora.getMonth() + 1,
      0,
    ).getDate();

    const cards = cidadesTec
      .map((cidade) => {
        const cidadeLow = cidade.toLowerCase();
        const totalCidade = contratos.filter(
          (c) => c.cidade.toLowerCase() === cidadeLow,
        ).length;
        const meta =
          totalCidade > 0
            ? Math.max(1, Math.round(totalCidade / diasNoMes))
            : 0;
        const feitosHoje = contratos.filter((c) => {
          if (c.cidade.toLowerCase() !== cidadeLow) return false;
          if (c.tecnicoExec?.trim().toLowerCase() !== usuarioLow) return false;
          const ts = parseDateBR(c.dataExec);
          return ts && ts >= inicioHoje.getTime() && ts <= fimHoje.getTime();
        }).length;
        const pct =
          meta > 0 ? Math.min(100, Math.round((feitosHoje / meta) * 100)) : 0;
        const ok = feitosHoje >= meta;
        return `<div class="mh-meta-card${ok ? " mh-meta-ok" : ""}">
        <div class="mh-meta-cidade">${escHtml(cidade)}</div>
        <div class="mh-meta-numeros">
          <span class="mh-meta-feitos">${feitosHoje}</span>
          <span class="mh-meta-sep">/</span>
          <span class="mh-meta-alvo">${meta} hoje</span>
        </div>
        <div class="mh-meta-barra-bg">
          <div class="mh-meta-barra-fill${ok ? " mh-meta-barra-ok" : ""}" style="width:${pct}%"></div>
        </div>
        <div class="mh-meta-sub">${totalCidade} contratos · ${diasNoMes} dias no mês</div>
      </div>`;
      })
      .join("");
    metaHTML = `<div class="mh-meta-titulo"><i data-lucide="target" class="icon icon-xs"></i> Meta do dia</div><div class="mh-meta-grid">${cards}</div>`;
  }

  conteudo.innerHTML = `
    ${metaHTML}
    <div class="mh-resumo">
      <span class="hist-dia-chip chip-ret">Retirados: <strong>${totRet}</strong></span>
      <span class="hist-dia-chip chip-par">Parciais: <strong>${totPar}</strong></span>
      <span class="hist-dia-chip chip-qbr">Quebras: <strong>${totQbr}</strong></span>
      <span class="hist-dia-chip chip-tot">Total: <strong>${total}</strong></span>
    </div>
    <div class="mh-lista">${itens}</div>`;
  renderIcons();
}

// =========================================
// PAINEL ADMINISTRATIVO
// =========================================
let adminTabAtiva = "metricas";

function abrirAdmin() {
  document.getElementById("app-principal").classList.add("hidden");
  document.getElementById("tela-admin").classList.remove("hidden");
  preencherFiltrosAdmin();
  renderizarAdmin();
}

function voltarLista() {
  document.getElementById("tela-admin").classList.add("hidden");
  document.getElementById("app-principal").classList.remove("hidden");
}

function mudarTabAdmin(tab) {
  adminTabAtiva = tab;
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.classList.toggle("admin-tab-ativo", btn.dataset.tab === tab);
  });
  renderizarAdmin();
}

function preencherFiltrosAdmin() {
  const cidades = [
    ...new Set(contratos.map((c) => c.cidade).filter(Boolean)),
  ].sort();
  const tecnicos = [
    ...new Set(
      [
        ...contratos.map((c) => c.tecnicoDesig),
        ...contratos.map((c) => c.tecnicoExec),
      ].filter(Boolean),
    ),
  ].sort();
  preencherSelect("adm-filter-cidade", cidades, "Cidade");
  preencherSelect("adm-filter-tecnico", tecnicos, "Técnico");
}

function getContratosAdmin() {
  const cidade = document.getElementById("adm-filter-cidade").value;
  const tecnico = document.getElementById("adm-filter-tecnico").value;
  const periodo = document.getElementById("adm-filter-periodo")?.value || "";
  return contratos.filter(
    (c) =>
      (!cidade || c.cidade === cidade) &&
      (!tecnico || c.tecnicoDesig === tecnico || c.tecnicoExec === tecnico) &&
      filtrarPorPeriodo(c, periodo),
  );
}

function getContratosAdminSemPeriodo() {
  const cidade = document.getElementById("adm-filter-cidade").value;
  const tecnico = document.getElementById("adm-filter-tecnico").value;
  return contratos.filter(
    (c) =>
      (!cidade || c.cidade === cidade) &&
      (!tecnico || c.tecnicoDesig === tecnico || c.tecnicoExec === tecnico),
  );
}

function renderizarAdmin() {
  _destruirGraficos(); // limpa instâncias Chart.js ao trocar de aba
  const lista = getContratosAdmin();
  const conteudo = document.getElementById("admin-conteudo");
  if (adminTabAtiva === "distribuir") {
    conteudo.innerHTML = renderizarDistribuirHTML();
    renderIcons();
    return;
  }
  if (adminTabAtiva === "metricas")
    conteudo.innerHTML = renderizarMetricasHTML(lista);
  else if (adminTabAtiva === "historico")
    conteudo.innerHTML = renderizarHistoricoHTML(lista);
  else if (adminTabAtiva === "relatorio")
    conteudo.innerHTML = renderizarRelatorioHTML();
  else if (adminTabAtiva === "projecao") {
    const dados = _calcularDadosProjecao(
      getContratosAdminSemPeriodo(),
      _filtroProjecao,
    );
    conteudo.innerHTML = renderizarProjecaoHTML(dados);
    renderIcons();
    requestAnimationFrame(() => _initGraficos(dados));
    return;
  } else if (adminTabAtiva === "tecnicos") {
    conteudo.innerHTML = `<div class="estado-vazio presenca-carregando"><p><i data-lucide="loader" class="icon icon-sm"></i> Carregando presenças...</p></div>`;
    renderIcons();
    carregarPresenca().then((dados) => {
      if (adminTabAtiva !== "tecnicos") return;
      conteudo.innerHTML = renderizarPresencaHTML(dados);
      renderIcons();
    });
    return;
  }
  renderIcons();
}

async function carregarPresenca() {
  try {
    const resp = await fetchComTimeout(`${GAS_URL}?action=presenca`);
    const json = await resp.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

function renderizarPresencaHTML(lista) {
  if (!lista.length) {
    return `<div class="estado-vazio"><p>Nenhum técnico encontrado.</p></div>`;
  }

  const LABEL = {
    online: "Online",
    recente: "Recente",
    ausente: "Ausente",
    offline: "Offline",
    nunca: "Nunca acessou",
  };

  const ordenada = [...lista].sort((a, b) => {
    const ordem = { online: 0, recente: 1, ausente: 2, offline: 3, nunca: 4 };
    return (
      (ordem[statusPresenca(a["ULTIMO_ACESSO"])] ?? 4) -
      (ordem[statusPresenca(b["ULTIMO_ACESSO"])] ?? 4)
    );
  });

  const cards = ordenada
    .map((t) => {
      const acesso = t["ULTIMO_ACESSO"] || "";
      const login = t["ULTIMO_LOGIN"] || "";
      const status = statusPresenca(acesso);
      const nome = toTitleCase(t["NOME"] || t["USUARIO"] || "—");
      const isAdm = t["ADM"]?.trim().toUpperCase() === "SIM";
      const cidades = t["CIDADES"]?.trim() || "Todas";

      return `
      <div class="presenca-card presenca-${status}">
        <div class="presenca-dot-wrap">
          <span class="presenca-dot dot-${status}"></span>
        </div>
        <div class="presenca-info">
          <div class="presenca-nome">
            ${escHtml(nome)}
            ${isAdm ? `<span class="presenca-badge-adm">ADM</span>` : ""}
          </div>
          <div class="presenca-detalhe">
            <i data-lucide="activity" class="icon icon-xs"></i>
            Último acesso: <strong>${escHtml(tempoRelativo(acesso))}</strong>
            ${acesso ? `<span class="presenca-ts">${escHtml(acesso.split(",")[0])}</span>` : ""}
          </div>
          <div class="presenca-detalhe">
            <i data-lucide="log-in" class="icon icon-xs"></i>
            Último login: <span>${escHtml(tempoRelativo(login))}</span>
          </div>
          <div class="presenca-cidades">
            <i data-lucide="map-pin" class="icon icon-xs"></i>
            ${escHtml(cidades)}
          </div>
        </div>
        <span class="presenca-status-label presenca-label-${status}">${LABEL[status]}</span>
      </div>`;
    })
    .join("");

  const contadores = ["online", "recente", "ausente", "offline", "nunca"]
    .map((s) => {
      const n = ordenada.filter(
        (t) => statusPresenca(t["ULTIMO_ACESSO"]) === s,
      ).length;
      if (!n) return "";
      return `<span class="presenca-resumo-item presenca-label-${s}">${LABEL[s]}: ${n}</span>`;
    })
    .join("");

  return `
    <div class="admin-secao">
      <div class="presenca-header">
        <h3 class="admin-secao-titulo">Técnicos — Presença</h3>
        <div class="presenca-resumo">${contadores}</div>
        <button class="btn-presenca-refresh" onclick="renderizarAdmin()">
          <i data-lucide="refresh-cw" class="icon icon-xs"></i> Atualizar
        </button>
      </div>
      <p class="presenca-legenda">
        <span class="dot-online presenca-dot-inline"></span> Online: ativo nos últimos 6 min &nbsp;
        <span class="dot-recente presenca-dot-inline"></span> Recente: até 30 min &nbsp;
        <span class="dot-ausente presenca-dot-inline"></span> Ausente: até 8h &nbsp;
        <span class="dot-offline presenca-dot-inline"></span> Offline: mais de 8h
      </p>
      <div class="presenca-grid">${cards}</div>
    </div>`;
}

function renderizarMetricasHTML(lista) {
  const total = lista.length;
  const retirados = lista.filter((c) => c.status === "Retirado").length;
  const quebras = lista.filter((c) => c.status === "Quebra").length;
  const pendentes = lista.filter((c) => c.status === "Pendente").length;
  const taxa = total > 0 ? Math.round((retirados / total) * 100) : 0;

  const cidades = [...new Set(lista.map((c) => c.cidade))].sort();
  const linhasCidade = cidades
    .map((cidade) => {
      const cx = lista.filter((c) => c.cidade === cidade);
      const r = cx.filter((c) => c.status === "Retirado").length;
      const q = cx.filter((c) => c.status === "Quebra").length;
      const p = cx.filter((c) => c.status === "Pendente").length;
      return `<tr><td>${escHtml(cidade)}</td><td class="num-pendente">${p}</td><td class="num-retirado">${r}</td><td class="num-quebra">${q}</td><td>${cx.length}</td></tr>`;
    })
    .join("");

  const tecnicos = [
    ...new Set(lista.map((c) => c.tecnicoExec).filter(Boolean)),
  ].sort();
  const linhasTecnico = tecnicos
    .map((tec) => {
      const tx = lista.filter((c) => c.tecnicoExec === tec);
      const r = tx.filter((c) => c.status === "Retirado").length;
      const q = tx.filter((c) => c.status === "Quebra").length;
      return `<tr><td>${escHtml(tec)}</td><td class="num-retirado">${r}</td><td class="num-quebra">${q}</td><td>${tx.length}</td></tr>`;
    })
    .join("");

  return `
    <div class="metricas-resumo">
      <div class="metrica-card"><div class="metrica-num">${total}</div><div class="metrica-label">Total</div></div>
      <div class="metrica-card metrica-pendente"><div class="metrica-num">${pendentes}</div><div class="metrica-label">Pendentes</div></div>
      <div class="metrica-card metrica-retirado"><div class="metrica-num">${retirados}</div><div class="metrica-label">Retirados</div></div>
      <div class="metrica-card metrica-quebra"><div class="metrica-num">${quebras}</div><div class="metrica-label">Quebras</div></div>
      <div class="metrica-card metrica-taxa"><div class="metrica-num">${taxa}%</div><div class="metrica-label">Conclusão</div></div>
    </div>

    <div class="admin-secao">
      <h3 class="admin-secao-titulo">Por Cidade</h3>
      <div class="tabela-scroll">
        <table class="admin-table">
          <thead><tr><th>Cidade</th><th>Pendente</th><th>Retirado</th><th>Quebra</th><th>Total</th></tr></thead>
          <tbody>${linhasCidade || '<tr><td colspan="5" class="tabela-vazia">Nenhum dado</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    ${
      tecnicos.length
        ? `
    <div class="admin-secao">
      <h3 class="admin-secao-titulo">Por Técnico (Execução)</h3>
      <div class="tabela-scroll">
        <table class="admin-table">
          <thead><tr><th>Técnico</th><th>Retirado</th><th>Quebra</th><th>Total baixas</th></tr></thead>
          <tbody>${linhasTecnico}</tbody>
        </table>
      </div>
    </div>`
        : ""
    }`;
}

function criarToggleHistSubView() {
  return `<div class="hist-subview-toggle">
    <button class="btn-subview ${histSubView === "lista" ? "btn-subview-ativo" : ""}" onclick="mudarHistSubView('lista')">
      <i data-lucide="list" class="icon icon-xs"></i> Lista
    </button>
    <button class="btn-subview ${histSubView === "dia" ? "btn-subview-ativo" : ""}" onclick="mudarHistSubView('dia')">
      <i data-lucide="calendar-days" class="icon icon-xs"></i> Por dia
    </button>
  </div>`;
}

function mudarHistSubView(v) {
  histSubView = v;
  renderizarAdmin();
}

function renderizarHistoricoHTML(lista) {
  if (histSubView === "dia") return renderizarHistoricoPosDiaHTML(lista);

  const filtroStatus =
    document.getElementById("adm-filter-hist-status")?.value || "Retirado";
  const filtroSite =
    document.getElementById("adm-filter-hist-site")?.value || "Todos";

  const baixas = lista
    .filter((c) => {
      if (filtroStatus === "Todos")
        return (
          c.status === "Retirado" ||
          c.status === "Quebra" ||
          c.status === "Parcial"
        );
      if (filtroStatus === "Retirado")
        return c.status === "Retirado" || c.status === "Parcial";
      return c.status === filtroStatus;
    })
    .filter((c) => filtroSite !== "Site" || c.baixaSite === "Sim")
    .sort((a, b) => parseDateBR(b.dataExec) - parseDateBR(a.dataExec));

  const filtrosHTML = `<div class="hist-filtros-linha">${criarFiltroHistStatus(filtroStatus)}${criarFiltroHistSite(filtroSite)}</div>`;

  if (!baixas.length) {
    return `<div class="admin-secao">
      ${criarToggleHistSubView()}
      ${filtrosHTML}
      <div class="estado-vazio"><p>Nenhuma baixa encontrada.</p></div>
    </div>`;
  }

  const linhas = baixas
    .map((c) => {
      const cls = statusParaClasse(c.status);
      const viaSite =
        c.baixaSite === "Sim"
          ? `<span class="badge-site-sim" title="Baixa registrada pelo App">App</span>`
          : `<span class="badge-site-nao">—</span>`;
      const connectBadge = c.noConnect
        ? `<span class="badge-connect-ok" title="Lançado no Connect">✓</span>`
        : `<span class="badge-connect-pendente" title="Pendente no Connect">—</span>`;
      return `<tr class="hist-linha" data-id="${escHtml(c.id)}">
        <td>${escHtml(c.contrato)}</td>
        <td>${escHtml(c.nome)}</td>
        <td>${escHtml(c.cidade)}</td>
        <td><span class="badge-status badge-${cls} badge-sm">${escHtml(c.status)}</span></td>
        <td>${c.tecnicoExec ? escHtml(c.tecnicoExec) : "—"}</td>
        <td class="col-data">${c.dataExec ? escHtml(c.dataExec.split(" ")[0]) : "—"}</td>
        <td class="col-connect">${connectBadge}</td>
        <td class="col-via-site">${viaSite}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="admin-secao">
      ${criarToggleHistSubView()}
      ${filtrosHTML}
      <p class="historico-count">${baixas.length} registro(s)</p>
      <div class="tabela-scroll">
        <table class="admin-table">
          <thead><tr><th>Contrato</th><th>Nome</th><th>Cidade</th><th>Status</th><th>Técnico</th><th>Data</th><th>Connect</th><th>Via App</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>`;
}

function renderizarHistoricoPosDiaHTML(lista) {
  const filtroSite =
    document.getElementById("adm-filter-hist-site")?.value || "Todos";

  const umMesAtras = new Date();
  umMesAtras.setMonth(umMesAtras.getMonth() - 1);
  umMesAtras.setHours(0, 0, 0, 0);

  const filtrosHTML = criarFiltroHistSite(filtroSite);

  const comExec = lista.filter((c) => {
    if (!c.dataExec) return false;
    if (
      c.status !== "Retirado" &&
      c.status !== "Parcial" &&
      c.status !== "Quebra"
    )
      return false;
    const dt = parseDateBR(c.dataExec);
    if (!dt || dt < umMesAtras) return false;
    if (filtroSite === "Site" && c.baixaSite !== "Sim") return false;
    return true;
  });

  if (!comExec.length) {
    return `<div class="admin-secao">
      ${criarToggleHistSubView()}
      ${filtrosHTML}
      <div class="estado-vazio"><p>Nenhuma execução encontrada.</p></div>
    </div>`;
  }

  // Agrupa por data (DD/MM/YYYY) — extrai apenas a parte da data via regex
  const porDia = {};
  comExec.forEach((c) => {
    const m = c.dataExec.match(/(\d{2}\/\d{2}\/\d{4})/);
    const dia = m ? m[1] : c.dataExec;
    if (!porDia[dia]) porDia[dia] = { retirado: 0, parcial: 0, quebra: 0 };
    if (c.status === "Retirado") porDia[dia].retirado++;
    else if (c.status === "Parcial") porDia[dia].parcial++;
    else if (c.status === "Quebra") porDia[dia].quebra++;
  });

  const dias = Object.entries(porDia).sort(
    ([a], [b]) => parseDateBR(b) - parseDateBR(a),
  );

  const totRet = dias.reduce((s, [, d]) => s + d.retirado, 0);
  const totPar = dias.reduce((s, [, d]) => s + d.parcial, 0);
  const totQbr = dias.reduce((s, [, d]) => s + d.quebra, 0);
  const totGeral = totRet + totPar + totQbr;

  const linhas = dias
    .map(([dia, d]) => {
      const total = d.retirado + d.parcial + d.quebra;
      const taxaPct = Math.round(((d.retirado + d.parcial) / total) * 100);
      const taxaCls =
        taxaPct >= 70
          ? "num-retirado"
          : taxaPct >= 50
            ? "num-pendente"
            : "num-quebra";
      return `<tr>
      <td class="col-data-hist">${escHtml(dia)}</td>
      <td class="num-retirado">${d.retirado}</td>
      <td style="color:#8b5cf6;font-weight:700">${d.parcial || "—"}</td>
      <td class="num-quebra">${d.quebra || "—"}</td>
      <td><strong>${total}</strong></td>
      <td class="${taxaCls}">${taxaPct}%</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="admin-secao">
      ${criarToggleHistSubView()}
      ${filtrosHTML}
      <div class="hist-dia-resumo">
        <span class="hist-dia-chip chip-ret">Retirados: <strong>${totRet}</strong></span>
        <span class="hist-dia-chip chip-par">Parciais: <strong>${totPar}</strong></span>
        <span class="hist-dia-chip chip-qbr">Quebras: <strong>${totQbr}</strong></span>
        <span class="hist-dia-chip chip-tot">Total: <strong>${totGeral}</strong></span>
      </div>
      <div class="tabela-scroll">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Data</th>
              <th class="num-retirado">Retirados</th>
              <th style="color:#8b5cf6">Parciais</th>
              <th class="num-quebra">Quebras</th>
              <th>Total</th>
              <th>Taxa</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>`;
}

function criarFiltroHistStatus(valorAtual) {
  return `<div class="hist-filtro-status">
    <label class="hist-filtro-label">Mostrar:</label>
    <select id="adm-filter-hist-status" class="input-select-sm" onchange="renderizarAdmin()">
      <option value="Retirado" ${valorAtual === "Retirado" ? "selected" : ""}>Retirado + Parcial</option>
      <option value="Quebra" ${valorAtual === "Quebra" ? "selected" : ""}>Somente Quebras</option>
      <option value="Todos" ${valorAtual === "Todos" ? "selected" : ""}>Todos</option>
    </select>
  </div>`;
}

function criarFiltroHistSite(valorAtual) {
  return `<div class="hist-filtro-status">
    <label class="hist-filtro-label">Origem:</label>
    <select id="adm-filter-hist-site" class="input-select-sm" onchange="renderizarAdmin()">
      <option value="Todos" ${valorAtual === "Todos" ? "selected" : ""}>Todos</option>
      <option value="Site" ${valorAtual === "Site" ? "selected" : ""}>Somente via App</option>
    </select>
  </div>`;
}

function abrirModalPorId(id) {
  const c = contratos.find((x) => x.id === id);
  if (c) abrirModal(c);
}

// Classifica contrato como "opcao", "inad" ou "outro"
function categoriaTipo(c) {
  const t = (c.tipoDesconexao || "").toLowerCase();
  if (t.includes("inad")) return "inad";
  if (t.includes("op")) return "opcao";
  return "outro";
}

function calcularICGPorCidade(lista) {
  const mapa = {};
  lista.forEach((c) => {
    const cidade = c.cidade || "—";
    if (!mapa[cidade]) {
      mapa[cidade] = {
        cidade,
        mix: { desc: 0, rec: 0 },
        opcao: { desc: 0, rec: 0 },
        inad: { desc: 0, rec: 0 },
      };
    }
    const r = mapa[cidade];
    const recuperado = c.status === "Retirado" || c.status === "Parcial";
    r.mix.desc++;
    if (recuperado) r.mix.rec++;
    const cat = categoriaTipo(c);
    if (cat === "opcao") {
      r.opcao.desc++;
      if (recuperado) r.opcao.rec++;
    } else if (cat === "inad") {
      r.inad.desc++;
      if (recuperado) r.inad.rec++;
    }
  });
  return Object.values(mapa).sort((a, b) => a.cidade.localeCompare(b.cidade));
}

// Variante "Via App": conta apenas execuções com BAIXA_SITE="Sim" + todos os pendentes
function calcularICGPorCidadeViaSite(lista) {
  const mapa = {};
  lista.forEach((c) => {
    const cidade = c.cidade || "—";
    if (!mapa[cidade])
      mapa[cidade] = {
        cidade,
        mix: { desc: 0, rec: 0 },
        opcao: { desc: 0, rec: 0 },
        inad: { desc: 0, rec: 0 },
      };
    const r = mapa[cidade];
    const isPendente = c.status === "Pendente";
    const isViaSite = c.baixaSite === "Sim";
    const executadoViaSite =
      (c.status === "Retirado" ||
        c.status === "Parcial" ||
        c.status === "Quebra") &&
      isViaSite;
    if (!isPendente && !executadoViaSite) return;
    const recuperado =
      (c.status === "Retirado" || c.status === "Parcial") && isViaSite;
    r.mix.desc++;
    if (recuperado) r.mix.rec++;
    const cat = categoriaTipo(c);
    if (cat === "opcao") {
      r.opcao.desc++;
      if (recuperado) r.opcao.rec++;
    } else if (cat === "inad") {
      r.inad.desc++;
      if (recuperado) r.inad.rec++;
    }
  });
  return Object.values(mapa).sort((a, b) => a.cidade.localeCompare(b.cidade));
}

function icgCells(grp, meta) {
  if (!grp.desc) return `<td>—</td><td>—</td><td>—</td><td>—</td>`;
  const pend = grp.desc - grp.rec;
  const icg = grp.rec / grp.desc;
  const icgPct = (icg * 100).toFixed(2).replace(".", ",") + "%";
  const icgCls =
    icg >= meta
      ? "num-retirado"
      : icg >= meta * 0.8
        ? "num-pendente"
        : "num-quebra";
  return `<td>${grp.rec}</td><td>${pend}</td><td class="${icgCls}">${icgPct}</td><td>—</td>`;
}

function icgCellsMix(grp, meta) {
  if (!grp.desc) return `<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
  const pend = grp.desc - grp.rec;
  const icg = grp.rec / grp.desc;
  const falta = Math.max(0, meta - icg);
  const icgPct = (icg * 100).toFixed(2).replace(".", ",") + "%";
  const faltaPct =
    falta > 0 ? (falta * 100).toFixed(1).replace(".", ",") + "%" : "✓";
  const icgCls =
    icg >= meta
      ? "num-retirado"
      : icg >= meta * 0.8
        ? "num-pendente"
        : "num-quebra";
  return `<td>${grp.desc}</td><td>${grp.rec}</td><td>${pend}</td><td class="${icgCls}">${icgPct}</td><td class="${icgCls}">${faltaPct}</td>`;
}

function renderizarRelatorioHTML() {
  const filtroSiteRel =
    document.getElementById("adm-filter-rel-site")?.value || "Todos";
  const lista = getContratosAdmin();
  const dados =
    filtroSiteRel === "Site"
      ? calcularICGPorCidadeViaSite(lista)
      : calcularICGPorCidade(lista);
  const META_MIX = 0.78;
  const META_OPCAO = 1.0;
  const META_INAD = 0.7;
  const filtroSiteRelHTML = `<div class="hist-filtro-status" style="margin-bottom:12px">
    <label class="hist-filtro-label">Escopo:</label>
    <select id="adm-filter-rel-site" class="input-select-sm" onchange="renderizarAdmin()">
      <option value="Todos" ${filtroSiteRel === "Todos" ? "selected" : ""}>Todos os contratos</option>
      <option value="Site" ${filtroSiteRel === "Site" ? "selected" : ""}>Somente via App (+ pendentes)</option>
    </select>
  </div>`;

  const linhas = dados
    .map(
      (r) => `
    <tr>
      <td class="icg-cidade">${r.cidade}</td>
      ${icgCellsMix(r.mix, META_MIX)}
      ${icgCells(r.opcao, META_OPCAO)}
      ${icgCells(r.inad, META_INAD)}
    </tr>`,
    )
    .join("");

  const tabelaHTML = `
    <div class="tabela-scroll">
      <table class="admin-table icg-table">
        <thead>
          <tr class="icg-head-grupo">
            <th rowspan="2" class="icg-th-cidade">Cidade</th>
            <th colspan="5" class="icg-head-mix">MIX — DESC OPÇÃO + DESC INAD</th>
            <th colspan="4" class="icg-head-opcao">DESCONEXÃO POR OPÇÃO</th>
            <th colspan="4" class="icg-head-inad">DESCONEXÃO POR INAD</th>
          </tr>
          <tr class="icg-head-sub">
            <th>Desconect.</th><th>Recuper.</th><th>Pendentes</th><th>ICG</th><th>Falta p/Meta</th>
            <th>Recuper.</th><th>Pendentes</th><th>ICG</th><th>—</th>
            <th>Recuper.</th><th>Pendentes</th><th>ICG</th><th>—</th>
          </tr>
        </thead>
        <tbody>${linhas || '<tr><td colspan="14" class="tabela-vazia">Nenhum dado</td></tr>'}</tbody>
      </table>
    </div>`;

  const periodos =
    filtroSiteRel === "Site"
      ? calcularEficienciaPeriodosViaSite()
      : calcularEficienciaPeriodos();
  const linhasEfic = periodos
    .map((p) => {
      const taxa =
        p.total > 0
          ? Math.round(((p.retirados + p.parciais) / p.total) * 100)
          : 0;
      const taxaCls =
        taxa >= 70
          ? "num-retirado"
          : taxa >= 50
            ? "num-pendente"
            : "num-quebra";
      return `<tr>
      <td>${p.label}</td>
      <td class="num-pendente">${p.pendentes}</td>
      <td class="num-retirado">${p.retirados}</td>
      <td style="color:#8b5cf6;font-weight:700">${p.parciais}</td>
      <td class="num-quebra">${p.quebras}</td>
      <td>${p.total}</td>
      <td class="${taxaCls}">${taxa}%</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="admin-secao">
      <h3 class="admin-secao-titulo">ICG por Cidade</h3>
      ${filtroSiteRelHTML}
      ${tabelaHTML}
      <div class="relatorio-btns">
        <button class="btn btn-relatorio" onclick="baixarCSVicg()"><i data-lucide="download" class="icon icon-sm"></i> Baixar ICG CSV</button>
        <button class="btn btn-relatorio btn-relatorio-sec" onclick="baixarCSV()"><i data-lucide="download" class="icon icon-sm"></i> Baixar CSV Completo</button>
      </div>
    </div>

    <div class="admin-secao">
      <h3 class="admin-secao-titulo">Eficiência por Período (DATA_PEND)</h3>
      <div class="tabela-scroll">
        <table class="admin-table">
          <thead><tr><th>Período</th><th>Pendente</th><th>Retirado</th><th>Parcial</th><th>Quebra</th><th>Total</th><th>Taxa</th></tr></thead>
          <tbody>${linhasEfic || '<tr><td colspan="7" class="tabela-vazia">Nenhum dado com DATA_PEND preenchida</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function calcularEficienciaPeriodos() {
  const lista = getContratosAdminSemPeriodo();
  const meses = {};
  lista.forEach((c) => {
    if (!c.dataPend) return;
    const m = c.dataPend.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return;
    const chave = `${m[3]}-${m[2]}`;
    const label = `${m[2]}/${m[3]}`;
    if (!meses[chave])
      meses[chave] = {
        label,
        total: 0,
        retirados: 0,
        quebras: 0,
        pendentes: 0,
        parciais: 0,
      };
    meses[chave].total++;
    if (c.status === "Retirado") meses[chave].retirados++;
    else if (c.status === "Quebra") meses[chave].quebras++;
    else if (c.status === "Parcial") {
      meses[chave].parciais++;
      meses[chave].retirados++;
    } else meses[chave].pendentes++;
  });
  return Object.entries(meses)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .map(([, v]) => v);
}

// Variante "Via App": execuções com BAIXA_SITE="Sim" + todos os pendentes, agrupados por DATA_PEND
function calcularEficienciaPeriodosViaSite() {
  const lista = getContratosAdminSemPeriodo();
  const meses = {};
  lista.forEach((c) => {
    if (!c.dataPend) return;
    const m = c.dataPend.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return;
    const isPendente = c.status === "Pendente";
    const isViaSite = c.baixaSite === "Sim";
    const executadoViaSite =
      (c.status === "Retirado" ||
        c.status === "Parcial" ||
        c.status === "Quebra") &&
      isViaSite;
    if (!isPendente && !executadoViaSite) return;
    const chave = `${m[3]}-${m[2]}`;
    const label = `${m[2]}/${m[3]}`;
    if (!meses[chave])
      meses[chave] = {
        label,
        total: 0,
        retirados: 0,
        quebras: 0,
        pendentes: 0,
        parciais: 0,
      };
    meses[chave].total++;
    if (c.status === "Retirado" && isViaSite) meses[chave].retirados++;
    else if (c.status === "Quebra" && isViaSite) meses[chave].quebras++;
    else if (c.status === "Parcial" && isViaSite) {
      meses[chave].parciais++;
      meses[chave].retirados++;
    } else if (isPendente) meses[chave].pendentes++;
  });
  return Object.entries(meses)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .map(([, v]) => v);
}

// =========================================
// DISTRIBUIÇÃO DE CARTEIRA (admin)
//
// Grava TECNICO_DESIG / DATA / HORARIO / OBS 1 em lote, sempre no formato certo.
// Substitui a edição manual na planilha — que é de onde saíam agendamentos
// malformados (data escrita dentro do OBS 1, por exemplo).
// =========================================
let distSelecionados = new Set();

const DIST_HORARIOS = ["MANHÃ", "TARDE", "COMERCIAL"];

// Só faz sentido distribuir o que ainda não foi executado
function _contratosDistribuiveis() {
  const cidade = document.getElementById("dist-cidade")?.value || "";
  const bairro = document.getElementById("dist-bairro")?.value || "";
  const soSemTecnico =
    document.getElementById("dist-so-sem-tecnico")?.checked ?? true;
  const busca = (document.getElementById("dist-busca")?.value || "")
    .trim()
    .toLowerCase();

  return contratos
    .filter((c) => c.status === "Pendente")
    .filter((c) => !cidade || c.cidade === cidade)
    .filter((c) => !bairro || c.bairro === bairro)
    .filter((c) => !soSemTecnico || !c.tecnicoDesig?.trim())
    .filter(
      (c) =>
        !busca ||
        c.nome?.toLowerCase().includes(busca) ||
        c.contrato?.toLowerCase().includes(busca) ||
        c.endereco?.toLowerCase().includes(busca),
    )
    .sort(
      (a, b) =>
        a.cidade.localeCompare(b.cidade) ||
        a.bairro.localeCompare(b.bairro) ||
        a.endereco.localeCompare(b.endereco),
    );
}

function renderizarDistribuirHTML() {
  const lista = _contratosDistribuiveis();
  const cidades = [...new Set(contratos.map((c) => c.cidade))]
    .filter(Boolean)
    .sort();
  const cidadeSel = document.getElementById("dist-cidade")?.value || "";
  const bairros = [
    ...new Set(
      contratos
        .filter((c) => !cidadeSel || c.cidade === cidadeSel)
        .map((c) => c.bairro),
    ),
  ]
    .filter(Boolean)
    .sort();
  const bairroSel = document.getElementById("dist-bairro")?.value || "";
  const soSemTecnico =
    document.getElementById("dist-so-sem-tecnico")?.checked ?? true;
  const busca = document.getElementById("dist-busca")?.value || "";

  // Técnicos válidos vêm da aba TECNICOS — nunca digitados à mão
  const tecnicos = (todosOsTecnicos.length
    ? todosOsTecnicos
    : _lerTecnicosCache()
  )
    .filter((t) => t["USUARIO"])
    .sort((a, b) =>
      (a["NOME"] || a["USUARIO"]).localeCompare(b["NOME"] || b["USUARIO"]),
    );

  if (!tecnicos.length) {
    return `<div class="admin-secao"><div class="estado-vazio">
      <p>Lista de técnicos indisponível. Saia e entre novamente para recarregá-la.</p>
    </div></div>`;
  }

  const opt = (v, sel, label) =>
    `<option value="${escHtml(v)}"${v === sel ? " selected" : ""}>${escHtml(label ?? v)}</option>`;

  const linhas = lista.length
    ? lista
        .map(
          (c) => `
      <label class="dist-item${distSelecionados.has(c.id) ? " dist-item-sel" : ""}">
        <input type="checkbox" class="dist-check" value="${escHtml(c.id)}"
               ${distSelecionados.has(c.id) ? "checked" : ""}
               onchange="toggleDistSelecao(this)" />
        <span class="dist-item-corpo">
          <span class="dist-item-nome">${escHtml(c.nome)}</span>
          <span class="dist-item-end">${escHtml(c.cidade)} — ${escHtml(c.bairro)} · ${escHtml(c.endereco)}</span>
          <span class="dist-item-meta">${escHtml(c.contrato)}${c.tecnicoDesig ? ` · já com ${escHtml(nomeTecnico(c.tecnicoDesig) || c.tecnicoDesig)}` : ""}${c.quantidade ? ` · ${escHtml(c.quantidade)} equip.` : ""}</span>
        </span>
      </label>`,
        )
        .join("")
    : `<div class="estado-vazio"><p>Nenhum contrato pendente com esses filtros.</p></div>`;

  return `
    <div class="admin-secao">
      <div class="dist-filtros">
        <select id="dist-cidade" class="input-select" onchange="filtroDistAlterado(true)">
          <option value="">Cidade</option>
          ${cidades.map((c) => opt(c, cidadeSel)).join("")}
        </select>
        <select id="dist-bairro" class="input-select" onchange="filtroDistAlterado()">
          <option value="">Bairro</option>
          ${bairros.map((b) => opt(b, bairroSel)).join("")}
        </select>
        <input type="text" id="dist-busca" class="input-search" placeholder="Buscar nome, contrato ou endereço..."
               value="${escHtml(busca)}" oninput="filtroDistAlterado()" />
        <label class="dist-toggle">
          <input type="checkbox" id="dist-so-sem-tecnico" ${soSemTecnico ? "checked" : ""}
                 onchange="filtroDistAlterado()" />
          Só sem técnico designado
        </label>
      </div>

      <div class="dist-acoes-topo">
        <span class="dist-contador">${lista.length} pendente(s) · <strong>${distSelecionados.size}</strong> selecionado(s)</span>
        <button class="btn-subview" onclick="selecionarTodosDist()">Selecionar todos</button>
        <button class="btn-subview" onclick="limparSelecaoDist()">Limpar</button>
      </div>

      <div class="dist-lista">${linhas}</div>

      <div class="dist-form">
        <div class="dist-form-linha">
          <label class="detalhe-label">Técnico</label>
          <select id="dist-tecnico" class="input-select">
            <option value="">Selecione o técnico...</option>
            ${tecnicos.map((t) => opt(t["USUARIO"], "", `${t["NOME"] || t["USUARIO"]} (${t["USUARIO"]})`)).join("")}
          </select>
        </div>
        <div class="dist-form-linha">
          <label class="detalhe-label">Data</label>
          <input type="date" id="dist-data" class="input-select" />
        </div>
        <div class="dist-form-linha">
          <label class="detalhe-label">Horário</label>
          <select id="dist-horario" class="input-select">
            ${DIST_HORARIOS.map((h) => opt(h, "MANHÃ")).join("")}
          </select>
        </div>
        <button class="btn btn-retirado" onclick="confirmarDistribuicao()">
          <i data-lucide="send" class="icon icon-sm"></i> Designar selecionados
        </button>
        <p class="dist-aviso">
          Grava <strong>TECNICO_DESIG</strong>, <strong>DATA</strong>, <strong>HORARIO</strong>
          e <strong>OBS 1 = AGENDADO</strong>. A data vai sempre como DD/MM/AAAA.
        </p>
      </div>
    </div>`;
}

function filtroDistAlterado(limpouCidade) {
  if (limpouCidade) {
    const b = document.getElementById("dist-bairro");
    if (b) b.value = "";
  }
  // Preserva o que o usuário digitou/escolheu antes de re-renderizar
  const foco = document.activeElement?.id;
  const pos = document.getElementById("dist-busca")?.selectionStart;
  renderizarAdmin();
  if (foco) {
    const el = document.getElementById(foco);
    if (el) {
      el.focus();
      if (foco === "dist-busca" && pos != null)
        el.setSelectionRange(pos, pos);
    }
  }
}

function toggleDistSelecao(input) {
  if (input.checked) distSelecionados.add(input.value);
  else distSelecionados.delete(input.value);
  input.closest(".dist-item")?.classList.toggle("dist-item-sel", input.checked);
  const cont = document.querySelector(".dist-contador strong");
  if (cont) cont.textContent = String(distSelecionados.size);
}

function selecionarTodosDist() {
  _contratosDistribuiveis().forEach((c) => distSelecionados.add(c.id));
  renderizarAdmin();
}

function limparSelecaoDist() {
  distSelecionados.clear();
  renderizarAdmin();
}

function _dataISOparaBR(iso) {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

async function confirmarDistribuicao() {
  const tecnico = document.getElementById("dist-tecnico")?.value || "";
  const dataISO = document.getElementById("dist-data")?.value || "";
  const horario = document.getElementById("dist-horario")?.value || "";
  const dataBR = _dataISOparaBR(dataISO);

  if (!distSelecionados.size)
    return mostrarToast("Selecione ao menos um contrato.", "aviso");
  if (!tecnico) return mostrarToast("Selecione o técnico.", "aviso");
  if (!dataBR) return mostrarToast("Informe a data do agendamento.", "aviso");

  const alvos = contratos.filter((c) => distSelecionados.has(c.id));
  const nome = nomeTecnico(tecnico) || tecnico;
  if (
    !confirm(
      `Designar ${alvos.length} contrato(s) para ${nome} em ${dataBR} (${horario})?`,
    )
  )
    return;

  const campos = {
    TECNICO_DESIG: tecnico,
    DATA: dataBR,
    HORARIO: horario,
    "OBS 1": "AGENDADO",
  };
  const itens = alvos.map((c) => ({ keyVal: c.contrato, data: campos }));

  _setCarregando(+1);
  try {
    const fd = new FormData();
    fd.append(
      "payload",
      JSON.stringify({
        action: "lote",
        sheet: "SAFRA",
        keyCol: "CONTRATO",
        itens,
      }),
    );
    const resp = await fetchComTimeout(GAS_URL, { method: "POST", body: fd });
    if (!resp.ok) throw new Error(`Erro HTTP ${resp.status}`);
    const json = await resp.json().catch(() => ({}));
    if (json.error) throw new Error(json.error);

    // Reflete localmente sem esperar novo GET
    alvos.forEach((c) => {
      const idx = contratos.findIndex((x) => x.id === c.id);
      if (idx !== -1) {
        contratos[idx] = {
          ...contratos[idx],
          tecnicoDesig: tecnico,
          dataAgend: dataBR,
          horario,
          obs1: "AGENDADO",
        };
      }
    });
    salvarContratosIDB(contratos, tecnicoLogado()?.usuario);
    distSelecionados.clear();
    mostrarToast(
      `${json.updated ?? alvos.length} contrato(s) designado(s) para ${escHtml(nome)}.`,
      "sucesso",
    );
    renderizarAdmin();
  } catch (e) {
    console.error("Erro na distribuição:", e);
    mostrarToast(
      ehErroDeRede(e)
        ? "Sem conexão estável. Nada foi designado — tente novamente."
        : `Erro ao designar: ${escHtml(e.message || "desconhecido")}`,
      "erro",
    );
  } finally {
    _setCarregando(-1);
  }
}

function baixarCSV() {
  const lista = getContratosAdmin();
  const cabecalho = [
    "Contrato",
    "Nome",
    "Cidade",
    "Bairro",
    "Endereço",
    "Status",
    "Código OS",
    "Técnico Designado",
    "Técnico Exec.",
    "Data Exec.",
    "Obs. Execução",
    "Baixa pelo Site",
    "Seriais Retirados",
  ].join(";");

  const linhas = lista.map((c) =>
    [
      c.contrato,
      c.nome,
      c.cidade,
      c.bairro,
      c.endereco,
      c.status,
      c.codigoOS,
      c.tecnicoDesig,
      c.tecnicoExec,
      c.dataExec,
      c.obsExec,
      c.baixaSite,
      c.seriaisRet,
    ]
      .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
      .join(";"),
  );

  const csv = [cabecalho, ...linhas].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backlog-safra-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function baixarCSVicg() {
  const lista = getContratosAdmin();
  const dados = calcularICGPorCidade(lista);
  const META_MIX = 0.78;
  const META_OPCAO = 1.0;
  const META_INAD = 0.7;

  const pct = (v, d) => (d > 0 ? ((v / d) * 100).toFixed(1) + "%" : "—");
  const falta = (icg, meta, d) => {
    if (d === 0) return "—";
    const atual = icg / d;
    const diff = meta - atual;
    return diff > 0 ? Math.ceil(diff * d) + " contr." : "Meta atingida";
  };

  const cabecalho = [
    "Cidade",
    "MIX Desconect.",
    "MIX Recuper.",
    "MIX Pendentes",
    "MIX ICG%",
    "MIX Falta p/Meta",
    "OPÇ Recuper.",
    "OPÇ Pendentes",
    "OPÇ ICG%",
    "INAD Recuper.",
    "INAD Pendentes",
    "INAD ICG%",
  ].join(";");

  const linhas = dados.map((r) => {
    const mixPend = r.mix.desc - r.mix.rec;
    const opPend = r.opcao.desc - r.opcao.rec;
    const inadPend = r.inad.desc - r.inad.rec;
    return [
      r.cidade,
      r.mix.desc,
      r.mix.rec,
      mixPend,
      pct(r.mix.rec, r.mix.desc),
      falta(r.mix.rec, META_MIX, r.mix.desc),
      r.opcao.rec,
      opPend,
      pct(r.opcao.rec, r.opcao.desc),
      r.inad.rec,
      inadPend,
      pct(r.inad.rec, r.inad.desc),
    ]
      .map((v) => `"${String(v || 0).replace(/"/g, '""')}"`)
      .join(";");
  });

  const csv = [cabecalho, ...linhas].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `icg-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// =========================================
// PAINEL DE PROJEÇÃO
// =========================================
let _chartInstances = {};
let _filtroProjecao = "total"; // "total" | "ret"  (ret = só Retirado+Parcial, sem Quebra)

function _destruirGraficos() {
  Object.values(_chartInstances).forEach((ch) => ch?.destroy());
  _chartInstances = {};
}

function _calcularDadosProjecao(lista, filtro) {
  filtro = filtro || "total";
  const filtroStatuses =
    filtro === "ret"
      ? ["Retirado", "Parcial"]
      : ["Retirado", "Parcial", "Quebra"];

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const diaHoje = hoje.getDate();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  // Status geral (sem filtro de escopo — panorama real)
  const statusCount = { Pendente: 0, Retirado: 0, Parcial: 0, Quebra: 0 };
  lista.forEach((c) => {
    statusCount[c.status] = (statusCount[c.status] || 0) + 1;
  });

  // Helper: conta via-app dentro de um intervalo de timestamps
  const contarViaApp = (ini, fim) =>
    lista.filter((c) => {
      if (c.baixaSite !== "Sim") return false;
      if (!filtroStatuses.includes(c.status)) return false;
      const ts = parseDateBR(c.dataExec);
      return ts && ts >= ini && ts <= fim;
    }).length;

  // Segunda-feira da semana atual
  const diaSemana = hoje.getDay();
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  seg.setHours(0, 0, 0, 0);

  // Rolling average: últimas 3 semanas completas + semana atual extrapolada
  // Isso evita distorção em dias 1 do mês com poucos dados
  const taxasSemanais = [];
  for (let offset = -3; offset <= -1; offset++) {
    const iniSem = new Date(seg);
    iniSem.setDate(seg.getDate() + offset * 7);
    iniSem.setHours(0, 0, 0, 0);
    const fimSem = new Date(iniSem);
    fimSem.setDate(iniSem.getDate() + 6);
    fimSem.setHours(23, 59, 59, 999);
    taxasSemanais.push(contarViaApp(iniSem.getTime(), fimSem.getTime()));
  }
  // Semana atual: extrapola para 7 dias com base nos dias já passados
  const diasPassadosSemana = diaSemana === 0 ? 7 : diaSemana;
  const contSemAtual = contarViaApp(
    seg.getTime(),
    seg.getTime() + 7 * 86400000 - 1,
  );
  const semAtualExtrap =
    diasPassadosSemana > 0
      ? Math.round((contSemAtual / diasPassadosSemana) * 7)
      : 0;
  taxasSemanais.push(semAtualExtrap);

  const temHistorico = taxasSemanais.some((v) => v > 0);
  const taxaSemanalRolling = temHistorico
    ? taxasSemanais.reduce((a, b) => a + b, 0) / taxasSemanais.length
    : 0;
  const taxaDiaria = taxaSemanalRolling / 7;

  // Executados neste mês VIA APP
  const execMes = lista.filter((c) => {
    if (!filtroStatuses.includes(c.status)) return false;
    if (c.baixaSite !== "Sim") return false;
    const ts = parseDateBR(c.dataExec);
    if (!ts) return false;
    const d = new Date(ts);
    return d.getFullYear() === ano && d.getMonth() === mes;
  });

  // Contagem por dia do mês
  const porDia = {};
  execMes.forEach((c) => {
    const ts = parseDateBR(c.dataExec);
    if (!ts) return;
    const dia = new Date(ts).getDate();
    porDia[dia] = (porDia[dia] || 0) + 1;
  });

  // Linha de progresso real + projeção
  const labelsLinha = [];
  const dadosReais = [];
  const dadosProj = [];
  let acum = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    labelsLinha.push(String(d));
    if (d <= diaHoje) {
      acum += porDia[d] || 0;
      dadosReais.push(acum);
      dadosProj.push(d === diaHoje ? acum : null);
    } else {
      dadosReais.push(null);
      dadosProj.push(Math.round(execMes.length + taxaDiaria * (d - diaHoje)));
    }
  }

  // Semana atual (Seg → Dom) — barras empilhadas por status
  const DIAS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const semanaLabels = [];
  const semanaRet = [];
  const semanaParc = [];
  const semanaQbr = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(seg);
    dia.setDate(seg.getDate() + i);
    const isHoje = dia.toDateString() === hoje.toDateString();
    semanaLabels.push((isHoje ? "▶ " : "") + DIAS_PT[dia.getDay()]);
    const ini = dia.getTime();
    const fim = ini + 86399999;
    let ret = 0,
      par = 0,
      qbr = 0;
    lista.forEach((c) => {
      if (c.baixaSite !== "Sim") return;
      const ts = parseDateBR(c.dataExec);
      if (!ts || ts < ini || ts > fim) return;
      if (c.status === "Retirado") ret++;
      else if (c.status === "Parcial") par++;
      else if (c.status === "Quebra" && filtro === "total") qbr++;
    });
    semanaRet.push(ret);
    semanaParc.push(par);
    semanaQbr.push(qbr);
  }

  // Evolução semanal: 3 antes + atual + 3 projetadas
  // Projeção = rolling average (não apenas taxa atual)
  const evolLabels = [];
  const evolVals = [];
  const evolFutura = [];
  const evolAtual = [];
  for (let offset = -3; offset <= 3; offset++) {
    const iniSem = new Date(seg);
    iniSem.setDate(seg.getDate() + offset * 7);
    iniSem.setHours(0, 0, 0, 0);
    const fimSem = new Date(iniSem);
    fimSem.setDate(iniSem.getDate() + 6);
    fimSem.setHours(23, 59, 59, 999);
    const label = iniSem.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    evolLabels.push(label + (offset > 0 ? " ★" : ""));
    evolAtual.push(offset === 0);
    if (offset > 0) {
      evolVals.push(Math.round(taxaSemanalRolling)); // usa rolling, não taxa do dia atual
      evolFutura.push(true);
    } else {
      evolVals.push(contarViaApp(iniSem.getTime(), fimSem.getTime()));
      evolFutura.push(false);
    }
  }

  // Ranking de técnicos (mês atual, via app, conforme filtro)
  const rankMap = {};
  execMes.forEach((c) => {
    const tec = c.tecnicoExec?.trim() || "—";
    rankMap[tec] = (rankMap[tec] || 0) + 1;
  });
  const ranking = Object.entries(rankMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const projetadoFimMes = Math.round(
    execMes.length + taxaDiaria * (diasNoMes - diaHoje),
  );
  const base = statusCount.Pendente + execMes.length;
  const pct = base > 0 ? Math.round((execMes.length / base) * 100) : 0;

  return {
    statusCount,
    execMes: execMes.length,
    taxaDiaria: taxaDiaria.toFixed(1),
    taxaSemanalRolling: taxaSemanalRolling.toFixed(1),
    projetadoFimMes,
    diasNoMes,
    diaHoje,
    pct,
    labelsLinha,
    dadosReais,
    dadosProj,
    semanaLabels,
    semanaRet,
    semanaParc,
    semanaQbr,
    evolLabels,
    evolVals,
    evolFutura,
    evolAtual,
    ranking,
    filtro,
  };
}

function renderizarProjecaoHTML(d) {
  const mesNome = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return `
    <div class="proj-wrapper">
      <div class="proj-header-row">
        <span class="proj-titulo">Projeção — ${mesNome}</span>
        <div class="proj-header-acoes">
          <select class="input-select-sm proj-filtro-escopo" onchange="mudarFiltroProjecao(this.value)">
            <option value="total" ${d.filtro === "total" ? "selected" : ""}>Total (incl. Quebras)</option>
            <option value="ret"   ${d.filtro === "ret" ? "selected" : ""}>Apenas Retiradas</option>
          </select>
          <button class="btn-export-pdf" onclick="gerarPDFProjecao()">
            <i data-lucide="file-down" class="icon icon-sm"></i> Exportar PDF
          </button>
        </div>
      </div>

      <div class="proj-cards">
        <div class="proj-card proj-azul">
          <div class="proj-card-valor">${d.execMes}</div>
          <div class="proj-card-label">Via app este mês${d.filtro === "ret" ? " (só ret.)" : ""}</div>
        </div>
        <div class="proj-card proj-verde">
          <div class="proj-card-valor">${d.taxaDiaria}/dia</div>
          <div class="proj-card-label">Taxa (~${d.taxaSemanalRolling}/sem)</div>
        </div>
        <div class="proj-card proj-laranja">
          <div class="proj-card-valor">~${d.projetadoFimMes}</div>
          <div class="proj-card-label">Projeção fim do mês</div>
        </div>
        <div class="proj-card proj-cinza">
          <div class="proj-card-valor">${d.statusCount.Pendente}</div>
          <div class="proj-card-label">Pendentes</div>
        </div>
      </div>

      <div class="proj-nota-calculo">
        <i data-lucide="info" class="icon icon-xs"></i>
        Taxa calculada pela média das últimas 3 semanas completas + semana atual extrapolada — evita distorção em dias 1 do mês.
      </div>

      <div class="proj-progresso-wrap">
        <div class="proj-progresso-label">
          Progresso do mês: <strong>${d.pct}%</strong>
          <span class="proj-progresso-sub">(dia ${d.diaHoje} de ${d.diasNoMes})</span>
        </div>
        <div class="proj-progresso-bg">
          <div class="proj-progresso-fill" style="width:${Math.min(d.pct, 100)}%"></div>
        </div>
      </div>

      <div id="projecao-charts" class="proj-charts-grid">
        <div class="proj-chart-card proj-span2">
          <div class="proj-chart-titulo">Progresso do mês + Projeção</div>
          <canvas id="chart-mes"></canvas>
        </div>
        <div class="proj-chart-card">
          <div class="proj-chart-titulo">Execuções esta semana</div>
          <canvas id="chart-semana"></canvas>
        </div>
        <div class="proj-chart-card">
          <div class="proj-chart-titulo">Status atual</div>
          <canvas id="chart-status"></canvas>
        </div>
        <div class="proj-chart-card proj-span2">
          <div class="proj-chart-titulo">Evolução semanal via app — 3 semanas antes · atual · 3 projetadas <span class="proj-legenda-proj">★ = projeção</span></div>
          <canvas id="chart-semanal-evol"></canvas>
        </div>
        <div class="proj-chart-card proj-span2">
          <div class="proj-chart-titulo">Ranking de técnicos (mês — via app)</div>
          <canvas id="chart-tecnico"></canvas>
        </div>
      </div>

      ${!window.Chart ? `<p class="proj-sem-chart">⚠️ Gráficos indisponíveis offline. Conecte-se para carregá-los.</p>` : ""}
    </div>`;
}

function _initGraficos(d) {
  if (!window.Chart) return;
  _destruirGraficos();

  // ---- Linha: progresso do mês ----
  const ctxMes = document.getElementById("chart-mes");
  if (ctxMes) {
    _chartInstances.mes = new Chart(ctxMes, {
      type: "line",
      data: {
        labels: d.labelsLinha,
        datasets: [
          {
            label: "Executados",
            data: d.dadosReais,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37,99,235,0.07)",
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            spanGaps: false,
          },
          {
            label: "Projeção",
            data: d.dadosProj,
            borderColor: "#93c5fd",
            borderDash: [6, 4],
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "top", labels: { font: { size: 11 } } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 10 } } },
          x: {
            ticks: { font: { size: 10 }, maxRotation: 0, maxTicksLimit: 15 },
          },
        },
      },
    });
  }

  // ---- Barras empilhadas: semana ----
  const ctxSem = document.getElementById("chart-semana");
  if (ctxSem) {
    _chartInstances.semana = new Chart(ctxSem, {
      type: "bar",
      data: {
        labels: d.semanaLabels,
        datasets: [
          { label: "Retirado", data: d.semanaRet, backgroundColor: "#16a34a" },
          { label: "Parcial", data: d.semanaParc, backgroundColor: "#f59e0b" },
          { label: "Quebra", data: d.semanaQbr, backgroundColor: "#dc2626" },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "top", labels: { font: { size: 11 } } },
        },
        scales: {
          x: { stacked: true, ticks: { font: { size: 11 } } },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { font: { size: 10 } },
          },
        },
      },
    });
  }

  // ---- Donut: status ----
  const ctxStat = document.getElementById("chart-status");
  if (ctxStat) {
    const tot = Object.values(d.statusCount).reduce((a, b) => a + b, 0);
    _chartInstances.status = new Chart(ctxStat, {
      type: "doughnut",
      data: {
        labels: ["Pendente", "Retirado", "Parcial", "Quebra"],
        datasets: [
          {
            data: [
              d.statusCount.Pendente,
              d.statusCount.Retirado,
              d.statusCount.Parcial,
              d.statusCount.Quebra,
            ],
            backgroundColor: ["#6b7280", "#16a34a", "#f59e0b", "#dc2626"],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pct = tot > 0 ? ((ctx.raw / tot) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${ctx.raw} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  // ---- Barras: evolução semanal (3 antes + atual + 3 projetadas) ----
  const ctxEvol = document.getElementById("chart-semanal-evol");
  if (ctxEvol) {
    const coresEvol = d.evolVals.map((_, i) => {
      if (d.evolFutura[i]) return "rgba(37,99,235,0.28)"; // projetado
      if (d.evolAtual[i]) return "#1d4ed8"; // semana atual
      return "#2563eb"; // semanas passadas
    });
    _chartInstances.evolSemanal = new Chart(ctxEvol, {
      type: "bar",
      data: {
        labels: d.evolLabels,
        datasets: [
          {
            label: "Via app (real)",
            data: d.evolVals.map((v, i) => (!d.evolFutura[i] ? v : null)),
            backgroundColor: d.evolVals.map((_, i) =>
              d.evolAtual[i] ? "#1d4ed8" : "#2563eb",
            ),
          },
          {
            label: "Projeção",
            data: d.evolVals.map((v, i) => (d.evolFutura[i] ? v : null)),
            backgroundColor: "rgba(37,99,235,0.28)",
            borderColor: "#93c5fd",
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "top", labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              title: (items) => {
                const i = items[0].dataIndex;
                return d.evolFutura[i]
                  ? `Semana de ${d.evolLabels[i].replace(" ★", "")} (projeção)`
                  : `Semana de ${d.evolLabels[i]}`;
              },
            },
          },
        },
        scales: {
          x: { ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  // ---- Barras horizontais: ranking técnicos ----
  const ctxTec = document.getElementById("chart-tecnico");
  if (ctxTec && d.ranking.length) {
    const CORES_PÓDIO = ["#f59e0b", "#9ca3af", "#b45309"];
    _chartInstances.tecnico = new Chart(ctxTec, {
      type: "bar",
      data: {
        labels: d.ranking.map(([nome]) => nome),
        datasets: [
          {
            label: "Executados no mês",
            data: d.ranking.map(([, n]) => n),
            backgroundColor: d.ranking.map(
              (_, i) => CORES_PÓDIO[i] ?? "#3b82f6",
            ),
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { font: { size: 10 } } },
          y: { ticks: { font: { size: 11 } } },
        },
      },
    });
  }
}

function mudarFiltroProjecao(v) {
  _filtroProjecao = v;
  renderizarAdmin();
}

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function gerarPDFProjecao() {
  const btn = document.querySelector(".btn-export-pdf");
  const originalHTML = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="icon icon-sm"></i> Gerando...`;
    renderIcons();
  }
  try {
    await _loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    );
    await _loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    );

    const { jsPDF } = window.jspdf;
    const chartsEl = document.getElementById("projecao-charts");
    const captura = await html2canvas(chartsEl, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const imgData = captura.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const hoje = new Date().toLocaleDateString("pt-BR");
    const mesNome = new Date().toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    // Cabeçalho azul
    pdf.setFillColor(0, 86, 179);
    pdf.rect(0, 0, pageW, 14, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont(undefined, "bold");
    pdf.text("Backlog Safra — Relatório de Projeção", 10, 9);
    pdf.setFont(undefined, "normal");
    pdf.setFontSize(9);
    pdf.text(`${mesNome}  ·  Gerado em ${hoje}`, pageW - 10, 9, {
      align: "right",
    });

    // Cards de resumo
    const dados = _calcularDadosProjecao(
      getContratosAdminSemPeriodo(),
      _filtroProjecao,
    );
    const cards = [
      { label: "Executados no mês", valor: String(dados.execMes) },
      { label: "Taxa média", valor: `${dados.taxaDiaria}/dia` },
      { label: "Projeção fim do mês", valor: `~${dados.projetadoFimMes}` },
      { label: "Pendentes", valor: String(dados.statusCount.Pendente) },
    ];
    const cw = (pageW - 20) / 4;
    pdf.setTextColor(30, 30, 30);
    cards.forEach((c, i) => {
      const x = 10 + i * cw;
      pdf.setFillColor(235, 244, 255);
      pdf.roundedRect(x, 16, cw - 2, 12, 2, 2, "F");
      pdf.setFontSize(14);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(0, 86, 179);
      pdf.text(c.valor, x + (cw - 2) / 2, 21, { align: "center" });
      pdf.setFontSize(7);
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(80, 80, 80);
      pdf.text(c.label, x + (cw - 2) / 2, 25, { align: "center" });
    });

    // Imagem dos gráficos
    const imgW = pageW - 20;
    const imgH = Math.min((captura.height * imgW) / captura.width, pageH - 32);
    pdf.addImage(imgData, "PNG", 10, 30, imgW, imgH);

    pdf.save(`projecao-safra-${hoje.replace(/\//g, "-")}.pdf`);
    mostrarToast("PDF exportado com sucesso!", "sucesso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao gerar PDF. Verifique sua conexão.", "erro");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      renderIcons();
    }
  }
}

// =========================================
// EVENTOS
// =========================================
function configurarEventos() {
  const search = document.getElementById("search");
  search.addEventListener("input", () => {
    atualizarBotaoLimparBusca();
    filtroAlterado();
  });

  document.getElementById("btn-limpar-busca").addEventListener("click", () => {
    search.value = "";
    atualizarBotaoLimparBusca();
    search.focus();
    filtroAlterado();
  });

  document.getElementById("filter-cidade").addEventListener("change", (e) => {
    const cidadeSel = e.target.value;
    document.getElementById("filter-bairro").value = "";
    atualizarBairros(cidadeSel);
    filtroAlterado();
  });
  document
    .getElementById("filter-bairro")
    .addEventListener("change", filtroAlterado);
  document
    .getElementById("filter-status")
    .addEventListener("change", filtroAlterado);
  document
    .getElementById("filter-tipo")
    .addEventListener("change", filtroAlterado);
  document
    .getElementById("filter-tecnico")
    .addEventListener("change", filtroAlterado);
  ["filter-data-ini", "filter-data-fim"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", filtroAlterado);
  });

  const elDist = document.getElementById("filter-distancia");
  if (elDist) {
    elDist.addEventListener("change", (e) => {
      if (e.target.value && !userLocation) {
        mostrarToast(
          "Ative a localização para usar o filtro de distância.",
          "aviso",
        );
      }
      filtroAlterado();
    });
  }

  document
    .getElementById("btn-localizacao")
    ?.addEventListener("click", ativarLocalizacao);
  document
    .getElementById("btn-montar-rota")
    ?.addEventListener("click", toggleModoRota);
  document
    .getElementById("btn-agrupar")
    ?.addEventListener("click", toggleAgrupamento);

  document
    .getElementById("btn-limpar-filtros")
    .addEventListener("click", limparFiltros);
  document
    .getElementById("modal-fechar")
    .addEventListener("click", fecharModal);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") fecharModal();
  });
  document.getElementById("modal-connect").addEventListener("click", (e) => {
    if (e.target.id === "modal-connect") fecharModalConnect();
  });

  // Admin — delegação para linhas clicáveis do histórico (evita re-adicionar listeners)
  document.getElementById("admin-conteudo").addEventListener("click", (e) => {
    const tr = e.target.closest(".hist-linha");
    if (tr) abrirModalPorId(tr.dataset.id);
  });
  document.getElementById("btn-admin").addEventListener("click", abrirAdmin);
  document
    .getElementById("btn-meu-historico")
    ?.addEventListener("click", abrirHistoricoPessoal);
  document
    .getElementById("btn-voltar-historico")
    ?.addEventListener("click", fecharHistoricoPessoal);
  document
    .getElementById("mh-filter-status")
    ?.addEventListener("change", renderizarHistoricoPessoal);
  document
    .getElementById("mh-search")
    ?.addEventListener("input", renderizarHistoricoPessoal);
  document
    .getElementById("btn-voltar-lista")
    .addEventListener("click", voltarLista);
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => mudarTabAdmin(btn.dataset.tab));
  });
  document
    .getElementById("adm-filter-cidade")
    .addEventListener("change", renderizarAdmin);
  document
    .getElementById("adm-filter-tecnico")
    .addEventListener("change", renderizarAdmin);
  const elAdmPeriodo = document.getElementById("adm-filter-periodo");
  if (elAdmPeriodo) elAdmPeriodo.addEventListener("change", renderizarAdmin);

  // Tutorial
  document
    .getElementById("btn-tutorial")
    .addEventListener("click", abrirTutorial);
  document
    .getElementById("tutorial-fechar")
    .addEventListener("click", fecharTutorial);
  document
    .getElementById("tut-prev")
    .addEventListener("click", tutorialAnterior);
  document
    .getElementById("tut-next")
    .addEventListener("click", tutorialProximo);
  document.getElementById("modal-tutorial").addEventListener("click", (e) => {
    if (e.target.id === "modal-tutorial") fecharTutorial();
  });
}
