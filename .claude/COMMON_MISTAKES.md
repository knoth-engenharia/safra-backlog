# Common Mistakes

**⚠️ CRÍTICO — Ler no início de cada sessão**

---

## Erros Já Encontrados Neste Projeto

### 1. SheetDB lendo a aba errada

**Sintoma**: Dados aparecem em branco, apenas status "Pendente" padrão  
**Causa**: SheetDB lê a primeira aba por padrão; a aba correta é `SAFRA`  
**Fix**: A URL deve sempre incluir `?sheet=SAFRA`
```js
// ERRADO
const SHEETDB_URL = "https://sheetdb.io/api/v1/okh5hjwyagls3";

// CORRETO
const SHEETDB_URL = "https://sheetdb.io/api/v1/okh5hjwyagls3?sheet=SAFRA";
```

---

### 2. URL com espaços no final

**Sintoma**: API retorna erro ou dados inválidos  
**Causa**: A URL foi copiada com espaços no final: `"...okh5hjwyagls3  "`  
**Fix**: Verificar a constante `SHEETDB_URL` em `script.js` linha 5 — sem espaços

---

### 3. PATCH sem `?sheet=SAFRA`

**Sintoma**: Atualização de status falha silenciosamente ou atualiza aba errada  
**Causa**: A URL do PATCH também precisa do parâmetro `sheet`  
**Fix**: Usar `SHEETDB_ID` separado para montar as URLs:
```js
const SHEETDB_ID  = "okh5hjwyagls3";
const SHEETDB_URL = `https://sheetdb.io/api/v1/${SHEETDB_ID}?sheet=SAFRA`;
// PATCH:
const patchUrl = `https://sheetdb.io/api/v1/${SHEETDB_ID}/CONTRATO/${id}?sheet=SAFRA`;
```

---

### 4. Colunas STATUS e CODIGO_OS inexistentes na planilha

**Sintoma**: Botões de ação não salvam, status não atualiza  
**Causa**: As colunas `STATUS` e `CODIGO_OS` precisam existir na aba SAFRA  
**Fix**: Adicionar ambas na planilha. `STATUS` com padrão `Pendente`, `CODIGO_OS` vazio  
**Nota**: O nome da coluna de OS é configurável na linha 7 do `script.js`: `const COL_CODIGO_OS = "CODIGO_OS"`

---

### 5. Nomes de colunas com caracteres especiais

**Sintoma**: Campos como endereço e observações aparecem vazios  
**Causa**: Colunas com cedilha/acento (`ENDEREÇO`, `OBSERVAÇÕES`) podem ter encoding diferente  
**Fix**: Se campos aparecerem em branco, ativar modo diagnóstico e verificar chaves reais da API  
**Como ativar diagnóstico**: Ver `.claude/QUICK_START.md` — seção Debug

---

---

### 6. Classe `.hidden` sem efeito — telas não somem

**Sintoma**: Tela de login fica por cima do app após logar; botão trava em "Verificando..."  
**Causa**: Faltava a regra `.hidden { display: none !important; }` no CSS  
**Fix**: Regra global no início do `style.css`, logo após o reset do `body`

---

### 7. Aba TECNICOS inexistente — login não funciona

**Sintoma**: Tela de login dá erro de conexão ou não valida nenhum usuário  
**Causa**: A aba `TECNICOS` precisa existir no mesmo Google Sheets com colunas: `USUARIO`, `SENHA`, `NOME`  
**Fix**: Criar a aba e adicionar uma linha por técnico. Senha em texto simples (o SheetDB ID já está no código — não usar senhas usadas em outros sistemas)  
**Nota de segurança**: A planilha é privada (só quem tem o link do SheetDB acessa). Use um repositório privado no GitHub para maior segurança.

---

### 7. Colunas de execução inexistentes

**Sintoma**: Salvamento falha ou campos ficam em branco após confirmar  
**Colunas necessárias na aba SAFRA** (além de `STATUS` e `CODIGO_OS`):
- `DATA_EXEC` — preenchida automaticamente com data/hora
- `OBS_EXEC` — observação do técnico
- `TECNICO_EXEC` — nome do técnico logado

---

**Atualizar este arquivo quando:**
- Bug demorou mais de 30 min para debugar
- Erro pode se repetir em outra sessão
- Padrão violado da API SheetDB

**Last Updated**: 2026-05-06
