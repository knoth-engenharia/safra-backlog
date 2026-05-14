// =========================================
// CONFIGURAÇÃO DA API
// =========================================
// URL gerada ao implantar gas/Codigo.gs como App da Web no Google Apps Script
// Ver instruções em gas/Codigo.gs
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbyFRh6mPanPQOWAXx0feolH9ToI6b_AFdhFmksvZb06OojihXKw8NUaXonnmAB9gEMK/exec";

// Chave gratuita do ImgBB — obter em: https://api.imgbb.com
// Criar conta, gerar chave API e colar aqui
const IMGBB_API_KEY = "a6d2e3459a89a0c82016a47e177353b1";

const COL_CODIGO_OS = "CODIGO_OS";
const COL_DATA_EXEC = "DATA_EXEC";
const COL_OBS_EXEC = "OBS_EXEC";
const COL_TECNICO = "TECNICO_EXEC";
const COL_FOTO = "FOTO_EXEC";
const COL_BAIXA_SITE = "BAIXA_SITE";
const COL_SERIAIS_RET = "SERIAIS_RETIRADOS";
const COL_VISITAS = "VISITAS";
const COL_NO_CONNECT = "NO_CONNECT";
const COL_LAT_EXEC   = "LAT_EXEC";
const COL_LNG_EXEC   = "LNG_EXEC";

const POR_PAGINA = 30;

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
  try {
    await salvarNaPlanilha(contratoAtivo, { [COL_VISITAS]: novas });
    const idx = contratos.findIndex((c) => c.id === contratoAtivo.id);
    if (idx !== -1) {
      contratos[idx] = { ...contratos[idx], visitas: novas };
      contratoAtivo = contratos[idx];
    }
    mostrarToast("Tentativa de visita registrada.", "sucesso");
    abrirModal(contratoAtivo);
  } catch (e) {
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
  fetch(GAS_URL, { method: "POST", body: fd }).catch(() => {});
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
// GEOLOCALIZAÇÃO DE EXECUÇÃO
// =========================================
async function capturarGeolocalizacao() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
      },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 },
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
    const resp = await fetch(`${GAS_URL}?sheet=TECNICOS`);
    const respJson = await resp.json();
    const lista = respJson.data ?? [];

    todosOsTecnicos = lista; // armazena para lookup de nomes
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
    _raw: linha,
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
const IDB_VERSION = 1;

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
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
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
      req.onsuccess = () => resolve(req.result?.lista ?? null);
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

async function contarFilaBaixas() {
  try {
    const db = await abrirIDB();
    return new Promise((resolve) => {
      const req = db
        .transaction("pending_baixas")
        .objectStore("pending_baixas")
        .count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

async function lerFilaBaixas(db) {
  return new Promise((resolve) => {
    const lista = [];
    const req = db
      .transaction("pending_baixas")
      .objectStore("pending_baixas")
      .openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        lista.push({ idbKey: cursor.primaryKey, ...cursor.value });
        cursor.continue();
      } else {
        resolve(lista);
      }
    };
    req.onerror = () => resolve([]);
  });
}

async function processarFilaBaixas() {
  if (!navigator.onLine) return;
  const db = await abrirIDB().catch(() => null);
  if (!db) return;
  const items = await lerFilaBaixas(db);
  if (!items.length) return;

  let successes = 0;
  for (const item of items) {
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          sheet: "SAFRA",
          keyCol: "CONTRATO",
          keyVal: item.contratoId,
          data: item.campos,
        }),
      );
      const resp = await fetch(GAS_URL, { method: "POST", body: fd });
      if (resp.ok) {
        await new Promise((res) => {
          const tx = db.transaction("pending_baixas", "readwrite");
          tx.objectStore("pending_baixas").delete(item.idbKey);
          tx.oncomplete = res;
          tx.onerror = res; // continua mesmo se delete falhar
        });
        successes++;
      }
    } catch {}
  }

  if (successes > 0) {
    mostrarToast(
      `${successes} baixa${successes > 1 ? "s" : ""} sincronizada${successes > 1 ? "s" : ""} com sucesso.`,
      "sucesso",
    );
    carregarContratos(); // Atualiza lista com dados reais
  }
  atualizarIndicadorOffline();
}

