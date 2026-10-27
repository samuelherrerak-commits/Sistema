// Sincronización con Google Sheets: cola de cambios (outbox) + descarga al abrir.
// - Los cambios se guardan SIEMPRE primero en el navegador y se suben en segundo plano.
// - Sin internet o sin conexión configurada, todo sigue funcionando y se sube cuando vuelva.
// - Si dos equipos editan lo mismo gana el cambio más reciente (updated_at).
import * as DB from './db.js';
import * as Sheets from './sheets.js';
import Store from './store.js';

const TABLAS = ['cuentas', 'asientos', 'saldos', 'borradores'];
let estado = { estado: 'desactivado', pendientes: 0, msg: '' };
const subs = new Set();
let timer = null, corriendo = false, reintento = null;

const fijar = (e) => { estado = { ...estado, ...e }; subs.forEach(fn => fn(estado)); };
export const Sync = {
  get estado() { return estado; },
  on(fn) { subs.add(fn); fn(estado); return () => subs.delete(fn); },

  async refrescarEstado() {
    const n = await DB.colaCantidad();
    if (!Sheets.configurado()) return fijar({ estado: 'desactivado', pendientes: n, msg: 'Solo en este navegador' });
    fijar({ pendientes: n, estado: n ? 'pendiente' : 'sincronizado', msg: n ? `${n} cambio(s) por subir` : 'Sincronizado' });
  },

  // Se llama tras cada escritura: agrupa varias en un solo envío.
  programar() {
    Sync.refrescarEstado();
    if (!Sheets.configurado()) return;
    clearTimeout(timer);
    timer = setTimeout(() => Sync.subirCola(), 900);
  },

  async subirCola() {
    if (!Sheets.configurado() || corriendo) return;
    corriendo = true;
    try {
      let cola = await DB.colaTodo();
      while (cola.length) {
        fijar({ estado: 'subiendo', pendientes: cola.length, msg: `Subiendo ${cola.length} cambio(s)…` });
        const op = cola[0];
        const usados = [op.key];
        if (op.op === 'upsert') {
          // junta upserts seguidos de la misma tabla (el último valor de cada id gana)
          const porId = new Map(op.rows.map(r => [r.id, r]));
          for (let i = 1; i < cola.length && cola[i].op === 'upsert' && cola[i].table === op.table && porId.size < 400; i++) {
            cola[i].rows.forEach(r => porId.set(r.id, r)); usados.push(cola[i].key);
          }
          await Sheets.subir(op.table, [...porId.values()]);
        } else if (op.op === 'delete') await Sheets.borrarId(op.table, op.id);
        else if (op.op === 'deleteWhere') await Sheets.borrarDonde(op.table, op.column, op.value);
        await DB.colaQuitar(usados);
        cola = cola.filter(o => !usados.includes(o.key));
      }
      fijar({ estado: 'sincronizado', pendientes: 0, msg: 'Sincronizado' });
    } catch (e) {
      const n = await DB.colaCantidad();
      fijar({ estado: navigator.onLine ? 'error' : 'sin-conexion', pendientes: n, msg: e.message });
      clearTimeout(reintento);
      reintento = setTimeout(() => Sync.subirCola(), 30000);
    } finally { corriendo = false; }
  },

  // Une lo que hay en Sheets con lo local. Una fila local que NO está en Sheets y NO está en la cola
  // se considera borrada desde otro equipo.
  async _fusionar(tabla, remotas, locales, filtroLocal = () => true) {
    const cola = await DB.colaTodo();
    const pendientes = new Set();
    for (const o of cola) if (o.table === tabla) { if (o.op === 'upsert') o.rows.forEach(r => pendientes.add(r.id)); else if (o.op === 'delete') pendientes.add(o.id); }
    const remotoPorId = new Map(remotas.map(r => [r.id, r]));
    const localPorId = new Map(locales.map(r => [r.id, r]));
    const poner = [], quitar = [];
    for (const r of remotas) {
      if (pendientes.has(r.id)) continue;
      const l = localPorId.get(r.id);
      if (!l || String(r.updated_at) > String(l.updated_at || '')) poner.push(r);
    }
    for (const l of locales) if (filtroLocal(l) && !remotoPorId.has(l.id) && !pendientes.has(l.id)) quitar.push(l.id);
    await DB.poner(tabla, poner);
    await DB.borrar(tabla, quitar);
    return poner.length + quitar.length;
  },

  async bajarEmpresas() {
    if (!Sheets.configurado()) return 0;
    await Sync.subirCola();
    if (Sync.estado.estado === 'error' || Sync.estado.estado === 'sin-conexion') return 0;
    const remotas = await Sheets.leer('empresas');
    return Sync._fusionar('empresas', remotas, await DB.todos('empresas'));
  },

  async bajarEmpresa(id) {
    if (!Sheets.configurado()) return 0;
    await Sync.subirCola();
    if (Sync.estado.estado === 'error' || Sync.estado.estado === 'sin-conexion') return 0;
    fijar({ estado: 'bajando', msg: 'Buscando cambios…' });
    let cambios = 0;
    for (const t of TABLAS) cambios += await Sync._fusionar(t, await Sheets.leer(t, 'empresa_id', id), await DB.porEmpresa(t, id));
    await Sync.refrescarEstado();
    if (cambios) await Store.recargar();
    return cambios;
  },

  // Primera conexión: sube TODO lo que ya había en este navegador.
  async subirTodo() {
    if (!Sheets.configurado()) throw new Error('Configura primero la conexión.');
    const ops = [];
    for (const t of ['empresas', ...TABLAS]) {
      const rows = await DB.todos(t);
      for (let i = 0; i < rows.length; i += 100) ops.push({ op: 'upsert', table: t, rows: rows.slice(i, i + 100) });
    }
    await DB.encolar(ops);
    await Sync.subirCola();
  },

  async probar() { return Sheets.ping(); }
};

Store.hooks.alEscribir = () => Sync.programar();
window.addEventListener('online', () => Sync.subirCola());
export default Sync;
