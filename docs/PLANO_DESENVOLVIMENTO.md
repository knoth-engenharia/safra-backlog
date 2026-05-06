# Plano de Desenvolvimento — Backlog Safra

**Sistema web para técnicos de campo visualizarem e atualizarem contratos de retirada de equipamentos (backlog Safra), usando Google Sheets como banco de dados via SheetDB API.**

---

## Regras do Projeto

- Não pular etapas
- Sempre explicar antes de gerar código
- Código limpo, simples e funcional
- HTML, CSS e JavaScript puro (sem frameworks)
- Estrutura evolutiva — MVP primeiro
- Interface para celular: botões grandes, layout limpo

---

## Etapas

### ✅ ETAPA 1 — Estrutura Inicial
- Criar `index.html`, `style.css`, `script.js`
- Layout simples para listar contratos
- Dados de exemplo (sem API ainda)

**Concluída em**: 2026-05-06

---

### ✅ ETAPA 2 — Integração com SheetDB
- Explicar como conectar com a API
- Fazer requisição GET para buscar contratos
- Exibir contratos na tela (substituir dados de exemplo)

**Detalhes técnicos**:
- SheetDB ID: `okh5hjwyagls3`
- Aba correta: `SAFRA` (parâmetro `?sheet=SAFRA` obrigatório em todas as URLs)
- Método: `fetch()` com `async/await`

**Concluída em**: 2026-05-06

---

### ✅ ETAPA 3 — Exibição dos Dados
Cada cartão de contrato mostra:
- Nome do cliente (`NOME_TITULAR`)
- Cidade (`NM_CIDADE`)
- Bairro (`BAIRRO`)
- Endereço (`ENDEREÇO`)
- Telefone (`TELEFONE`)
- Status (`STATUS`)

**Concluída em**: 2026-05-06

---

### ✅ ETAPA 4 — Filtros
- Filtro por cidade
- Filtro por bairro
- Filtro por status
- Filtros populados dinamicamente com valores únicos da planilha

**Concluída em**: 2026-05-06

---

### ✅ ETAPA 5 — Busca
- Campo de busca por nome do cliente ou número do contrato
- Busca em tempo real (evento `input`)

**Concluída em**: 2026-05-06

---

### ✅ ETAPA 6 — Tela de Detalhes
- Ao clicar em um cartão, abre modal (bottom sheet) com detalhes completos
- Campos exibidos: contrato, cidade, bairro, endereço, CEP, telefones, cluster, observações, status

**Concluída em**: 2026-05-06

---

### ✅ ETAPA 7 — Ações
Botões no modal que atualizam o status via PATCH na API:
- **Marcar como Retirado** → `STATUS = "Retirado"`
- **Marcar como Quebra** → `STATUS = "Quebra"`
- **Cliente Ausente** → `STATUS = "Ausente"`

**Detalhe técnico**: PATCH em `/CONTRATO/{valor}?sheet=SAFRA`  
**Pré-requisito**: coluna `STATUS` deve existir na aba SAFRA do Google Sheets

**Concluída em**: 2026-05-06

---

### ✅ ETAPA 8 — UX Mobile
- Interface mobile-first com `max-width: 700px`
- Botões grandes (padding generoso, fonte 1rem)
- Modal como bottom sheet (desliza de baixo)
- Header fixo no topo
- Cores por status: amarelo (pendente), verde (retirado), vermelho (quebra), roxo (ausente)

**Concluída em**: 2026-05-06

---

### ✅ ETAPA 9 — Tratamento de Erros
- Estado de carregamento (`⏳ Buscando contratos...`)
- Mensagem de erro com botão "Tentar novamente"
- Estado vazio quando filtro não retorna resultados
- Botões desabilitados durante PATCH para evitar cliques duplos

**Concluída em**: 2026-05-06

---

### 🔲 ETAPA 10 — Deploy
Publicar gratuitamente para acesso dos técnicos em campo.

**Opção A — GitHub Pages** (recomendado):
1. Criar repositório no GitHub
2. Subir `index.html`, `style.css`, `script.js`
3. Settings → Pages → Branch: main → Save
4. URL: `https://usuario.github.io/repositorio`

**Opção B — Netlify Drop** (mais rápido, sem conta necessária):
1. Acessar `netlify.com/drop`
2. Arrastar a pasta do projeto
3. URL gerada instantaneamente

**Consideração de segurança**: o SheetDB ID fica exposto no JS. Para dados sensíveis, usar SheetDB com autenticação por token. Para uso interno de técnicos, o risco é aceitável no MVP.

**Pendente** — aguardando confirmação para iniciar

---

## Status Geral

| Etapa | Status |
|-------|--------|
| 1 — Estrutura inicial | ✅ |
| 2 — Integração SheetDB | ✅ |
| 3 — Exibição dos dados | ✅ |
| 4 — Filtros | ✅ |
| 5 — Busca | ✅ |
| 6 — Tela de detalhes | ✅ |
| 7 — Ações (PATCH) | ✅ |
| 8 — UX Mobile | ✅ |
| 9 — Tratamento de erros | ✅ |
| 10 — Deploy | 🔲 |

---

**Last Updated**: 2026-05-06