async function atualizarIndicadorOffline() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  if (!navigator.onLine) {
    banner.classList.remove("hidden");
    const n = await contarFilaBaixas();
    const elP = document.getElementById("offline-pendentes");
    if (elP) {
      elP.textContent =
        n > 0
          ? ` · ${n} baixa${n > 1 ? "s" : ""} pendente${n > 1 ? "s" : ""}`
          : "";
    }
    renderIcons();
  } else {
    banner.classList.add("hidden");
  }
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

// Admin histórico sub-view
let histSubView = "lista"; // "lista" | "dia"

// =========================================
// INICIALIZAÇÃO
// =========================================
document.addEventListener("DOMContentLoaded", () => {
  // Registra Service Worker (requer HTTPS ou localhost)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("./sw.js").catch(() => {}),
    );
  }
  renderIcons();
  const tecnico = tecnicoLogado();
  if (tecnico) {
    iniciarApp();
  } else {
    mostrarTelaLogin();
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

  configurarEventos();
  atualizarIndicadorOffline();
  iniciarHeartbeat();
  carregarContratos();
}

// =========================================
// COMUNICAÇÃO COM A API
// =========================================
async function carregarContratos() {
  mostrarCarregando();
  try {
    const resposta = await fetch(`${GAS_URL}?sheet=SAFRA`);
    if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status}`);
    const resJson = await resposta.json();
    if (resJson.error) throw new Error(resJson.error);
    const dados = resJson.data ?? [];
    if (!Array.isArray(dados) || dados.length === 0) {
      mostrarVazio("Nenhum contrato encontrado na planilha.");
      return;
    }
    contratos = dados.map(mapearContrato);

    // Restringe cidades conforme permissão do técnico logado
    // Exceto: contrato agendado para este técnico (TECNICO_DESIG) aparece sempre
    const { cidades, usuario, adm } = tecnicoLogado() || {};
    const usuarioLow = usuario?.trim().toLowerCase() || "";
    const ehAgendadoParaMim = (c) =>
      c.obs1?.trim().toUpperCase() === "AGENDADO" &&
      c.tecnicoDesig?.trim().toLowerCase() === usuarioLow;
    if (cidades) {
      const permitidas = cidades.map((c) => c.toLowerCase());
      contratos = contratos.filter(
        (c) =>
          permitidas.includes(c.cidade.toLowerCase()) ||
          (!adm && ehAgendadoParaMim(c)),
      );
    }
    // Oculta contratos de "outro endereço" para técnicos (não ADMs)
    if (!adm) {
      contratos = contratos.filter(
        (c) =>
          c.obs1?.trim().toUpperCase() !==
          "CLIENTE SOLICITA RETIRADA EM OUTRO ENDEREÇO",
      );
    }

    salvarContratosIDB(contratos, usuario); // cache em background, sem await
    preencherFiltros();
    renderizarLista(contratos);
  } catch (erro) {
    console.error("Erro ao carregar contratos:", erro);
    // Tenta cache offline (IndexedDB)
    const { usuario } = tecnicoLogado() || {};
    const cached = await lerContratosIDB(usuario);
    if (cached && cached.length > 0) {
      contratos = cached;
      atualizarIndicadorOffline();
      preencherFiltros();
      renderizarLista(contratos);
    } else {
      mostrarErro(
        "Sem conexão e sem cache disponível. Verifique sua internet.",
      );
    }
  }
}

async function salvarNaPlanilha(contrato, campos) {
  if (!navigator.onLine) {
    await enfileirarBaixa(contrato.contrato, campos);
    throw new OfflineError("Sem conexão — baixa enfileirada");
  }
  const fd = new FormData();
  fd.append(
    "payload",
    JSON.stringify({
      sheet: "SAFRA",
      keyCol: "CONTRATO",
      keyVal: contrato.contrato,
      data: campos,
    }),
  );
  const resp = await fetch(GAS_URL, { method: "POST", body: fd });
  if (!resp.ok) throw new Error(`Erro HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error);
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
    periodo: document.getElementById("filter-periodo")?.value || "",
    distancia: document.getElementById("filter-distancia")?.value || "",
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

  if (saved.periodo) {
    const elPer = document.getElementById("filter-periodo");
    if (elPer) elPer.value = saved.periodo;
  }
  if (saved.distancia) {
    const elDist = document.getElementById("filter-distancia");
    if (elDist) elDist.value = saved.distancia;
  }

  aplicarFiltros();
}

