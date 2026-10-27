// Cliente del backend Google Sheets (Apps Script). Mismo contrato que CIFCalc.
// La URL y el token se guardan en este navegador (Ajustes → Conexión): el sitio estático no lleva secretos.
import { SHEETS_URL, SHEETS_TOKEN } from './config.js';
const KEY = 'sc_conexion';
const PREDETERMINADA = { url: SHEETS_URL, token: SHEETS_TOKEN, activo: !!(SHEETS_URL && SHEETS_TOKEN) };

export function getConexion() {
  try { return { ...PREDETERMINADA, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...PREDETERMINADA }; }
}
export function setConexion(c) {
  try { localStorage.setItem(KEY, JSON.stringify({ url: String(c.url || '').trim(), token: String(c.token || '').trim(), activo: !!c.activo })); } catch { /* sin almacenamiento */ }
}
export const configurado = () => { const c = getConexion(); return !!(c.activo && c.url && c.token); };

// Todo viaja como texto en la hoja; estos campos se restauran al leer.
const JSON_F = { empresas: ['clases'], asientos: ['lineas'], borradores: ['asiento'] };
const NUM_F = { empresas: ['anio'], asientos: ['anio', 'numero'], saldos: ['anio', 'monto'], borradores: ['total'] };

export function aFila(table, o) {
  const r = { ...o };
  if (table === 'asientos') { r.es_cierre = o.esCierre ? 'true' : ''; delete r.esCierre; }
  for (const k of JSON_F[table] || []) r[k] = JSON.stringify(o[k] == null ? (k === 'clases' ? [] : k === 'asiento' ? { lineas: [] } : []) : o[k]);
  return r;
}
export function deFila(table, r) {
  const o = { ...r };
  for (const k of NUM_F[table] || []) o[k] = Number(r[k]) || 0;
  for (const k of JSON_F[table] || []) { try { o[k] = JSON.parse(r[k]); } catch { o[k] = k === 'asiento' ? { lineas: [] } : []; } }
  if (table === 'asientos') { o.esCierre = String(r.es_cierre) === 'true'; delete o.es_cierre; }
  return o;
}

async function request(method, query, body) {
  const c = getConexion();
  if (!c.url || !c.token) throw new Error('Conexión con Google Sheets no configurada.');
  const params = new URLSearchParams({ ...(query || {}), pt: c.token });
  const opts = { method };
  if (body) { opts.headers = { 'Content-Type': 'text/plain' }; opts.body = JSON.stringify({ ...body, pt: c.token }); }
  const res = await fetch(`${c.url}${c.url.includes('?') ? '&' : '?'}${params}`, opts);
  const json = await res.json().catch(() => null);
  if (!json || json.ok !== true) throw new Error(json && json.error ? json.error : `respuesta HTTP ${res.status}`);
  return json;
}

export const ping = () => request('GET', { action: 'ping' });
export async function leer(table, column, value) {
  const q = { table };
  if (column) { q.column = column; q.value = value; }
  return ((await request('GET', q)).data || []).map(r => deFila(table, r));
}
export async function subir(table, rows) {
  for (let i = 0; i < rows.length; i += 100) await request('POST', null, { action: 'upsert', table, rows: rows.slice(i, i + 100).map(r => aFila(table, r)) });
}
export const borrarId = (table, id) => request('POST', null, { action: 'delete', table, id });
export const borrarDonde = (table, column, value) => request('POST', null, { action: 'deleteWhere', table, column, value });

// IA: el servidor lee la factura con el proveedor configurado (NVIDIA o Claude) y devuelve el asiento propuesto (la clave de la API nunca sale del servidor).
export async function extraerFactura({ empresa_id, imagenes, plan, contexto }) {
  return (await request('POST', null, { action: 'extraerFactura', empresa_id, imagenes, plan, contexto })).factura;
}
