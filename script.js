// =========================================
// CONFIGURAÇÃO DA API
// =========================================
const SHEETDB_ID = "okh5hjwyagls3";
const SHEETDB_URL = `https://sheetdb.io/api/v1/${SHEETDB_ID}?sheet=SAFRA`;
const SHEETDB_AUTH_URL = `https://sheetdb.io/api/v1/${SHEETDB_ID}?sheet=TECNICOS`;

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

function parseDateBR(str) {
  if (!str) return 0;
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})[\s,]+(\d{2}):(\d{2})/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
}

function renderIcons() {
  if (window.lucide) lucide.createIcons();
}

let _toastTimer = null;
function mostrarToast(msg, tipo = "sucesso") {
  const el = document.getElementById("toast");
  if (!el) return;
  clearTimeout(_toastTimer);
  el.innerHTML = msg;
  el.className = `toast toast-${tipo}`;
  _toastTimer = setTimeout(() => {
    el.classList.add("toast-saindo");
    setTimeout(() => { el.className = "toast hidden"; }, 300);
  }, tipo === "erro" ? 5000 : 3500);
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
  localStorage.removeItem(SESSAO_KEY);
  location.reload();
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
    const resp = await fetch(SHEETDB_AUTH_URL);
    const lista = await resp.json();

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
    dataPend: linha["DATA_PEND"] || "",
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
    dataExec: linha[COL_DATA_EXEC] || "",
    obsExec: linha[COL_OBS_EXEC] || "",
    tecnicoExec: linha[COL_TECNICO] || "",
    fotoExec: linha[COL_FOTO] || "",
    seriaisRet: linha[COL_SERIAIS_RET] || "",
    dataAgend: linha["DATA"] || "",
    horario: linha["HORARIO"] || "",
    tecnicoDesig: linha["TECNICO_DESIG"] || "",
    status: linha["STATUS"] || "Pendente",
    _raw: linha,
  };
}

// =========================================
// ESTADO DA APLICAÇÃO
// =========================================
let contratos = [];
let contratoAtivo = null;
let paginaAtual = 1;

// =========================================
// INICIALIZAÇÃO
// =========================================
document.addEventListener("DOMContentLoaded", () => {
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
  configurarEventos();
  carregarContratos();
}

// =========================================
// COMUNICAÇÃO COM A API
// =========================================
async function carregarContratos() {
  mostrarCarregando();
  try {
    const resposta = await fetch(SHEETDB_URL);
    if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status}`);
    const dados = await resposta.json();
    if (!Array.isArray(dados) || dados.length === 0) {
      mostrarVazio("Nenhum contrato encontrado na planilha.");
      return;
    }
    contratos = dados.map(mapearContrato);

    // Restringe cidades conforme permissão do técnico logado
    const { cidades } = tecnicoLogado() || {};
    if (cidades) {
      const permitidas = cidades.map((c) => c.toLowerCase());
      contratos = contratos.filter((c) =>
        permitidas.includes(c.cidade.toLowerCase()),
      );
    }

    preencherFiltros();
    renderizarLista(contratos);
  } catch (erro) {
    console.error("Erro ao carregar contratos:", erro);
    mostrarErro(
      "Não foi possível carregar os contratos. Verifique sua conexão.",
    );
  }
}

async function salvarNaPlanilha(contrato, campos) {
  const url = `https://sheetdb.io/api/v1/${SHEETDB_ID}/CONTRATO/${encodeURIComponent(contrato.contrato)}?sheet=SAFRA`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: campos }),
  });
  if (!resp.ok) throw new Error(`Erro HTTP ${resp.status}`);
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
  preencherSelect("filter-cidade", cidades, "CIDADE");
  preencherSelect("filter-tipo", tipos, "TIPO");

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
    preencherSelect("filter-tecnico", tecnicos, "TÉCNICO");
    document.getElementById("filter-tecnico").classList.remove("hidden");
    if (saved.tecnico)
      document.getElementById("filter-tecnico").value = saved.tecnico;
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
  preencherSelect("filter-bairro", bairros, "BAIRRO");
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