function atualizarBairros() {
  const cidadeSel = document.getElementById("filter-cidade").value;
  const fonte = cidadeSel
    ? contratos.filter((c) => c.cidade === cidadeSel)
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
  const elPer = document.getElementById("filter-periodo");
  if (elPer) elPer.value = "";
  const elDist = document.getElementById("filter-distancia");
  if (elDist) elDist.value = "";
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
    "filter-periodo",
    "filter-distancia",
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
  const periodo = document.getElementById("filter-periodo")?.value || "";
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
      novoEnd.toLowerCase().includes(busca);
    // Agendamentos do próprio técnico ignoram filtro de cidade e bairro
    const skipGeofiltro = ehMeuAgendamento(c);
    return (
      matchBusca &&
      (skipGeofiltro || !cidade || c.cidade === cidade) &&
      (skipGeofiltro || !bairro || c.bairro === bairro) &&
      (!status || c.status === status) &&
      (!tipo || c.tipoDesconexao === tipo) &&
      (!tecnico || c.tecnicoDesig === tecnico || c.tecnicoExec === tecnico) &&
      filtrarPorPeriodo(c, periodo) &&
      filtrarPorDistancia(c, distFiltro)
    );
  });

  salvarFiltros();
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
          <a href="${mapsUrl}" class="btn-mapa-card" target="_blank" onclick="event.stopPropagation()" title="Ver no mapa"><i data-lucide="map-pin" class="icon icon-sm"></i></a>
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
  const geoExecUrl = contrato.latExec && contrato.lngExec
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

// --- Fluxo Retirado ---
function mostrarConfirmacaoRetirado() {
  document.getElementById("acoes-modal").innerHTML = `
    ${criarSeletorSeriaisHTML(contratoAtivo?.terminais || "")}
    <label class="detalhe-label" style="margin-bottom:6px;display:block">Observação (opcional)</label>
    <textarea id="obs-exec-input" class="obs-textarea" placeholder="Alguma observação sobre a retirada..."></textarea>
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
  const codigoOS = isParcial
    ? `Parcial - ${qtdSel} de ${listaSer.length} equipamentos retirados`
    : "430 - Equipamento retirado";
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
  const opcoes = CODIGOS_QUEBRA.map(
    (c) => `<option value="${c}">${c}</option>`,
  ).join("");
  document.getElementById("acoes-modal").innerHTML = `
    <label class="detalhe-label" style="margin-bottom:6px;display:block">Código de retorno</label>
    <select id="select-codigo-quebra" class="input-select" style="width:100%;margin-bottom:12px">
      <option value="">Selecione o motivo...</option>${opcoes}
    </select>
    <label class="detalhe-label" style="margin-bottom:6px;display:block">Observação (opcional)</label>
    <textarea id="obs-exec-input" class="obs-textarea" placeholder="Alguma observação sobre a quebra..."></textarea>
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
  document.getElementById("acoes-modal").innerHTML = criarAcoesHTML();
  renderIcons();
}

