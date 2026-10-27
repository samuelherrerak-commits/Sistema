/**
 * ============================================================================
 *  BACKEND DEL SISTEMA CONTABLE SOBRE GOOGLE SHEETS (Apps Script)
 * ----------------------------------------------------------------------------
 *  Una hoja = una tabla. Mismo patrón que el backend de CIFCalc.
 *
 *  Tablas: empresas, cuentas, asientos, saldos, borradores
 *
 *  GET  ?table=<t>[&column=<c>&value=<v>]&pt=<token>
 *  GET  ?action=ping&pt=<token>
 *  POST (cuerpo JSON como text/plain para evitar preflight CORS):
 *       { action:"upsert",      table, rows:[...], pt }
 *       { action:"delete",      table, id, pt }
 *       { action:"deleteWhere", table, column, value, pt }
 *       { action:"crearBorrador", borrador:{...}, pt }      ← conector de IA / Claude
 *       { action:"extraerFactura", empresa_id, mime, data(base64), plan:[[cod,nombre]], pt }
 *
 *  Apps Script SIEMPRE responde HTTP 200: los errores van en el JSON ({ok:false, code, error}).
 *
 *  INSTALACIÓN (una sola vez):
 *   1. Crea una hoja de cálculo de Google → Extensiones → Apps Script → pega este archivo.
 *   2. Cambia TOKEN por una clave larga y propia (la misma se pone en la app → Ajustes → Conexión).
 *   3. Para la IA: Configuración del proyecto → Propiedades del script → agrega
 *        ANTHROPIC_API_KEY = sk-ant-...      (la clave NUNCA llega al navegador)
 *        ANTHROPIC_MODEL   = claude-sonnet-5-5   (opcional)
 *   4. Implementar → Nueva implementación → Aplicación web → Ejecutar como: Yo,
 *      Quién tiene acceso: Cualquier persona. Copia la URL /exec a la app.
 * ============================================================================
 */

const TOKEN = 'SISTEMA EK';
const REQUIRE_TOKEN_ON_GET = true;
const MAX_ROWS_PER_BATCH = 100;
const LOCK_WAIT_MS = 30000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Encabezados exactos (orden de columnas = orden en la hoja). Columnas nuevas SIEMPRE al final.
const SCHEMAS = {
  empresas: ['id', 'nombre', 'rif', 'anio', 'cuenta_resultados', 'clases', 'created_at', 'updated_at'],
  cuentas: ['id', 'empresa_id', 'codigo', 'nombre', 'updated_at'],
  // lineas = JSON [{cuenta, descripcion, debe, haber}]. Un asiento = una fila (no una fila por línea).
  asientos: ['id', 'empresa_id', 'anio', 'numero', 'fecha', 'observacion', 'es_cierre', 'lineas', 'updated_at'],
  saldos: ['id', 'empresa_id', 'anio', 'codigo', 'monto', 'updated_at'],
  // Bandeja de facturas: propuestas (de la IA o manuales) pendientes de aprobar por el contador.
  borradores: ['id', 'empresa_id', 'estado', 'origen', 'fecha', 'proveedor', 'rif', 'nro_factura', 'total', 'moneda',
    'asiento', 'archivo', 'nota', 'created_at', 'updated_at']
};

// ---------------------------------------------------------------------------
// ENTRADA HTTP
// ---------------------------------------------------------------------------

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (REQUIRE_TOKEN_ON_GET && !isAuthorized_(p.pt)) return json_({ ok: false, error: 'unauthorized', code: 401 });
    ensureSheets_();
    if (p.action === 'ping') return json_({ ok: true, data: 'pong', tables: Object.keys(SCHEMAS) });
    const err = validateTable_(p.table);
    if (err) return json_({ ok: false, error: err, code: 400 });
    let data = readTable_(p.table);
    if (p.column) {
      if (SCHEMAS[p.table].indexOf(p.column) === -1) return json_({ ok: false, error: 'columna desconocida: ' + p.column, code: 400 });
      const v = toText_(p.value);
      data = data.filter(function (r) { return r[p.column] === v; });
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: msg_(err), code: 500 });
  }
}

function doPost(e) {
  try {
    let body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (x) { return json_({ ok: false, error: 'JSON inválido en el cuerpo', code: 400 }); }
    const pt = body.pt !== undefined ? body.pt : (e && e.parameter && e.parameter.pt);
    if (!isAuthorized_(pt)) return json_({ ok: false, error: 'unauthorized', code: 401 });
    ensureSheets_();

    switch (body.action) {
      case 'upsert': return json_(withLock_(function () { return upsert_(body.table, body.rows); }, body.table));
      case 'delete': return json_(withLock_(function () { return deleteWhere_(body.table, 'id', body.id); }, body.table));
      case 'deleteWhere': return json_(withLock_(function () { return deleteWhere_(body.table, body.column, body.value); }, body.table));
      case 'crearBorrador': return json_(crearBorrador_(body.borrador));
      case 'extraerFactura': return json_(extraerFactura_(body));
      default: return json_({ ok: false, error: 'acción desconocida: ' + body.action, code: 400 });
    }
  } catch (err) {
    return json_({ ok: false, error: msg_(err), code: err && err.code ? err.code : 500 });
  }
}