function aplicarFiltros() {
  const busca = document.getElementById("search").value.toLowerCase().trim();
  const cidade = document.getElementById("filter-cidade").value;
  const bairro = document.getElementById("filter-bairro").value;
  const status = document.getElementById("filter-status").value;
  const tipo = document.getElementById("filter-tipo").value;
  const tecnico = document.getElementById("filter-tecnico").value;

  const resultado = contratos.filter((c) => {
    const novoEnd = extrairNovoEndereco(c.obs2) || "";
    const matchBusca =
      !busca ||
      c.nome.toLowerCase().includes(busca) ||
      c.contrato.toLowerCase().includes(busca) ||
      c.endereco.toLowerCase().includes(busca) ||
      novoEnd.toLowerCase().includes(busca);
    return (
      matchBusca &&
      (!cidade || c.cidade === cidade) &&
      (!bairro || c.bairro === bairro) &&
      (!status || c.status === status) &&
      (!tipo || c.tipoDesconexao === tipo) &&
      (!tecnico || c.tecnicoDesig === tecnico || c.tecnicoExec === tecnico)
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
    .map((s) => `<span class="serial-chip">${s}</span>`)
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

  // Agendados hoje (para o técnico logado) ficam no topo; depois outros agendados
  const usuario = tecnicoLogado()?.usuario?.toLowerCase() || "";
  const hojeStr = new Date().toLocaleDateString("pt-BR");
  const ehAgendado = (c) =>
    c.obs1?.trim().toUpperCase() === "AGENDADO" &&
    c.tecnicoDesig?.trim().toLowerCase() === usuario;
  const ehHoje = (c) => ehAgendado(c) && c.dataAgend?.trim() === hojeStr;

  const agendadosHoje = lista.filter(ehHoje);
  const outrosAgendados = lista.filter((c) => ehAgendado(c) && !ehHoje(c));
  const outros = lista.filter((c) => !ehAgendado(c));
  const ordenada = [...agendadosHoje, ...outrosAgendados, ...outros];

  const total = ordenada.length;
  const totalPags = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginaAtual > totalPags) paginaAtual = totalPags;

  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const pagina = ordenada.slice(inicio, inicio + POR_PAGINA);
  const fim = Math.min(inicio + POR_PAGINA, total);

  contador.textContent = `${total} contrato(s) — exibindo ${inicio + 1}–${fim}`;

  container.innerHTML = pagina.map(criarCartaoHTML).join("");
  pagina.forEach((c) => {
    const el = document.getElementById(`cartao-${c.id}`);
    if (el) el.addEventListener("click", () => abrirModal(c));
  });

  renderizarPaginacao(totalPags, total);
  renderIcons();
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
  const agendadoHoje = agendado && c.dataAgend?.trim() === hojeStr;

  const agendadoHeader = agendado
    ? `<div class="cartao-agendado-header${agendadoHoje ? " cartao-agendado-hoje-header" : ""}"><i data-lucide="calendar" class="icon icon-sm"></i> ${agendadoHoje ? "HOJE" : "AGENDADO"} — ${c.dataAgend || ""}${c.horario ? ` às ${c.horario}` : ""}</div>`
    : "";

  const dataExecHTML = c.dataExec
    ? `<div class="cartao-data-exec">Exec: ${c.dataExec}${c.tecnicoExec ? ` · ${c.tecnicoExec}` : ""}</div>`
    : "";

  const tipoBadge = c.tipoDesconexao
    ? `<span class="badge-tipo badge-tipo-${c.tipoDesconexao.toLowerCase()}">${c.tipoDesconexao}</span>`
    : "";

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${endExib}, ${c.cidade}`)}`;

  return `
    <div class="cartao status-${cls}${agendado ? " cartao-agendado" : ""}" id="cartao-${c.id}">
      ${agendadoHeader}
      <div class="cartao-nome">${c.nome}</div>
      <div class="cartao-info">
        ${c.cidade} — ${c.bairro}<br/>
        <div class="end-row">
          <span>${novoEnd ? `<span class="tag-novo-end">Novo end.</span> ` : ""}${endExib}</span>
          <a href="${mapsUrl}" class="btn-mapa-card" target="_blank" onclick="event.stopPropagation()" title="Ver no mapa"><i data-lucide="map-pin" class="icon icon-sm"></i></a>
        </div>
        ${telExib ? `<br/>${telExib}` : ""}
      </div>
      <div class="cartao-footer">
        <span class="badge-status badge-${cls}">${c.status}</span>
        <span class="cartao-detalhe">${c.contrato}</span>
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

  const campo = (label, valor) =>
    valor
      ? `<div class="detalhe-campo"><span class="detalhe-label">${label}</span><span class="detalhe-valor">${valor}</span></div>`
      : "";

  const endParaMaps = novoEnd || contrato.endereco;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${endParaMaps}, ${contrato.cidade}`)}`;
  const btnMaps = `<a href="${mapsUrl}" class="btn-mapa-modal" target="_blank"><i data-lucide="map-pin" class="icon icon-sm"></i> Ver no Google Maps</a>`;

  body.innerHTML = `
    <div class="detalhe-titulo">${contrato.nome}</div>
    ${campo("Contrato", contrato.contrato)}
    ${campo("Cidade", contrato.cidade)}
    ${campo("Bairro", contrato.bairro)}
    ${
      novoEnd
        ? `${campo("Endereço original", contrato.endereco)}<div class="detalhe-campo"><span class="detalhe-label">Novo Endereço</span><span class="detalhe-valor detalhe-destaque">${novoEnd}</span>${btnMaps}</div>`
        : `<div class="detalhe-campo"><span class="detalhe-label">Endereço</span><span class="detalhe-valor">${contrato.endereco}</span>${btnMaps}</div>`
    }
    ${campo("Data Pendente", contrato.dataPend)}
    ${campo("OBS 1", contrato.obs1)}
    ${campo("OBS 2", contrato.obs2)}
    ${contrato.dataAgend || contrato.horario ? campo("Agendamento", `${contrato.dataAgend || ""}${contrato.horario ? ` às ${contrato.horario}` : ""}`) : ""}
    ${campo("Técnico Designado", contrato.tecnicoDesig)}
    ${campo("Cluster", contrato.cluster)}
    ${campo("Qtd. Equipamentos", contrato.quantidade)}
    ${criarSeriaisHTML(contrato.terminais)}
    ${campo("Tipo Desconexão", contrato.tipoDesconexao)}
    ${campo("Código OS", contrato.codigoOS)}
    ${campo("Obs. Execução", contrato.obsExec)}
    ${campo("Técnico", contrato.tecnicoExec)}
    ${campo("Data de Execução", contrato.dataExec)}
    ${campo("Status atual", contrato.status)}
    ${criarFotosModal(contrato.fotoExec)}

    <div class="secao-telefones">${criarBotoesPhone(contrato)}</div>
    <div class="acoes" id="acoes-modal">${criarAcoesHTML()}</div>`;

  document.getElementById("modal").classList.remove("hidden");
  renderIcons();
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
  await executarSalvamento(
    {
      STATUS: "Retirado",
      [COL_CODIGO_OS]: "430 - Equipamento retirado",
      [COL_SERIAIS_RET]: seriaisRet,
    },
    "Retirado",
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

  // Upload de fotos (pode ser vazio se não houver chave ou arquivos)
  let fotoExec = "";
  const fotoInput = document.getElementById("foto-input");
  if (IMGBB_API_KEY !== "SUA_CHAVE_IMGBB_AQUI" && fotoInput?.files?.length) {
    try {
      mostrarStatusUpload("Enviando fotos...");
      fotoExec = await uploadTodasFotos(fotoInput);
    } catch (e) {
      console.warn("Falha no upload de fotos:", e);
    }
  }

  const campos = {
    ...camposBase,
    [COL_OBS_EXEC]: obsExec,
    [COL_DATA_EXEC]: dataExec,
    [COL_TECNICO]: tecnico,
    [COL_FOTO]: fotoExec,
    [COL_BAIXA_SITE]: "Sim",
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
      };
    }

    fecharModal();
    mostrarToast("Baixa registrada com sucesso.", "sucesso");
    aplicarFiltros();
  } catch (erro) {
    console.error("Erro ao salvar:", erro);
    mostrarToast("Erro ao salvar. Verifique sua conexão e tente novamente.", "erro");
    btns.forEach((b) => (b.disabled = false));
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
        <span class="phone-label">${label}: <strong>${valor}</strong></span>
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

async function uploadTodasFotos(input) {
  if (!input?.files?.length) return "";
  const urls = [];
  for (const file of input.files) {
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
    <label class="btn-foto-label">
      <i data-lucide="camera" class="icon icon-sm"></i> Selecionar fotos
      <input type="file" id="foto-input" accept="image/*" multiple class="foto-input-hidden" />
    </label>
    <div id="foto-preview" class="foto-preview"></div>`;
}

