// =============================================
// BACKLOG SAFRA — Google Apps Script Web App
// Instruções de deploy no final deste arquivo.
// =============================================

// Cole aqui o ID da sua planilha Google Sheets
// (o trecho longo entre /d/ e /edit na URL)
const SPREADSHEET_ID = "12uS6DBiepCJbh3Gc5h40wR1hD5a-LWJpuStGfJ4rprU";

// ---- GET: leitura de aba ----
function doGet(e) {
  const sheetName = e.parameter.sheet || "SAFRA";
  try {
    const data = lerAba(sheetName);
    return jsonOk({ data });
  } catch (err) {
    return jsonOk({ error: err.message });
  }
}

// ---- POST: atualização de linha ----
function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.payload);
    const { sheet, keyCol, keyVal, data } = payload;
    atualizarLinha(sheet || "SAFRA", keyCol, keyVal, data);
    return jsonOk({ updated: 1 });
  } catch (err) {
    return jsonOk({ error: err.message });
  }
}

// ---- Lê aba e retorna array de objetos ----
function lerAba(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ws = ss.getSheetByName(sheetName);
  if (!ws) throw new Error("Aba não encontrada: " + sheetName);

  const values = ws.getDataRange().getValues();
  if (values.length < 2) return [];

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

// ---- Atualiza campos de uma linha pelo valor de uma coluna-chave ----
function atualizarLinha(sheetName, keyCol, keyVal, data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ws = ss.getSheetByName(sheetName);
  if (!ws) throw new Error("Aba não encontrada: " + sheetName);

  const values = ws.getDataRange().getValues();
  const headers = values[0].map(String);

  const keyIdx = headers.indexOf(keyCol);
  if (keyIdx === -1) throw new Error("Coluna não encontrada: " + keyCol);

  const rowIdx = values
    .slice(1)
    .findIndex((row) => String(row[keyIdx]).trim() === String(keyVal).trim());
  if (rowIdx === -1) throw new Error("Contrato não encontrado: " + keyVal);

  const sheetRow = rowIdx + 2; // +1 cabeçalho + base-1 do Sheets

  Object.entries(data).forEach(([col, val]) => {
    const colIdx = headers.indexOf(col);
    if (colIdx !== -1) {
      ws.getRange(sheetRow, colIdx + 1).setValue(val);
    }
  });
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
 * 1. Abra sua planilha Google Sheets
 * 2. Menu: Extensões → Apps Script
 * 3. Cole este código no editor (apague o que tiver)
 * 4. Substitua SEU_SPREADSHEET_ID_AQUI pelo ID da planilha
 *    (está na URL: docs.google.com/spreadsheets/d/<<ID>>/edit)
 * 5. Salve (Ctrl+S)
 * 6. Clique em "Implantar" → "Nova implantação"
 *    - Tipo: App da Web
 *    - Executar como: Eu (sua conta Google)
 *    - Quem pode acessar: Qualquer pessoa
 * 7. Clique em "Implantar" e copie a URL gerada
 * 8. Cole a URL no campo GAS_URL de script.js
 *
 * ATENÇÃO: após cada alteração neste código,
 * crie uma NOVA implantação (não edite a existente).
 * A URL muda a cada nova implantação — atualize script.js.
 * =============================================
 */
