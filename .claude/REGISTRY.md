# REGISTRY — Backlog Safra
> Ler ANTES de qualquer ação. Atualizar IMEDIATAMENTE após qualquer adição, remoção ou alteração.
> Objetivo: IA entende o estado atual do código sem precisar ler todos os arquivos.

**Last Updated**: 2026-05-14

---

## ESTADO ATUAL DO SISTEMA

**Backend**: Google Apps Script (`gas/Codigo.gs`) — implantado como Web App
**Frontend**: HTML + CSS + JS puro, sem frameworks
**Banco**: Google Sheets — aba `SAFRA` (contratos) + aba `TECNICOS` (usuários)
**Deploy**: GitHub Pages (estático)

---

## CONFIGURAÇÃO CRÍTICA (`script.js` linhas 1–25)

| Constante | Valor atual | Descrição |
|---|---|---|
| `GAS_URL` | `AKfycby...` (linha 7) | URL do Web App GAS — muda a cada novo deploy |
| `IMGBB_API_KEY` | `a6d2e345...` (linha 11) | Chave ImgBB para upload de fotos |
| `POR_PAGINA` | `30` | Contratos por página |

**⚠️ Ao alterar `gas/Codigo.gs`, um novo deploy é obrigatório e a `GAS_URL` muda.**

---

## COLUNAS DA PLANILHA

### Aba `SAFRA` (contratos)
| Coluna | Constante JS | Leitura/Escrita |
|---|---|---|
| `CODIGO_OS` | `COL_CODIGO_OS` | Chave primária |
| `STATUS` | — | R/W — Pendente / Retirado / Parcial / Quebra |
| `DATA_EXEC` | `COL_DATA_EXEC` | W — preenchido automaticamente |
| `OBS_EXEC` | `COL_OBS_EXEC` | W — observação do técnico |
| `TECNICO_EXEC` | `COL_TECNICO` | W — nome do técnico logado |
| `FOTO_EXEC` | `COL_FOTO` | W — URL da foto (ImgBB) |
| `BAIXA_SITE` | `COL_BAIXA_SITE` | W |
| `SERIAIS_RETIRADOS` | `COL_SERIAIS_RET` | W |
| `VISITAS` | `COL_VISITAS` | W — contador de tentativas |
| `NO_CONNECT` | `COL_NO_CONNECT` | W — flag de connect |
| `LAT_EXEC` | `COL_LAT_EXEC` | W — GPS latitude (6 decimais) |
| `LNG_EXEC` | `COL_LNG_EXEC` | W — GPS longitude (6 decimais) |
| `TECNICO_DESIG` | — | R — técnico designado para agendamento |
| `DATA_PEND` | — | R — data de entrada no backlog |
| `OBS 1` | — | R — obs especial (ex: cliente solicita outro endereço) |
| `OBS 2` | — | R — segundo endereço (extraído por `extrairNovoEndereco()`) |

### Aba `TECNICOS` (usuários)
| Coluna | Notas |
|---|---|
| `USUARIO` | Chave, login |
| `SENHA` | Texto simples |
| `NOME` | Nome de exibição |
| `CIDADES` | Cidades separadas por vírgula |
| `ADM` | `"sim"` = acesso admin |
| `ULTIMO_LOGIN` | Criada automaticamente pelo GAS |
| `ULTIMO_ACESSO` | Atualizada a cada heartbeat (5 min) |

**Whitelist GAS** — colunas que o GAS aceita escrever:
- SAFRA: `STATUS, CODIGO_OS, DATA_EXEC, OBS_EXEC, TECNICO_EXEC, FOTO_EXEC, BAIXA_SITE, SERIAIS_RETIRADOS, VISITAS, NO_CONNECT, LAT_EXEC, LNG_EXEC`
- TECNICOS: `ULTIMO_LOGIN, ULTIMO_ACESSO`

---

## MAPA DE FUNÇÕES — `script.js` (~3354 linhas)