function configurarPreviewFotos() {
  const input = document.getElementById("foto-input");
  if (!input) return;
  input.addEventListener("change", () => {
    const preview = document.getElementById("foto-preview");
    preview.innerHTML = "";
    Array.from(input.files).forEach((file) => {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.className = "foto-thumb-preview";
      preview.appendChild(img);
    });
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
  const fotoInput = document.getElementById("foto-input");
  if (!fotoInput?.files?.length) {
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
            💡 <em>Tire a foto do equipamento, do ambiente e/ou da fachada para garantir a evidência.</em>`,
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
  preencherSelect("adm-filter-cidade", cidades, "CIDADE");
  preencherSelect("adm-filter-tecnico", tecnicos, "TÉCNICO");
}

function getContratosAdmin() {
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
  renderIcons();
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
      return `<tr><td>${cidade}</td><td class="num-pendente">${p}</td><td class="num-retirado">${r}</td><td class="num-quebra">${q}</td><td>${cx.length}</td></tr>`;
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
      return `<tr><td>${tec}</td><td class="num-retirado">${r}</td><td class="num-quebra">${q}</td><td>${tx.length}</td></tr>`;
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

function renderizarHistoricoHTML(lista) {
  const baixas = lista
    .filter((c) => c.status === "Retirado" || c.status === "Quebra")
    .sort((a, b) => parseDateBR(b.dataExec) - parseDateBR(a.dataExec));

  if (!baixas.length) {
    return `<div class="estado-vazio"><div class="icone">📋</div><p>Nenhuma baixa encontrada com os filtros selecionados.</p></div>`;
  }

  const linhas = baixas
    .map((c) => {
      const cls = statusParaClasse(c.status);
      return `<tr>
        <td>${c.contrato}</td>
        <td>${c.nome}</td>
        <td>${c.cidade}</td>
        <td><span class="badge-status badge-${cls} badge-sm">${c.status}</span></td>
        <td>${c.tecnicoExec || "—"}</td>
        <td class="col-data">${c.dataExec || "—"}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="admin-secao">
      <p class="historico-count">${baixas.length} baixa(s) encontrada(s)</p>
      <div class="tabela-scroll">
        <table class="admin-table">
          <thead><tr><th>Contrato</th><th>Nome</th><th>Cidade</th><th>Status</th><th>Técnico</th><th>Data Exec.</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>`;
}

function renderizarRelatorioHTML() {
  return `
    <div class="admin-secao">
      <h3 class="admin-secao-titulo">Exportar Relatório</h3>
      <p class="relatorio-desc">
        Exporta todos os contratos conforme os filtros acima em formato CSV (compatível com Excel).
        Inclui status, técnico responsável, data de execução e demais campos.
      </p>
      <button class="btn btn-relatorio" onclick="baixarCSV()"><i data-lucide="download" class="icon icon-sm"></i> Baixar CSV</button>
    </div>`;
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
  document
    .getElementById("btn-limpar-filtros")
    .addEventListener("click", limparFiltros);
  document
    .getElementById("modal-fechar")
    .addEventListener("click", fecharModal);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") fecharModal();
  });

  // Admin
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