// --- Salvamento ---
async function executarSalvamento(camposBase, novoStatus) {
  const btns = document.querySelectorAll("#acoes-modal .btn");
  btns.forEach((b) => (b.disabled = true));

  const obsExec =
    document.getElementById("obs-exec-input")?.value?.trim() || "";
  const dataExec = formatarDataExec();
  const tecnico = tecnicoLogado()?.nome || "";

  // GPS e fotos em paralelo — nenhum bloqueia o outro
  const geoPromise = capturarGeolocalizacao();

  let fotoExec = "";
  if (
    IMGBB_API_KEY !== "SUA_CHAVE_IMGBB_AQUI" &&
    _fotoArquivos.length &&
    navigator.onLine
  ) {
    try {
      mostrarStatusUpload("Enviando fotos...");
      fotoExec = await uploadTodasFotos(_fotoArquivos);
    } catch (e) {
      console.warn("Falha no upload de fotos:", e);
    }
  }

  const geo = await geoPromise;

  // Registra visita automaticamente ao concluir qualquer ação
  const visitasAnt = contratoAtivo.visitas || "";
  const novasVisitas = visitasAnt ? `${visitasAnt}|${dataExec}` : dataExec;

  const campos = {
    ...camposBase,
    [COL_OBS_EXEC]: obsExec,
    [COL_DATA_EXEC]: dataExec,
    [COL_TECNICO]: tecnico,
    [COL_FOTO]: fotoExec,
    [COL_BAIXA_SITE]: "Sim",
    [COL_VISITAS]: novasVisitas,
    ...(geo ? { [COL_LAT_EXEC]: geo.lat, [COL_LNG_EXEC]: geo.lng } : {}),
  };

  try {
    await salvarNaPlanilha(contratoAtivo, campos);

    const idx = contratos.findIndex((c) => c.id === contratoAtivo.id);
    if (idx !== -1) {
      contratos[idx] = {
        ...contratos[idx],
        status: novoStatus,
        codigoOS: camposBase[COL_CODIGO_OS],
        obsExec,
        dataExec,
        tecnicoExec: tecnico,
        fotoExec,
        seriaisRet: camposBase[COL_SERIAIS_RET] || contratos[idx].seriaisRet,
        baixaSite: "Sim",
        visitas: novasVisitas,
        ...(geo ? { latExec: geo.lat, lngExec: geo.lng } : {}),
      };
    }

    fecharModal();
    mostrarToast("Baixa registrada com sucesso.", "sucesso");
    aplicarFiltros();
  } catch (erro) {
    if (erro instanceof OfflineError) {
      const idx = contratos.findIndex((c) => c.id === contratoAtivo.id);
      if (idx !== -1) {
        contratos[idx] = {
          ...contratos[idx],
          status: novoStatus,
          codigoOS: camposBase[COL_CODIGO_OS],
          obsExec: campos[COL_OBS_EXEC],
          dataExec: campos[COL_DATA_EXEC],
          tecnicoExec: tecnico,
          seriaisRet: camposBase[COL_SERIAIS_RET] || contratos[idx].seriaisRet,
          baixaSite: "Sim",
          visitas: novasVisitas,
          _pendente: true,
        };
      }
      fecharModal();
      mostrarToast(
        "Sem conexão. Baixa salva localmente e será enviada ao reconectar.",
        "aviso",
      );
      atualizarIndicadorOffline();
      aplicarFiltros();
    } else {
      console.error("Erro ao salvar:", erro);
      mostrarToast(
        "Erro ao salvar. Verifique sua conexão e tente novamente.",
        "erro",
      );
      btns.forEach((b) => (b.disabled = false));
    }
  }
}

function mostrarStatusUpload(msg) {
  const area = document.getElementById("foto-preview");
  if (area)
    area.innerHTML = `<span style="font-size:0.82rem;color:#555">${msg}</span>`;
}

function fecharModal() {
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
  form.append("image", file);
  const resp = await fetch(
    `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
    {
      method: "POST",
      body: form,
    },
  );
  if (!resp.ok) throw new Error("Falha no upload da foto");
  const json = await resp.json();
  return json.data.url;
}

async function uploadTodasFotos(arquivos) {
  if (!arquivos?.length) return "";
  const urls = [];
  for (const file of arquivos) {
    const url = await uploadFoto(file);
    urls.push(url);
  }
  return urls.join("|");
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

  function adicionarFotos(files) {
    _fotoArquivos.push(...Array.from(files));
    renderizarPreviewFotos();
  }

  const camera = document.getElementById("foto-camera");
  const galeria = document.getElementById("foto-galeria");
  if (camera)
    camera.addEventListener("change", () => adicionarFotos(camera.files));
  if (galeria)
    galeria.addEventListener("change", () => adicionarFotos(galeria.files));
}

function renderizarPreviewFotos() {
  const preview = document.getElementById("foto-preview");
  if (!preview) return;
  preview.innerHTML = "";
  _fotoArquivos.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "foto-thumb-wrap";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.className = "foto-thumb-preview";
    const btn = document.createElement("button");
    btn.className = "foto-thumb-remove";
    btn.title = "Remover";
    btn.textContent = "×";
    btn.addEventListener("click", () => {
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
  const urls = fotoExec.split("|").filter(Boolean);
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
}

function selecionarTodosSeriais() {
  document
    .querySelectorAll("#seriais-selec .serial-selec")
    .forEach((el) => el.classList.add("serial-selecionado"));
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
  const lista = getContratosAdmin();
  const conteudo = document.getElementById("admin-conteudo");
  if (adminTabAtiva === "metricas")
    conteudo.innerHTML = renderizarMetricasHTML(lista);
  else if (adminTabAtiva === "historico")
    conteudo.innerHTML = renderizarHistoricoHTML(lista);
  else if (adminTabAtiva === "relatorio")
    conteudo.innerHTML = renderizarRelatorioHTML();
  else if (adminTabAtiva === "tecnicos") {
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
    const resp = await fetch(`${GAS_URL}?action=presenca`);
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

  const baixas = lista
    .filter((c) => {
      if (filtroStatus === "Todos")
        return c.status === "Retirado" || c.status === "Quebra" || c.status === "Parcial";
      return c.status === filtroStatus;
    })
    .sort((a, b) => parseDateBR(b.dataExec) - parseDateBR(a.dataExec));

  if (!baixas.length) {
    return `<div class="admin-secao">
      ${criarToggleHistSubView()}
      ${criarFiltroHistStatus(filtroStatus)}
      <div class="estado-vazio"><p>Nenhuma baixa encontrada.</p></div>
    </div>`;
  }

  const linhas = baixas
    .map((c) => {
      const cls = statusParaClasse(c.status);
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
      </tr>`;
    })
    .join("");

  return `
    <div class="admin-secao">
      ${criarToggleHistSubView()}
      ${criarFiltroHistStatus(filtroStatus)}
      <p class="historico-count">${baixas.length} registro(s)</p>
      <div class="tabela-scroll">
        <table class="admin-table">
          <thead><tr><th>Contrato</th><th>Nome</th><th>Cidade</th><th>Status</th><th>Técnico</th><th>Data</th><th>Connect</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>`;
}