### Constantes e estado global (L1–1034)
- L6 `GAS_URL` — URL do GAS
- L13–23 `COL_*` — nomes das colunas
- L27 `CODIGOS_QUEBRA[]` — lista de códigos de quebra
- L1012 `contratos[]`, `contratoAtivo`, `todosOsTecnicos[]`
- L1026 `modoRota`, `rotaSelecionados`
- L1034 `histSubView` — "lista" | "dia" (sub-aba histórico admin)

### Utilitários (L43–120)
- L43 `toTitleCase(str)` — capitaliza string
- L52 `escHtml(s)` — **XSS: usar em TODO innerHTML com dado externo**
- L62 `nomeTecnico(usuario)` — busca nome pelo usuário em `todosOsTecnicos`
- L73 `parseDateBR(str)` — converte `DD/MM/YYYY, HH:mm:ss` → Date (retorna 0 se inválido)
- L87 `formatarData(str, incluirHora)` — formata para exibição

### SLA / Período / Duplicatas (L121–227)
- L122 `calcularDiasSLA(c)` — dias desde DATA_PEND
- L140 `criarBadgeSLA(c)` — HTML do badge SLA
- L149 `filtrarPorPeriodo(c, periodo)` — "semana" | "mes" | "mes-anterior"
- L182 `detectarDuplicatas(contrato)` — detecta contratos com mesmo endereço
- L198 `criarAlertaDuplicatasHTML(dups)` — HTML do alerta

### Geolocalização / Distância (L229–473)
- L232 `haversineKm(lat1, lng1, lat2, lng2)` — cálculo de distância
- L248 `lerCacheGeocode()` / L256 `salvarCacheGeocode()` — cache localStorage
- L308 `geocodificarEndereco(endereco, cidade)` — Nominatim → lat/lng
- L344 `ativarLocalizacao()` — pede GPS do usuário
- L400 `calcularDistanciasPagina()` — geocodifica contratos da página atual
- L466 `filtrarPorDistancia(c, distFiltro)` — filtra por raio (500m, 1km, 5km, 10km)
- L690 `capturarGeolocalizacao()` — GPS da execução (6s timeout, retorna `{lat, lng}` ou null)

### Rota (L474–554)
- L477 `toggleModoRota()` — ativa/desativa modo rota
- L491 `toggleSelecaoRota(id, event)` — seleciona/remove contrato da rota
- L521 `atualizarBarraRota()` — atualiza barra flutuante com selecionados
- L541 `abrirRotaMaps()` — abre Google Maps com waypoints

### Agrupamento por rua (L555–579)
- L558 `toggleAgrupamento()` — alterna modo "por rua"
- L573 `extrairNomeRua(endereco)` — extrai nome da rua do endereço

### Toast / Tentativas (L580–619)
- L580 `registrarTentativa()` — incrementa contador de visitas
- L603 `mostrarToast(msg, tipo)` — notificação flutuante ("sucesso" | "erro" | "aviso")

### Sessão / Login (L620–737)
- L626 `tecnicoLogado()` — retorna objeto do técnico ou null
- L634 `salvarSessao(tecnico)` — grava em sessionStorage
- L638 `encerrarSessao()` — limpa sessão, para heartbeat, volta ao login
- L735 `tentarLogin()` — valida credenciais contra aba TECNICOS

### Heartbeat / Presença (L644–687)
- L654 `enviarHeartbeat(isLogin)` — POST ao GAS com `action: "heartbeat"`
- L670 `iniciarHeartbeat()` — inicia timer 5 min + listener de visibilidade
- L682 `pararHeartbeat()` — limpa timer e listener
- L709 `tempoRelativo(str)` — "Agora", "5 min atrás", "3 h atrás", etc.
- L724 `statusPresenca(str)` — retorna `{cls, label}` para badge de presença

