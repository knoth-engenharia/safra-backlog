# Roadmap de Melhorias — Backlog Safra

> Documento gerado em 2026-05-13. Referência para próximas sessões de desenvolvimento.

---

## Dores Críticas (resolver antes de crescer)

### 🔴 Segurança — Autenticação
- **Problema**: Login baixa a aba `TECNICOS` inteira (com senhas em texto puro) para o cliente. Qualquer pessoa com a GAS URL vê todos os usuários e senhas.
- **Solução**: Mover a verificação para o GAS (servidor). O cliente envia `{ usuario, senha }`, o GAS compara e devolve só o perfil — sem expor a lista.
- **Esforço**: Médio (1 dia de dev + 1 novo deploy do GAS)

### 🔴 Race Condition — Duas escritas simultâneas
- **Problema**: Dois técnicos no mesmo contrato → o último write sobrescreve o primeiro, sem aviso, sem conflito detectado.
- **Solução**: `LockService` do GAS + coluna `VERSAO` com controle otimista.
- **Esforço**: Médio (ver doc `REALTIME_RACECONDITIONS.md`)
- **Detalhe técnico**: documentado separadamente.

### 🟡 Race Condition — Dado desatualizado
- **Problema**: Cache IDB não tem TTL. Técnico pode trabalhar com dados de 2 dias atrás sem saber.
- **Solução**: Timestamp de cache + polling leve + indicador visual de "última atualização".
- **Esforço**: Baixo

---

## APIs Gratuitas — Game Changers

### BarcodeDetector API / ZXing.js — Leitura de seriais
- **O que faz**: Escaneia código de barras dos equipamentos via câmera.
- **Por que importa**: Elimina o maior erro humano — digitação errada de seriais de 12 chars hexadecimais.
- **Como usar**: `BarcodeDetector` nativo no Android Chrome. `ZXing.js` como fallback para iOS.
- **Custo**: Zero. Sem chave de API.
- **Esforço de implementação**: Baixo (1 botão no fluxo de Retirado).

### ViaCEP — Geocoding confiável
- **URL**: `https://viacep.com.br/ws/{CEP}/json/`
- **O que faz**: Dado um CEP, retorna logradouro, bairro e cidade padronizados pelo governo.
- **Por que importa**: O Nominatim falha com abreviações e sufixos da planilha Claro. ViaCEP retorna o endereço limpo e correto.
- **Pré-requisito**: Planilha precisa ter coluna de CEP (comum em sistemas da Claro).
- **Custo**: Zero. Sem chave.
- **Esforço**: Baixo.

### Firebase Cloud Messaging (FCM) — Push notifications
- **O que faz**: Notifica o celular do técnico mesmo com o app fechado.
- **Casos de uso**: Novo agendamento atribuído, lembrete 1h antes, contrato reatribuído.
- **Como**: Trigger no Apps Script detecta mudança na planilha → chama FCM → notificação chega no celular.
- **Custo**: Free tier cobre este volume.
- **Esforço**: Alto (requer Cloud Function mínima ou servidor simples).

### OpenRouteService — Otimização de rota
- **URL**: `openrouteservice.org` — 2.000 req/dia grátis
- **O que faz**: Dado N endereços selecionados, devolve a ordem ótima de visita + distância total + tempo.
- **Por que importa**: Hoje o técnico escolhe a ordem manualmente. ORS resolve o "Problema do Caixeiro Viajante" automaticamente.
- **Custo**: Gratuito até 2.000 req/dia.
- **Esforço**: Médio.

### Leaflet.js + OpenStreetMap — Mapa de contratos
- **O que faz**: Mapa visual com todos os contratos como pins coloridos por status.
- **Por que importa**: Técnico vê geograficamente onde estão os pendentes, sem selecionar rota às cegas.
- **Custo**: Zero. Sem chave de API.
- **Esforço**: Médio.

### jsPDF — Exportação de relatório em PDF
- **O que faz**: Gera PDF formatado com logo, tabela ICG e assinatura — tudo no browser.
- **Por que importa**: CSV não é apresentável para gestores ou para a Claro. PDF sim.
- **Custo**: Zero. Biblioteca client-side.
- **Esforço**: Baixo-médio.

---

## Features que Mudariam o Produto

### Assinatura do cliente no fluxo de retirada
- Técnico coleta assinatura digital do cliente na tela do celular.
- Salva como imagem junto à foto de execução.
- **Impacto**: Evidência jurídica de entrega. Pode ser exigida pela Claro.
- **Esforço**: Baixo. Canvas API nativa, zero dependência.

### Reagendamento direto pelo app
- Técnico encontra cliente ausente → clica "Reagendar" → escolhe data/hora → grava na planilha.
- Elimina o passo de ligar para o backoffice para reabrir a OS.
- **Esforço**: Baixo (escreve `DATA`, `HORARIO`, `TECNICO_DESIG`).

### Audit trail por contrato
- Coluna `HISTORICO` com JSON serializado: `[{ ts, usuario, status, obs }]`.
- Cada ação (visita, quebra, retirada) é appended, nunca sobrescrita.
- Admin vê linha do tempo completa de cada contrato.
- **Esforço**: Médio.

### Sincronização em tempo real (sem trocar o Sheets)
- Polling inteligente + LockService + controle de versão.
- **Detalhado em**: `docs/REALTIME_RACECONDITIONS.md`

---

## Horizonte Estratégico (quando o volume crescer)

O Google Sheets funciona até ~500 contratos / 5 usuários simultâneos. Além disso:

| Problema | Limite do Sheets | Solução futura |
|---|---|---|
| Race conditions | Sem transações | Supabase (PostgreSQL) |
| Cold start 15-40s | GAS tem warm-up | Edge Functions (<50ms) |
| Real-time | Sem WebSocket | Supabase Realtime |
| Auth segura | Senhas em plaintext | Supabase Auth (bcrypt) |
| Cache 100KB | Limite do CacheService | Sem limite prático |

**Migração natural**: Supabase free tier (500MB PostgreSQL + real-time + auth).
O código JS está estruturado para que apenas `salvarNaPlanilha()` e `carregarContratos()` precisariam ser reescritas.

---

## Tabela de Priorização

| # | Item | Impacto | Esforço | Prioridade |
|---|---|---|---|---|
| 1 | Auth segura no GAS | Crítico | Médio | 🔴 AGORA |
| 2 | LockService + versão (race condition) | Crítico | Médio | 🔴 AGORA |
| 3 | BarcodeDetector para seriais | Alto | Baixo | 🟡 PRÓXIMO |
| 4 | ViaCEP para geocoding | Alto | Baixo | 🟡 PRÓXIMO |
| 5 | Assinatura do cliente | Alto | Baixo | 🟡 PRÓXIMO |
| 6 | Reagendamento pelo app | Alto | Baixo | 🟡 PRÓXIMO |
| 7 | Polling com indicador de frescor | Médio | Baixo | 🟡 PRÓXIMO |
| 8 | jsPDF para relatórios | Médio | Médio | 🟢 FUTURO |
| 9 | Leaflet mapa de contratos | Médio | Médio | 🟢 FUTURO |
| 10 | OpenRouteService otimização | Médio | Médio | 🟢 FUTURO |
| 11 | FCM push notifications | Alto | Alto | 🟢 FUTURO |
| 12 | Audit trail / histórico | Médio | Médio | 🟢 FUTURO |
| 13 | Migração Supabase | Estrutural | Alto | 🔵 HORIZONTE |