function renderizarHistoricoPosDiaHTML(lista) {
  const umMesAtras = new Date();
  umMesAtras.setMonth(umMesAtras.getMonth() - 1);
  umMesAtras.setHours(0, 0, 0, 0);

  const comExec = lista.filter((c) => {
    if (!c.dataExec) return false;
    if (c.status !== "Retirado" && c.status !== "Parcial" && c.status !== "Quebra") return false;
    const dt = parseDateBR(c.dataExec);
    return dt && dt >= umMesAtras;
  });

  if (!comExec.length) {
    return `<div class="admin-secao">
      ${criarToggleHistSubView()}
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

  const dias = Object.entries(porDia).sort(([a], [b]) => parseDateBR(b) - parseDateBR(a));

  const totRet  = dias.reduce((s, [, d]) => s + d.retirado, 0);
  const totPar  = dias.reduce((s, [, d]) => s + d.parcial, 0);
  const totQbr  = dias.reduce((s, [, d]) => s + d.quebra, 0);
  const totGeral = totRet + totPar + totQbr;

  const linhas = dias.map(([dia, d]) => {
    const total = d.retirado + d.parcial + d.quebra;
    const taxaPct = Math.round(((d.retirado + d.parcial) / total) * 100);
    const taxaCls = taxaPct >= 70 ? "num-retirado" : taxaPct >= 50 ? "num-pendente" : "num-quebra";
    return `<tr>
      <td class="col-data-hist">${escHtml(dia)}</td>
      <td class="num-retirado">${d.retirado}</td>
      <td style="color:#8b5cf6;font-weight:700">${d.parcial || "—"}</td>
      <td class="num-quebra">${d.quebra || "—"}</td>
      <td><strong>${total}</strong></td>
      <td class="${taxaCls}">${taxaPct}%</td>
    </tr>`;
  }).join("");

  return `
    <div class="admin-secao">
      ${criarToggleHistSubView()}
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
      <option value="Retirado" ${valorAtual === "Retirado" ? "selected" : ""}>Somente Retirados</option>
      <option value="Quebra" ${valorAtual === "Quebra" ? "selected" : ""}>Somente Quebras</option>
      <option value="Todos" ${valorAtual === "Todos" ? "selected" : ""}>Todos (Ret. + Quebra)</option>
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
  const lista = getContratosAdmin();
  const dados = calcularICGPorCidade(lista);
  const META_MIX = 0.78;
  const META_OPCAO = 1.0;
  const META_INAD = 0.7;

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

  const periodos = calcularEficienciaPeriodos();
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

  document.getElementById("filter-cidade").addEventListener("change", () => {
    document.getElementById("filter-bairro").value = "";
    atualizarBairros();
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
  const elPeriodo = document.getElementById("filter-periodo");
  if (elPeriodo) elPeriodo.addEventListener("change", filtroAlterado);

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