### Mapeamento / Carregamento (L800–1010)
- L803 `mapearContrato(linha, indice)` — converte linha Sheets → objeto interno
- L854 `abrirIDB()` — IndexedDB para cache offline
- L871 `salvarContratosIDB()` / L883 `lerContratosIDB()` — offline cache
- L899 `enfileirarBaixa()` — fila offline de escritas pendentes
- L947 `processarFilaBaixas()` — processa fila quando volta online

### Telas (L1055–1096)
- L1055 `mostrarTelaLogin()` — exibe tela de login
- L1065 `iniciarApp()` — inicializa app após login (preenche filtros, carrega contratos)

### API / Dados (L1097–1183)
- L1098 `carregarContratos()` — GET GAS, aplica filtro OBS1, popula `contratos[]`
  - **Regra OBS1**: não-admins não veem contratos com `OBS 1 = "CLIENTE SOLICITA RETIRADA EM OUTRO ENDEREÇO"`
- L1157 `salvarNaPlanilha(contrato, campos)` — POST GAS para atualizar linha

### Filtros (L1184–1398)
- L1209 `preencherFiltros()` — popula selects de cidade/bairro/tipo/técnico
- L1265 `atualizarBairros()` — atualiza bairros ao mudar cidade
- L1287 `limparFiltros()` — reseta todos os filtros
- L1355 `aplicarFiltros()` — filtra `contratos[]` e chama `renderizarLista()`
  - **Regra agendamento**: contratos com `TECNICO_DESIG === usuarioLogado` aparecem SEMPRE (ignoram filtro cidade)

### Renderização de lista (L1400–1749)
- L1445 `renderizarLista(lista)` — renderiza cartões, separando agendados no topo
  - Agendados ordenados por data/hora mais próxima
  - Labels: HOJE / AMANHÃ / dia da semana (Seg, Ter, ...)
- L1587 `renderizarPaginacao()` — paginação (30 por página)
- L1658 `criarCartaoHTML(c)` — HTML de um cartão de contrato
- L1738 `statusParaClasse(s)` — mapeia status → classe CSS

### Modal de detalhes (L1750–1867)
- L1753 `abrirModal(contrato)` — abre modal com todos os campos + seção Execução + link GPS se disponível
- L1869 `abrirModalConnect(c)` — modal de dados para Connect (admin)
- L1968 `criarAcoesHTML()` — botões de ação no modal (Retirado / Quebra / etc.)
- L1975 `mostrarConfirmacaoRetirado()` — fluxo de confirmação de retirada
- L1987 `confirmarRetirado()` — executa salvamento de retirada
- L2015 `mostrarSeletorQuebra()` — seletor de código de quebra
- L2033 `confirmarQuebra()` — executa salvamento de quebra
- L2053 `executarSalvamento(camposBase, novoStatus)` — **função central de escrita**
  - Captura GPS em paralelo com upload de fotos
  - Atimismo: atualiza UI antes da confirmação do servidor
  - Rollback em caso de erro

### Fotos (L2210–2355)
- L2212 `uploadFoto(file)` — upload para ImgBB, retorna URL
- L2227 `uploadTodasFotos(arquivos)` — upload em paralelo, retorna lista de URLs
- L2237 `criarInputFoto()` — input file para câmera
- L2295 `criarFotosModal(fotoExec)` — exibe fotos salvas no modal

### Tutorial (L2357–2513)
- L2359 `TUTORIAL_PASSOS[]` — array com steps do tutorial
- L2461 `abrirTutorial()` / L2467 `fecharTutorial()`

