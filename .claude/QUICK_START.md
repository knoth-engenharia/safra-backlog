# Quick Start

**Referência rápida para o projeto Backlog Safra**

---

## Rodar o Projeto

```bash
# Não requer servidor — abrir diretamente no navegador
# Windows: duplo clique em index.html
# Ou arrastar index.html para o Chrome/Edge/Firefox
```

---

## Configuração da API

Arquivo: `script.js` — linhas 5–6

```js
const SHEETDB_ID  = "okh5hjwyagls3";
const SHEETDB_URL = `https://sheetdb.io/api/v1/${SHEETDB_ID}?sheet=SAFRA`;
```

**Regra obrigatória**: toda URL para a API deve ter `?sheet=SAFRA`

---

## Endpoints SheetDB usados

| Operação | Método | URL |
|----------|--------|-----|
| Buscar todos os contratos | GET | `/api/v1/{ID}?sheet=SAFRA` |
| Atualizar status | PATCH | `/api/v1/{ID}/CONTRATO/{valor}?sheet=SAFRA` |

---

## Colunas da Planilha (aba SAFRA)

| Campo no sistema | Coluna na planilha |
|---|---|
| `nome` | `NOME_TITULAR` |
| `contrato` | `CONTRATO` |
| `cidade` | `NM_CIDADE` |
| `bairro` | `BAIRRO` |
| `endereco` | `ENDEREÇO` |
| `telefone` | `TELEFONE` |
| `status` | `STATUS` ← precisa existir na planilha |
| `cluster` | `NM_CLUSTER` |
| `cep` | `CEP` |
| `observacoes` | `OBSERVAÇÕES` |

---

## Debug — Modo Diagnóstico

Se os dados aparecerem em branco, substituir em `carregarContratos()` temporariamente:

```js
// Substituir esta linha:
contratos = dados.map(mapearContrato);
preencherFiltros();
renderizarLista(contratos);

// Por esta (diagnóstico):
const chaves = Object.keys(dados[0]);
console.log("Chaves da API:", chaves);
console.log("Primeira linha:", dados[0]);
```

Abrir DevTools (F12) → Console para ver os nomes reais das colunas.

---

## Deploy (Etapa 10)

**Opção A — GitHub Pages** (recomendado):
1. Criar repositório no GitHub
2. Subir os 3 arquivos (`index.html`, `style.css`, `script.js`)
3. Settings → Pages → Branch: main → Save
4. URL gerada: `https://usuario.github.io/repositorio`

**Opção B — Netlify Drop**:
1. Acessar netlify.com/drop
2. Arrastar a pasta do projeto
3. URL gerada instantaneamente

---

**Last Updated**: 2026-05-06