// ---------------------------------------------------------------------------
// HOJAS
// ---------------------------------------------------------------------------

function ensureSheets_() {
  const cache = CacheService.getScriptCache();
  const key = 'sc_sheets_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(SCHEMAS))).slice(0, 22);
  if (cache.get(key)) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMAS).forEach(function (name) {
    const headers = SCHEMAS[name];
    let sh = ss.getSheetByName(name), isNew = false;
    if (!sh) { sh = ss.insertSheet(name); isNew = true; }
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    const rng = sh.getRange(1, 1, 1, headers.length);
    const cur = rng.getDisplayValues()[0];
    if (!headers.every(function (h, i) { return cur[i] === h; })) {
      rng.setNumberFormat('@').setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    if (isNew) sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@'); // todo como texto
  });
  cache.put(key, '1', 21600);
}

function sheet_(table) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(table); }

function readTable_(table) {
  const sh = sheet_(table), headers = SCHEMAS[table];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, headers.length).getValues();
  const out = [];
  vals.forEach(function (r) {
    if (r[0] === '' || r[0] === null) return;
    const o = {};
    headers.forEach(function (h, i) { o[h] = toText_(r[i]); });
    out.push(o);
  });
  return out;
}

// Inserta o actualiza por id. "Gana el más reciente": si la hoja ya tiene un updated_at mayor
// que el que llega, esa fila se omite (evita pisar cambios hechos desde otro equipo).
function upsert_(table, rows) {
  if (!Array.isArray(rows)) throw httpError_(400, 'rows debe ser un arreglo');
  if (rows.length > MAX_ROWS_PER_BATCH) throw httpError_(400, 'máximo ' + MAX_ROWS_PER_BATCH + ' filas por lote');
  const sh = sheet_(table), headers = SCHEMAS[table], cols = headers.length;
  const updCol = headers.indexOf('updated_at');
  const last = sh.getLastRow();
  const index = {};
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    const upd = updCol >= 0 ? sh.getRange(2, updCol + 1, last - 1, 1).getValues() : null;
    ids.forEach(function (r, i) { if (r[0] !== '') index[String(r[0])] = { row: i + 2, upd: upd ? String(upd[i][0]) : '' }; });
  }
  const appends = [];
  let updated = 0, skipped = 0;
  rows.forEach(function (row) {
    const id = toText_(row.id);
    if (!id) throw httpError_(400, 'fila sin id');
    const values = headers.map(function (h) { return toText_(row[h]); });
    const ex = index[id];
    if (ex) {
      if (updCol >= 0 && ex.upd && values[updCol] && ex.upd > values[updCol]) { skipped++; return; }
      sh.getRange(ex.row, 1, 1, cols).setNumberFormat('@').setValues([values]);
      updated++;
    } else {
      appends.push(values);
    }
  });
  if (appends.length) {
    const start = Math.max(sh.getLastRow(), 1) + 1;
    if (sh.getMaxRows() < start + appends.length) sh.insertRowsAfter(sh.getMaxRows(), start + appends.length - sh.getMaxRows());
    sh.getRange(start, 1, appends.length, cols).setNumberFormat('@').setValues(appends);
  }
  return { ok: true, inserted: appends.length, updated: updated, skipped: skipped };
}

// Borra las filas cuya columna == valor reescribiendo la hoja de una vez (rápido incluso con miles de filas).
function deleteWhere_(table, column, value) {
  const sh = sheet_(table), headers = SCHEMAS[table];
  const ci = headers.indexOf(column);
  if (ci === -1) throw httpError_(400, 'columna desconocida: ' + column);
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, deleted: 0 };
  const range = sh.getRange(2, 1, last - 1, headers.length);
  const vals = range.getValues();
  const v = toText_(value);
  const keep = vals.filter(function (r) { return toText_(r[ci]) !== v; });
  const deleted = vals.length - keep.length;
  if (deleted) {
    range.clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, headers.length).setNumberFormat('@').setValues(keep);
  }
  return { ok: true, deleted: deleted };
}

// ---------------------------------------------------------------------------
// BANDEJA DE FACTURAS (IA / conector)
// ---------------------------------------------------------------------------

/**
 * Crea un borrador pendiente de aprobación. Es el punto de entrada para cualquier conector externo
 * (Claude, Zapier, un correo reenviado...). Nunca crea asientos contabilizados: un humano aprueba en la app.
 * borrador = { empresa_id, fecha, proveedor, rif, nro_factura, total, moneda, nota, archivo, origen,
 *              asiento: { fecha, observacion, lineas:[{cuenta, descripcion, debe, haber}] } }
 */