### Painel Admin (L2514–3243)
- L2541 `adminTabAtiva` — "metricas" | "historico" | "relatorio" | "tecnicos"
- L2543 `abrirAdmin()` — exibe painel admin
- L2555 `mudarTabAdmin(tab)` — troca aba admin
- L2563 `preencherFiltrosAdmin()` — popula filtros admin (cidade, técnico, período)
- L2601 `renderizarAdmin()` — dispatcher: chama render da aba ativa
- L2623 `carregarPresenca()` — GET GAS `?action=presenca`
- L2633 `renderizarPresencaHTML(lista)` — grid de cartões de presença dos técnicos
- L2721 `renderizarMetricasHTML(lista)` — cards de métricas (totais, taxa, SLA)
- L2786 `criarToggleHistSubView()` — botões Lista / Por dia
- L2797 `mudarHistSubView(v)` — alterna entre sub-views do histórico
- L2802 `renderizarHistoricoHTML(lista)` — lista de execuções com filtro de status
- L2856 `renderizarHistoricoPosDiaHTML(lista)` — tabela agrupada por dia (últimos 30 dias)
- L2934 `criarFiltroHistStatus(valorAtual)` — select de filtro Retirado/Quebra/Todos
- `criarFiltroHistSite(valorAtual)` — select de filtro Todos/Somente via App (BAIXA_SITE)
- L2958 `calcularICGPorCidade(lista)` — agrupa contratos por cidade para tabela ICG
- `calcularICGPorCidadeViaSite(lista)` — variante: só BAIXA_SITE=Sim (exec) + todos pendentes
- `calcularEficienciaPeriodosViaSite()` — variante: só BAIXA_SITE=Sim (exec) + todos pendentes, agrupados por DATA_PEND
- L2986 `icgCells(grp, meta)` / L3000 `icgCellsMix(grp, meta)` — células da tabela ICG
- L3017 `renderizarRelatorioHTML()` — tabela ICG + eficiência por período
- L3134 `baixarCSV()` — exporta histórico como CSV
- L3182 `baixarCSVicg()` — exporta tabela ICG como CSV

### Eventos (L3247–3354)
- L3247 `configurarEventos()` — todos os event listeners

---

## ENDPOINTS GAS (`gas/Codigo.gs`)

| Método | Parâmetro | Ação |
|---|---|---|
| GET | `?sheet=SAFRA` | Lê aba SAFRA (com cache 5 min) |
| GET | `?sheet=TECNICOS` | Lê aba TECNICOS (não expõe SENHA) |
| GET | `?action=presenca` | Retorna presença de todos os técnicos |
| POST | `payload.action = "heartbeat"` | Atualiza ULTIMO_ACESSO (sem lock) |
| POST | `payload = {sheet, keyCol, keyVal, data}` | Atualiza linha (com LockService 8s) |

---

## FEATURES IMPLEMENTADAS

| Feature | Onde no JS | Notas |
|---|---|---|
| Login + sessão | L735, L626 | Valida contra aba TECNICOS |
| Heartbeat / presença online | L654–686 | 5 min, só quando visível |
| Filtros (cidade, bairro, status, tipo, técnico, período, distância) | L1355 | Persistidos em localStorage |
| Agendamentos no topo | L1445 | Ordenados por data mais próxima, label HOJE/AMANHÃ |
| Agendamentos cross-cidade | L1098, L1355 | TECNICO_DESIG = logado → sempre exibe |
| OBS1 oculta para técnicos | L1098 | "CLIENTE SOLICITA RETIRADA EM OUTRO ENDEREÇO" |
| Modo rota (Google Maps) | L477 | Multi-waypoint |
| Agrupamento por rua | L558 | Sort A-Z / mais / menos contratos |
| GPS na execução | L690, L2053 | Paralelo com upload de fotos, salva LAT_EXEC/LNG_EXEC |
| Upload fotos (ImgBB) | L2212 | Múltiplas fotos |
| Fluxo Retirado / Quebra / Parcial | L1975–2051 | Com seleção de seriais e código de quebra |
| Registrar tentativa | L580 | Incrementa VISITAS |
| Modal Connect (admin) | L1869 | Copia dados para ferramenta Connect |
| Admin: Métricas | L2721 | Cards totais, taxa, SLA |
| Admin: Histórico Lista | L2802 | Lista de execuções com filtro de status |
| Admin: Histórico Por Dia | L2856 | Tabela agrupada por dia, últimos 30 dias |
| Admin: Relatório ICG | L3017 | Tabela ICG por cidade + CSV |
| Admin: Técnicos (presença) | L2633 | Grid online/ausente com último acesso |
| Offline (IndexedDB + fila) | L854–1008 | Cache local + fila de baixas pendentes |
| Tutorial | L2359 | Passos com navegação |
| PWA / Service Worker | manifest.json | Instalável |
| Paginação | L1587 | 30 contratos por página |
| Geocoding (Nominatim) | L308 | Com cache localStorage |
| Filtro por distância | L466 | 500m, 1km, 5km, 10km |

