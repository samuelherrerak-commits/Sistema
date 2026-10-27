// Estado de la app: empresa abierta + sus cuentas, asientos y saldos en memoria (cargados de IndexedDB).
// Toda escritura va a IndexedDB al instante y se encola para subir a Google Sheets (ver sync.js).
import * as DB from './db.js';
import { calcular, CLASES_DEFAULT, CUENTA_RESULTADOS_DEFAULT, siguienteNumero } from './engine.js';
import { PLAN_BASE } from './plan-base.js';
import { uid } from './utils.js';

const ahora = () => new Date().toISOString();
const listeners = new Set();
const state = { empresa: null, cuentas: [], asientos: [], saldos: [], borradores: [], version: 0, memo: null };

const emitir = (tipo = 'change') => { state.version++; state.memo = null; listeners.forEach(fn => fn(tipo)); };

export const Store = {
  hooks: { alEscribir: () => {} },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  get empresa() { return state.empresa; },
  get cuentas() { return state.cuentas; },
  get asientos() { return state.asientos; },
  get saldos() { return state.saldos; },
  get borradores() { return state.borradores; },
  get anio() { return state.empresa ? state.empresa.anio : new Date().getFullYear(); },

  // ── Empresas ─────────────────────────────────────────────
  async empresas() { return (await DB.todos('empresas')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); },

  async crearEmpresa({ nombre, rif = '', anio = new Date().getFullYear(), planBase = true }) {
    const now = ahora();
    const e = { id: uid(), nombre: nombre.trim(), rif: rif.trim(), anio: Number(anio), cuenta_resultados: CUENTA_RESULTADOS_DEFAULT, clases: structuredClone(CLASES_DEFAULT), created_at: now, updated_at: now };
    const cuentas = planBase ? PLAN_BASE.map(([codigo, n]) => ({ id: `${e.id}|${codigo}`, empresa_id: e.id, codigo, nombre: n, updated_at: now })) : [];
    await DB.poner('empresas', e);
    await DB.poner('cuentas', cuentas);
    await DB.encolar([{ op: 'upsert', table: 'empresas', rows: [e] }, ...(cuentas.length ? [{ op: 'upsert', table: 'cuentas', rows: cuentas }] : [])]);
    Store.hooks.alEscribir();
    return e;
  },

  async guardarEmpresa(e) {
    e.updated_at = ahora();
    await DB.poner('empresas', e);
    await DB.encolar({ op: 'upsert', table: 'empresas', rows: [e] });
    if (state.empresa && state.empresa.id === e.id) state.empresa = e;
    Store.hooks.alEscribir();
    emitir();
  },

  async eliminarEmpresa(id) {
    await DB.borrarEmpresa(id);
    await DB.encolar(['asientos', 'cuentas', 'saldos', 'borradores'].map(t => ({ op: 'deleteWhere', table: t, column: 'empresa_id', value: id })).concat({ op: 'delete', table: 'empresas', id }));
    if (state.empresa && state.empresa.id === id) Store.cerrar();
    Store.hooks.alEscribir();
  },

  async abrir(id) {
    const emp = (await DB.todos('empresas')).find(e => e.id === id);
    if (!emp) return false;
    if (state.empresa && state.empresa.id === id) { await Store.recargar(); return true; }
    state.empresa = emp;
    await Store.recargar();
    return true;
  },

  async recargar() {
    if (!state.empresa) return;
    const id = state.empresa.id;
    const [emp, cuentas, asientos, saldos, borradores] = await Promise.all([
      DB.todos('empresas').then(l => l.find(e => e.id === id)), DB.porEmpresa('cuentas', id), DB.porEmpresa('asientos', id), DB.porEmpresa('saldos', id), DB.porEmpresa('borradores', id)
    ]);
    if (!emp) { Store.cerrar(); return; }
    state.empresa = emp; state.cuentas = cuentas; state.asientos = asientos; state.saldos = saldos; state.borradores = borradores;
    emitir();
  },

  cerrar() { state.empresa = null; state.cuentas = []; state.asientos = []; state.saldos = []; state.borradores = []; emitir(); },

  async cambiarAnio(anio) { await Store.guardarEmpresa({ ...state.empresa, anio: Number(anio) }); },

  // ── Cálculo (motor) del ejercicio abierto, memoizado ─────
  calc() {
    if (state.memo && state.memo.anio === Store.anio) return state.memo;
    const anio = Store.anio;
    const asientos = state.asientos.filter(a => a.anio === anio);
    const ini = {};
    for (const s of state.saldos) if (s.anio === anio) ini[s.codigo] = s.monto;
    const { plan, acc } = calcular(state.cuentas, state.empresa.clases, asientos, ini);
    state.memo = { anio, plan, acc, asientos, saldosIni: ini };
    return state.memo;
  },

  aniosConDatos() {
    const ys = new Set([Store.anio, new Date().getFullYear()]);
    for (const a of state.asientos) ys.add(a.anio);
    for (const s of state.saldos) ys.add(s.anio);
    return [...ys].sort((a, b) => b - a);
  },

  siguienteNumero() { return siguienteNumero(state.asientos.filter(a => a.anio === Store.anio)); },

  // ── Asientos ─────────────────────────────────────────────
  async guardarAsiento(a) {
    const row = {
      id: a.id || uid(), empresa_id: state.empresa.id, anio: Number(a.fecha.slice(0, 4)), numero: Number(a.numero), fecha: a.fecha,
      observacion: a.observacion || '', esCierre: !!a.esCierre, seq: a.seq || Date.now(),
      lineas: a.lineas.filter(l => l.cuenta).map(l => ({ cuenta: String(l.cuenta), descripcion: l.descripcion || '', debe: Number(l.debe) || 0, haber: Number(l.haber) || 0 })),
      updated_at: ahora()
    };
    await DB.poner('asientos', row);
    await DB.encolar({ op: 'upsert', table: 'asientos', rows: [row] });
    const i = state.asientos.findIndex(x => x.id === row.id);
    if (i >= 0) state.asientos[i] = row; else state.asientos.push(row);
    Store.hooks.alEscribir();
    emitir();
    return row;
  },

  async eliminarAsiento(id) {
    await DB.borrar('asientos', id);
    await DB.encolar({ op: 'delete', table: 'asientos', id });
    state.asientos = state.asientos.filter(a => a.id !== id);
    Store.hooks.alEscribir();
    emitir();
  },

  // Varios asientos de una vez (importación): un solo ciclo de escritura.
  async guardarAsientosLote(lista) {
    const now = ahora();
    const rows = lista.map((a, i) => ({
      id: a.id || uid(), empresa_id: state.empresa.id, anio: Number(a.fecha.slice(0, 4)), numero: Number(a.numero), fecha: a.fecha,
      observacion: a.observacion || '', esCierre: !!a.esCierre, seq: Date.now() + i, lineas: a.lineas, updated_at: now
    }));
    await DB.poner('asientos', rows);
    await DB.encolar({ op: 'upsert', table: 'asientos', rows });
    const ids = new Set(rows.map(r => r.id));
    state.asientos = state.asientos.filter(a => !ids.has(a.id)).concat(rows);
    Store.hooks.alEscribir();
    emitir();
  },

  // ── Plan de cuentas ──────────────────────────────────────
  async guardarCuenta({ codigo, nombre }) {
    const row = { id: `${state.empresa.id}|${codigo}`, empresa_id: state.empresa.id, codigo: String(codigo).trim(), nombre: nombre.trim(), updated_at: ahora() };
    await DB.poner('cuentas', row);
    await DB.encolar({ op: 'upsert', table: 'cuentas', rows: [row] });
    const i = state.cuentas.findIndex(c => c.id === row.id);
    if (i >= 0) state.cuentas[i] = row; else state.cuentas.push(row);
    Store.hooks.alEscribir();
    emitir();
  },

  async eliminarCuenta(codigo) {
    const id = `${state.empresa.id}|${codigo}`;
    await DB.borrar('cuentas', id);
    await DB.encolar({ op: 'delete', table: 'cuentas', id });
    state.cuentas = state.cuentas.filter(c => c.id !== id);
    Store.hooks.alEscribir();
    emitir();
  },

  async guardarCuentasLote(lista) {
    const now = ahora();
    const rows = lista.map(c => ({ id: `${state.empresa.id}|${c.codigo}`, empresa_id: state.empresa.id, codigo: String(c.codigo).trim(), nombre: c.nombre.trim(), updated_at: now }));
    await DB.poner('cuentas', rows);
    await DB.encolar({ op: 'upsert', table: 'cuentas', rows });
    const ids = new Set(rows.map(r => r.id));
    state.cuentas = state.cuentas.filter(c => !ids.has(c.id)).concat(rows);
    Store.hooks.alEscribir();
    emitir();
  },

  // ── Saldos iniciales ─────────────────────────────────────
  async setSaldo(codigo, monto, anio = Store.anio) {
    const id = `${state.empresa.id}|${anio}|${codigo}`;
    const m = Number(monto) || 0;
    if (!m) {
      await DB.borrar('saldos', id);
      await DB.encolar({ op: 'delete', table: 'saldos', id });
      state.saldos = state.saldos.filter(s => s.id !== id);
    } else {
      const row = { id, empresa_id: state.empresa.id, anio, codigo, monto: m, updated_at: ahora() };
      await DB.poner('saldos', row);
      await DB.encolar({ op: 'upsert', table: 'saldos', rows: [row] });
      const i = state.saldos.findIndex(s => s.id === id);
      if (i >= 0) state.saldos[i] = row; else state.saldos.push(row);
    }
    Store.hooks.alEscribir();
    emitir();
  },

  // Reemplaza todos los saldos iniciales de un año (abrir ejercicio / importar).
  async reemplazarSaldos(anio, mapa) {
    const viejos = state.saldos.filter(s => s.anio === anio);
    await DB.borrar('saldos', viejos.map(s => s.id));
    await DB.encolar(viejos.map(s => ({ op: 'delete', table: 'saldos', id: s.id })));
    const now = ahora();
    const rows = Object.entries(mapa).filter(([, m]) => Number(m)).map(([codigo, monto]) => ({ id: `${state.empresa.id}|${anio}|${codigo}`, empresa_id: state.empresa.id, anio, codigo, monto: Number(monto), updated_at: now }));
    await DB.poner('saldos', rows);
    if (rows.length) await DB.encolar({ op: 'upsert', table: 'saldos', rows });
    state.saldos = state.saldos.filter(s => s.anio !== anio).concat(rows);
    Store.hooks.alEscribir();
    emitir();
  },

  // ── Bandeja de facturas (borradores) ─────────────────────
  async guardarBorrador(b) {
    const now = ahora();
    const row = { id: b.id || uid(), empresa_id: state.empresa.id, estado: 'pendiente', origen: 'manual', fecha: '', proveedor: '', rif: '', nro_factura: '', total: 0, moneda: '', asiento: { lineas: [] }, archivo: '', nota: '', created_at: now, ...b, updated_at: now };
    await DB.poner('borradores', row);
    await DB.encolar({ op: 'upsert', table: 'borradores', rows: [row] });
    const i = state.borradores.findIndex(x => x.id === row.id);
    if (i >= 0) state.borradores[i] = row; else state.borradores.push(row);
    Store.hooks.alEscribir();
    emitir();
    return row;
  },

  async eliminarBorrador(id) {
    await DB.borrar('borradores', id);
    await DB.encolar({ op: 'delete', table: 'borradores', id });
    state.borradores = state.borradores.filter(b => b.id !== id);
    Store.hooks.alEscribir();
    emitir();
  },

  // ── Respaldo JSON ────────────────────────────────────────
  exportarJSON() {
    return { formato: 'sistema-contable', version: 1, exportado: ahora(), empresa: state.empresa, cuentas: state.cuentas, asientos: state.asientos, saldos: state.saldos, borradores: state.borradores };
  },

  // Importa un respaldo como EMPRESA NUEVA (nunca pisa una existente).
  async importarJSON(obj) {
    if (!obj || obj.formato !== 'sistema-contable') throw new Error('El archivo no es un respaldo del Sistema Contable.');
    const nuevoId = uid();
    const re = (r) => ({ ...r, empresa_id: nuevoId });
    const emp = { ...obj.empresa, id: nuevoId, nombre: `${obj.empresa.nombre} (restaurada)`, updated_at: ahora() };
    const cuentas = obj.cuentas.map(c => ({ ...re(c), id: `${nuevoId}|${c.codigo}` }));
    const asientos = obj.asientos.map(a => ({ ...re(a), id: uid() }));
    const saldos = obj.saldos.map(s => ({ ...re(s), id: `${nuevoId}|${s.anio}|${s.codigo}` }));
    const borradores = (obj.borradores || []).map(b => ({ ...re(b), id: uid() }));
    await DB.poner('empresas', emp); await DB.poner('cuentas', cuentas); await DB.poner('asientos', asientos); await DB.poner('saldos', saldos); await DB.poner('borradores', borradores);
    await DB.encolar([{ op: 'upsert', table: 'empresas', rows: [emp] }, { op: 'upsert', table: 'cuentas', rows: cuentas }, { op: 'upsert', table: 'asientos', rows: asientos }, { op: 'upsert', table: 'saldos', rows: saldos }, { op: 'upsert', table: 'borradores', rows: borradores }].filter(o => o.rows.length));
    Store.hooks.alEscribir();
    return emp;
  },

  // Creación completa desde la importación del Excel original.
  async crearEmpresaImportada({ empresa, cuentas, asientos, saldos }) {
    const now = ahora();
    const e = { id: uid(), clases: structuredClone(CLASES_DEFAULT), cuenta_resultados: CUENTA_RESULTADOS_DEFAULT, ...empresa, created_at: now, updated_at: now };
    const cs = cuentas.map(c => ({ id: `${e.id}|${c.codigo}`, empresa_id: e.id, codigo: c.codigo, nombre: c.nombre, updated_at: now }));
    const as = asientos.map((a, i) => ({ id: uid(), empresa_id: e.id, anio: Number(a.fecha.slice(0, 4)), numero: Number(a.numero), fecha: a.fecha, observacion: a.observacion || '', esCierre: false, seq: i, lineas: a.lineas, updated_at: now }));
    const ss = Object.entries(saldos).filter(([, m]) => Number(m)).map(([codigo, monto]) => ({ id: `${e.id}|${e.anio}|${codigo}`, empresa_id: e.id, anio: e.anio, codigo, monto: Number(monto), updated_at: now }));
    await DB.poner('empresas', e); await DB.poner('cuentas', cs); await DB.poner('asientos', as); await DB.poner('saldos', ss);
    await DB.encolar([{ op: 'upsert', table: 'empresas', rows: [e] }, { op: 'upsert', table: 'cuentas', rows: cs }, { op: 'upsert', table: 'asientos', rows: as }, { op: 'upsert', table: 'saldos', rows: ss }].filter(o => o.rows.length));
    Store.hooks.alEscribir();
    return e;
  }
};

export default Store;
