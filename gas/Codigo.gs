// =============================================
// BACKLOG SAFRA — Google Apps Script Web App
// =============================================

const SPREADSHEET_ID = "12uS6DBiepCJbh3Gc5h40wR1hD5a-LWJpuStGfJ4rprU";

// Tempo de vida do cache em segundos (5 min)
const CACHE_TTL = 300;

// ---- GET: leitura de aba (com cache) ----
function doGet(e) {
  const sheetName = e.parameter.sheet || "SAFRA";
  try {
    const data = lerAbaComCache(sheetName);
    return jsonOk({ data });
  } catch (err) {
    return jsonOk({ error: err.message });
  }
}

// ---- POST: atualização de linha (invalida cache) ----
function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.payload);
    const { sheet, keyCol, keyVal, data } = payload;
    const sheetName = sheet || "SAFRA";
    atualizarLinha(sheetName, keyCol, keyVal, data);
    invalidarCache(sheetName);
    return jsonOk({ updated: 1 });
  } catch (err) {
    return jsonOk({ error: err.message });
  }
}

// ---- Lê aba com CacheService (retorno instantâneo após 1ª chamada) ----
function lerAbaComCache(sheetName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "sheet_" + sheetName;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const data = lerAba(sheetName);

  try {
    const serialized = JSON.stringify(data);
    // CacheService suporta até ~100KB por entrada
    if (serialized.length < 95000) {
      cache.put(cacheKey, serialized, CACHE_TTL);
    } else {
      // Planilha grande: divide em chunks de 50 linhas
      const chunkSize = 50;
      const totalChunks = Math.ceil(data.length / chunkSize);
      cache.put(cacheKey + "_chunks", String(totalChunks), CACHE_TTL);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = data.slice(i * chunkSize, (i + 1) * chunkSize);
        cache.put(cacheKey + "_" + i, JSON.stringify(chunk), CACHE_TTL);
      }
    }
  } catch (e) {
    // Falha silenciosa — próxima requisição tenta de novo
  }
  return data;
}

function invalidarCache(sheetName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "sheet_" + sheetName;
  // Remove entrada principal e possíveis chunks
  const chunksStr = cache.get(cacheKey + "_chunks");
  if (chunksStr) {
    const total = parseInt(chunksStr, 10);
    const keys = [cacheKey + "_chunks"];
    for (let i = 0; i < total; i++) keys.push(cacheKey + "_" + i);
    cache.removeAll(keys);
  }
  cache.remove(cacheKey);
}

// ---- Lê aba diretamente do Sheets ----
function lerAba(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ws = ss.getSheetByName(sheetName);
  if (!ws) throw new Error("Aba não encontrada: " + sheetName);

  const lastRow = ws.getLastRow();
  const lastCol = ws.getLastColumn();
  if (lastRow < 2) return [];

  const values = ws.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(String);
  const tz = Session.getScriptTimeZone();

  return values
    .slice(1)
    .filter((row) => row.some((cell) => cell !== "" && cell !== null))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        const val = row[i];
        obj[h] =
          val instanceof Date
            ? Utilities.formatDate(val, tz, "dd/MM/yyyy, HH:mm:ss")
            : val === null || val === undefined
              ? ""
              : String(val);
      });
      return obj;
    });
}

// ---- Atualiza linha em batch (1 read + 1 write em vez de N writes) ----
function atualizarLinha(sheetName, keyCol, keyVal, data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ws = ss.getSheetByName(sheetName);
  if (!ws) throw new Error("Aba não encontrada: " + sheetName);

  const lastRow = ws.getLastRow();
  const lastCol = ws.getLastColumn();
  const values = ws.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(String);

  const keyIdx = headers.indexOf(keyCol);
  if (keyIdx === -1) throw new Error("Coluna não encontrada: " + keyCol);

  const rowIdx = values
    .slice(1)
    .findIndex((row) => String(row[keyIdx]).trim() === String(keyVal).trim());
  if (rowIdx === -1) throw new Error("Contrato não encontrado: " + keyVal);

  const sheetRow = rowIdx + 2;

  // Lê a linha completa, modifica em memória, escreve de volta em 1 chamada
  const rowRange = ws.getRange(sheetRow, 1, 1, lastCol);
  const rowData = rowRange.getValues()[0];

  Object.entries(data).forEach(([col, val]) => {
    const colIdx = headers.indexOf(col);
    if (colIdx !== -1) rowData[colIdx] = val;
  });

  rowRange.setValues([rowData]);
}

// ---- Keep-alive: mantém o script aquecido ----
function keepAlive() {
  SpreadsheetApp.openById(SPREADSHEET_ID).getName();
}

// ---- Configura trigger de keep-alive (rodar UMA VEZ manualmente) ----
function configurarTriggerKeepAlive() {
  // Remove triggers keepAlive existentes para não duplicar
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "keepAlive")
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("keepAlive").timeBased().everyMinutes(5).create();

  Logger.log("✓ Trigger keepAlive configurado: executa a cada 5 minutos.");
}

function jsonOk(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/*
 * =============================================
 * COMO FAZER O DEPLOY
 * =============================================
 *
 * 1. Abra sua planilha → Extensões → Apps Script
 * 2. Cole este código (apague o anterior)
 * 3. Salve (Ctrl+S)
 * 4. Implantar → Nova implantação
 *    - Tipo: App da Web
 *    - Executar como: Eu
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Copie a URL e cole em GAS_URL no script.js
 *
 * ATIVAR KEEP-ALIVE (fazer UMA vez após deploy):
 * No editor Apps Script, selecione a função
 * "configurarTriggerKeepAlive" e clique em ▶ Executar.
 * Isso cria um trigger que mantém o script aquecido
 * e elimina o cold start de 15-40s.
 *
 * ATENÇÃO: após qualquer alteração neste código,
 * crie uma NOVA implantação — a URL muda.
 * =============================================
 */