---

## ESTRUTURA DE ARQUIVOS

```
Engenharia/
├── index.html          # Estrutura HTML — telas: login, app, admin, modais
├── style.css           # ~2420 linhas — mobile-first, max-width 700px
├── script.js           # ~3354 linhas — toda a lógica
├── manifest.json       # PWA manifest
├── gas/
│   └── Codigo.gs       # Backend GAS — NÃO commitado (.gitignore)
├── docs/
│   ├── ROADMAP_MELHORIAS.md   # Análise estratégica e priorização
│   └── PLANO_DESENVOLVIMENTO.md
└── .claude/
    ├── REGISTRY.md            # ← ESTE ARQUIVO (ler primeiro)
    ├── COMMON_MISTAKES.md     # Bugs conhecidos
    ├── QUICK_START.md         # Configuração
    └── ARCHITECTURE_MAP.md    # Mapa geral (legado, menos detalhado)
```

---

## CLASSES CSS CHAVE (`style.css`)

| Grupo | Classes principais |
|---|---|
| Status badges | `.status-pendente`, `.status-retirado`, `.status-parcial`, `.status-quebra` |
| Cartões | `.cartao`, `.cartao-agendado`, `.cartao-agendado-hoje`, `.cartao-agendado-amanha-header` |
| Admin | `.admin-table`, `.tabela-scroll`, `.admin-secao`, `.admin-tab`, `.admin-tab-ativo` |
| ICG | `.icg-table`, `.icg-head-mix`, `.icg-head-opcao`, `.icg-head-inad`, `.icg-cidade` |
| Presença | `.presenca-grid`, `.presenca-card`, `.presenca-online`, `.presenca-recente`, `.presenca-ausente`, `.dot-online` |
| Histórico dia | `.hist-subview-toggle`, `.btn-subview`, `.btn-subview-ativo`, `.hist-dia-resumo`, `.hist-dia-chip`, `.chip-ret`, `.chip-par`, `.chip-qbr`, `.chip-tot`, `.col-data-hist` |
| Modal | `.modal`, `.modal-content`, `.modal-secao`, `.modal-secao-corpo` |
| Filtros | `.filters`, `.filtros-panel`, `.input-select`, `.badge-filtros` |
| Toast | `.toast`, `.toast-sucesso`, `.toast-erro`, `.toast-aviso` |

---

## REGRAS DE NEGÓCIO CRÍTICAS

1. **OBS 1 oculta**: Técnicos não veem contratos onde `OBS 1 === "CLIENTE SOLICITA RETIRADA EM OUTRO ENDEREÇO"`.
2. **Agendamentos cross-cidade**: Se `TECNICO_DESIG === usuarioLogado`, o contrato aparece mesmo que a cidade não esteja habilitada para o técnico.
3. **Whitelist GAS**: Qualquer coluna fora da whitelist em `COLUNAS_PERMITIDAS` é silenciosamente ignorada no GAS. Adicionar nova coluna gravável requer atualizar o GAS **E fazer novo deploy**.
4. **Novo deploy GAS = nova URL**: Ao alterar `gas/Codigo.gs`, a `GAS_URL` em `script.js` L7 precisa ser atualizada.
5. **Cache GAS**: Leitura tem TTL de 5 min. Após escrita, o cache é invalidado automaticamente.
6. **`parseDateBR`**: Único parser de data confiável. Não usar `new Date(str)` com datas BR.
7. **`escHtml(s)`**: Obrigatório em todo `innerHTML` que receba dado da planilha.