function crearBorrador_(b) {
  if (!b || !b.empresa_id) throw httpError_(400, 'borrador.empresa_id es obligatorio');
  const now = new Date().toISOString();
  const row = {
    id: b.id || Utilities.getUuid(),
    empresa_id: b.empresa_id,
    estado: 'pendiente',
    origen: b.origen || 'conector',
    fecha: b.fecha || (b.asiento && b.asiento.fecha) || '',
    proveedor: b.proveedor || '', rif: b.rif || '', nro_factura: b.nro_factura || '',
    total: b.total || 0, moneda: b.moneda || '',
    asiento: typeof b.asiento === 'string' ? b.asiento : JSON.stringify(b.asiento || { lineas: [] }),
    archivo: b.archivo || '', nota: b.nota || '',
    created_at: now, updated_at: now
  };
  withLock_(function () { return upsert_('borradores', [row]); }, 'borradores');
  return { ok: true, id: row.id };
}

/**
 * Lee una factura (imagen o PDF) con Claude y devuelve un borrador de asiento. El modelo SOLO puede
 * usar cuentas del plan que envía la app. No guarda nada: la app decide si lo agrega a la bandeja.
 */
function extraerFactura_(body) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw httpError_(500, 'Falta ANTHROPIC_API_KEY en las propiedades del script.');
  const model = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
  if (!body.data || !body.mime) throw httpError_(400, 'Falta el archivo (data/mime).');
  if (body.data.length * 0.75 > MAX_FILE_BYTES) throw httpError_(400, 'El archivo supera 8 MB.');
  const plan = (body.plan || []).map(function (c) { return c[0] + ' ' + c[1]; }).join('\n');
  const esPdf = body.mime === 'application/pdf';

  const system = [
    'Eres un asistente contable venezolano. Lees una factura/recibo y propones UN asiento de partida doble.',
    'REGLAS:',
    '- Usa EXCLUSIVAMENTE códigos de la lista de cuentas (solo cuentas de 7 dígitos reciben movimientos).',
    '- Compra de bienes/servicios con crédito: Debe gasto/costo (base) + Debe IVA crédito fiscal (monto de IVA); Haber cuentas por pagar proveedores (total).',
    '- Si la factura indica que está pagada, acredita Caja/Bancos en lugar de proveedores.',
    '- Venta: Debe cuentas por cobrar clientes (total); Haber ingreso (base) + Haber IVA débito fiscal.',
    '- Si hay retenciones de IVA/ISLR indicadas en el documento, regístralas en las cuentas de impuestos del plan.',
    '- El asiento debe cuadrar al centavo: suma del Debe = suma del Haber. Montos con 2 decimales, sin separador de miles.',
    '- Si un dato no aparece, déjalo vacío; no inventes montos, RIF ni números. Baja la "confianza" si dudas.',
    '- Fecha en formato AAAA-MM-DD (la fecha de emisión de la factura).',
    '',
    'PLAN DE CUENTAS DE LA EMPRESA (codigo nombre):',
    plan
  ].join('\n');

  const tool = {
    name: 'registrar_factura',
    description: 'Devuelve los datos de la factura y el asiento contable propuesto.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['compra', 'venta', 'otro'] },
        fecha: { type: 'string' }, proveedor: { type: 'string', description: 'Proveedor (compra) o cliente (venta)' },
        rif: { type: 'string' }, nro_factura: { type: 'string' }, nro_control: { type: 'string' },
        moneda: { type: 'string' }, base_imponible: { type: 'number' }, iva: { type: 'number' }, exento: { type: 'number' }, total: { type: 'number' },
        observacion: { type: 'string', description: 'Texto corto para la columna Descripción del asiento' },
        lineas: {
          type: 'array',
          items: { type: 'object', properties: { cuenta: { type: 'string' }, descripcion: { type: 'string' }, debe: { type: 'number' }, haber: { type: 'number' } }, required: ['cuenta', 'debe', 'haber'] }
        },
        confianza: { type: 'number', description: '0 a 1' },
        notas: { type: 'string', description: 'Dudas o datos faltantes para revisar' }
      },
      required: ['tipo', 'fecha', 'total', 'lineas']
    }
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: model, max_tokens: 2048, system: system,
      tools: [tool], tool_choice: { type: 'tool', name: 'registrar_factura' },
      messages: [{ role: 'user', content: [
        { type: esPdf ? 'document' : 'image', source: { type: 'base64', media_type: body.mime, data: body.data } },
        { type: 'text', text: 'Extrae la factura y propón el asiento. ' + (body.contexto || '') }
      ] }]
    })
  });
  const code = res.getResponseCode();
  const parsed = JSON.parse(res.getContentText());
  if (code !== 200) throw httpError_(502, 'Error de la API de Claude (' + code + '): ' + ((parsed.error && parsed.error.message) || res.getContentText().slice(0, 200)));
  const block = (parsed.content || []).filter(function (c) { return c.type === 'tool_use'; })[0];
  if (!block) throw httpError_(502, 'La IA no devolvió datos estructurados.');
  return { ok: true, factura: block.input, modelo: model };
}

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw httpError_(503, 'Servidor ocupado, intenta de nuevo.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function validateTable_(t) { return t && SCHEMAS[t] ? null : 'tabla desconocida: ' + t; }
function isAuthorized_(pt) { return pt === TOKEN; }
function toText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
function httpError_(code, message) { const e = new Error(message); e.code = code; return e; }
function msg_(e) { return e && e.message ? e.message : String(e); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
