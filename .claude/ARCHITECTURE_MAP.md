# Architecture Map

**Mapa de arquivos do projeto Backlog Safra**

---

## Estrutura de Diretórios

```
Engenharia/
├── index.html          # Estrutura da página (HTML)
├── style.css           # Estilos e layout mobile-first
├── script.js           # Lógica, API SheetDB, filtros, modal
│
├── CLAUDE.md           # Guia principal para Claude Code
│
├── .claude/
│   ├── COMMON_MISTAKES.md    # Erros conhecidos ⚠️
│   ├── QUICK_START.md        # Configuração e referência rápida
│   ├── ARCHITECTURE_MAP.md   # Este arquivo
│   ├── LEARNINGS_INDEX.md    # Índice de aprendizados
│   ├── completions/          # Docs de tarefas concluídas
│   └── sessions/             # Sessões ativas (não auto-carregar)
│
└── docs/
    ├── INDEX.md                  # Índice geral de documentação
    ├── PLANO_DESENVOLVIMENTO.md  # Plano das 10 etapas
    ├── QUICK_REFERENCE.md        # Referência rápida extra
    └── archive/                  # Docs arquivados (não auto-carregar)
```

---

## Arquivos Principais

### `index.html`
Estrutura completa da página:
- `<header>` — título do sistema
- `#filters` — busca + selects de cidade/bairro/status
- `#lista-contratos` — onde os cartões são injetados pelo JS
- `#modal` — painel de detalhes deslizante (bottom sheet)

### `style.css`
- Reset base, variáveis de cor por status
- Layout mobile-first com `max-width: 700px`
- Classes de status: `.status-pendente`, `.status-retirado`, `.status-quebra`, `.status-ausente`
- Classes de badge: `.badge-pendente`, `.badge-retirado`, etc.
- Modal como bottom sheet (desliza de baixo)

### `script.js`
Seções em ordem:
1. `SHEETDB_ID` / `SHEETDB_URL` — configuração da API (linhas 5–6)
2. `mapearContrato()` — converte linha da planilha → objeto do sistema
3. Estado global: `contratos[]`, `contratoAtivo`
4. `carregarContratos()` — GET assíncrono com loading/erro
5. `salvarStatus()` — PATCH assíncrono
6. Filtros: `preencherFiltros()`, `aplicarFiltros()`
7. Renderização: `renderizarLista()`, `criarCartaoHTML()`
8. Modal: `abrirModal()`, `fecharModal()`
9. Estados visuais: `mostrarCarregando()`, `mostrarErro()`, `mostrarVazio()`
10. `configurarEventos()` — event listeners

---

## Fluxo de Dados

```
Google Sheets (aba SAFRA)
        ↓  SheetDB API (GET)
  dados brutos (array de objetos com chaves = nomes das colunas)
        ↓  mapearContrato()
  contratos[] (array normalizado com campos do sistema)
        ↓  aplicarFiltros()
  lista filtrada
        ↓  renderizarLista()
  HTML dos cartões injetado em #lista-contratos

  [Clique no cartão]
        ↓  abrirModal(contrato)
  Modal com detalhes + botões de ação

  [Clique em botão de ação]
        ↓  salvarStatus() → SheetDB API (PATCH)
  Planilha atualizada + lista re-renderizada localmente
```

---

**Last Updated**: 2026-05-06