---

## CHANGELOG DO REGISTRO
> Adicionar uma linha aqui a cada alteração no sistema.

| Data | O que mudou |
|---|---|
| 2026-05-14 | Criação deste arquivo. Estado inicial mapeado. |
| 2026-05-14 | CSS adicionado: `.hist-subview-toggle`, `.btn-subview`, chips de dia, `.col-data-hist` |
| 2026-05-14 | `renderizarHistoricoPosDiaHTML`: agrupa por regex DD/MM/YYYY, filtra últimos 30 dias |
| 2026-05-14 | GPS na execução: `capturarGeolocalizacao()`, `LAT_EXEC`/`LNG_EXEC` gravados e exibidos no modal |
| 2026-05-14 | Admin aba "Técnicos": `carregarPresenca()`, `renderizarPresencaHTML()`, heartbeat 5 min |
| 2026-05-14 | GAS: `COLUNAS_PERMITIDAS` virou objeto por aba; `STATUS` adicionado na whitelist SAFRA |
| 2026-05-14 | GAS: `lerPresenca()` usa `Utilities.formatDate` (fix datas aparecendo como string JS) |
| 2026-05-14 | `comprimirFoto()`: Canvas compression antes de armazenar (max 1920px, 82% JPEG) — fix "espaço insuficiente" |
| 2026-05-14 | `renderizarPreviewFotos()`: revoga objectURLs ao re-renderizar — fix memory leak |
| 2026-05-14 | `carregarContratos()`: IDB cache como fonte primária, fetch em background — fix reload na câmera |
| 2026-05-14 | `_filtrarContratosPermitidos()`: extraído de `carregarContratos()` para reutilização |
| 2026-05-14 | `pageshow` listener: skip reload quando página restaurada do bfcache |
| 2026-05-14 | `tela-historico-pessoal`: nova tela para técnicos não-admin ver seus contratos executados |
| 2026-05-14 | `abrirHistoricoPessoal()`, `fecharHistoricoPessoal()`, `renderizarHistoricoPessoal()` adicionados |
| 2026-05-14 | `#btn-meu-historico` no header (visível apenas para não-admins) |
| 2026-05-14 | IDB_VERSION 1→2: nova store `notif_agendamentos` para bridge com SW |
| 2026-05-14 | Notificações: `pedirPermissaoNotificacao()`, `agendarNotificacoesHoje()`, `_dispararNotificacao()`, `cancelarNotificacoes()` — 15min/1h/hora exata |
| 2026-05-14 | `sw.js` v3: `periodicsync` handler + `notificationclick` handler — resumo diário quando app fechado (Chrome Android PWA) |
| 2026-05-14 | Histórico admin: coluna "Via App" adicionada; filtro "Origem" (Todos / Somente via App) via `criarFiltroHistSite()` |
| 2026-05-14 | Relatório admin: filtro "Escopo" (Todos / Somente via App + pendentes); `calcularICGPorCidadeViaSite()` e `calcularEficienciaPeriodosViaSite()` adicionados |
| 2026-05-14 | CSS: `.hist-filtros-linha`, `.badge-site-sim`, `.badge-site-nao`, `.col-via-site` adicionados |
| 2026-05-14 | `renderizarHistoricoPosDiaHTML`: filtros Mostrar + Origem adicionados (mesmos da sub-view Lista) |
| 2026-05-14 | CSS: `.hist-filtros-linha .hist-filtro-status` → `flex:1` para ocupar largura total |
| 2026-05-14 | CSS: `@media (min-width:900px)` — layout desktop: `.container`/`.tela-admin` → 1100px, `.lista-contratos` → 2 colunas, modal → 860px |
