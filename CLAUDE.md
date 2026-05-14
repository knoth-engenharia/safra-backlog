# CLAUDE.md — Backlog Safra (EQS Engenharia)

**Sistema web para técnicos de campo visualizarem e atualizarem contratos de retirada de equipamentos.**

---

## Visão Geral do Projeto

**Sistema**: Backlog Safra — Retirada de Equipamentos  
**Tech Stack**: HTML + CSS + JavaScript puro (sem frameworks)  
**Banco de dados**: Google Sheets (aba `SAFRA`) via SheetDB API  
**SheetDB ID**: `okh5hjwyagls3`  
**Público-alvo**: Técnicos de campo — uso mobile, botões grandes, interface simples

---

## Session Start Protocol ⚡

**MANDATORY** ao início de cada sessão — ler NESTA ORDEM:

```
1. .claude/REGISTRY.md          # 🗂️ PRIMEIRO — estado atual completo do código
2. .claude/COMMON_MISTAKES.md   # ⚠️ SEGUNDO — bugs conhecidos
3. .claude/QUICK_START.md       # Comandos e configuração (se necessário)
```

> O REGISTRY tem mapa de funções com linha exata, colunas da planilha, features implementadas
> e regras de negócio. Leia-o antes de qualquer edição para não duplicar ou quebrar nada.

**Ao concluir qualquer tarefa:**
- Atualizar a tabela `CHANGELOG DO REGISTRO` no `.claude/REGISTRY.md`
- Atualizar seções afetadas do REGISTRY (funções adicionadas/removidas, novas colunas, etc.)
- Atualizar `.claude/COMMON_MISTAKES.md` se encontrou bug novo

---

## Plano de Desenvolvimento (10 Etapas)

Ver plano completo em: `docs/PLANO_DESENVOLVIMENTO.md`

| Etapa | Descrição | Status |
|-------|-----------|--------|
| 1 | Estrutura inicial (HTML, CSS, JS) | ✅ Concluída |
| 2 | Integração SheetDB — GET contratos | ✅ Concluída |
| 3 | Exibição dos dados nos cartões | ✅ Concluída |
| 4 | Filtros (cidade, bairro, status) | ✅ Concluída |
| 5 | Campo de busca (nome/contrato) | ✅ Concluída |
| 6 | Tela de detalhes (modal) | ✅ Concluída |
| 7 | Ações — botões atualizam STATUS via PATCH | ✅ Concluída |
| 8 | UX mobile (botões grandes, layout limpo) | ✅ Concluída |
| 9 | Tratamento de erros (API falhou) | ✅ Concluída |
| 10 | Deploy gratuito | 🔲 Pendente |

---

## Quick Start

```bash
# Abrir o sistema localmente
# Basta abrir index.html no navegador (duplo clique)
# Não requer servidor

# Para deploy (Etapa 10):
# GitHub Pages ou Netlify Drop
```

**Ver**: `.claude/QUICK_START.md` para referência completa

---

## Navegação da Documentação

- **Registro vivo**: `.claude/REGISTRY.md` 🗂️ **LER PRIMEIRO — funções, linhas, colunas, features**
- **Erros comuns**: `.claude/COMMON_MISTAKES.md` ⚠️ **OBRIGATÓRIO**
- **Comandos**: `.claude/QUICK_START.md`
- **Roadmap / estratégia**: `docs/ROADMAP_MELHORIAS.md`
- **Plano completo**: `docs/PLANO_DESENVOLVIMENTO.md`

---

**Last Updated**: 2026-05-14
