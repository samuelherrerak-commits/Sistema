// Base de datos local (IndexedDB): el navegador guarda TODO; Google Sheets es el respaldo/sincronización.
// Así la app abre al instante y funciona sin internet, aunque haya decenas de miles de movimientos.
const NAME = 'sistema-contable';
const VERSION = 1;
const STORES = ['empresas', 'cuentas', 'asientos', 'saldos', 'borradores'];

let dbp = null;
export function abrirDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        const st = db.createObjectStore(s, { keyPath: 'id' });
        if (s !== 'empresas') st.createIndex('empresa_id', 'empresa_id');
      }
      db.createObjectStore('outbox', { autoIncrement: true });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

export async function todos(store) {
  const db = await abrirDB();
  return wrap(db.transaction(store).objectStore(store).getAll());
}
export async function porEmpresa(store, empresaId) {
  const db = await abrirDB();
  return wrap(db.transaction(store).objectStore(store).index('empresa_id').getAll(empresaId));
}
export async function poner(store, rows) {
  const arr = Array.isArray(rows) ? rows : [rows];
  if (!arr.length) return;
  const db = await abrirDB();
  const tx = db.transaction(store, 'readwrite');
  const st = tx.objectStore(store);
  for (const r of arr) st.put(r);
  await done(tx);
}
export async function borrar(store, ids) {
  const arr = Array.isArray(ids) ? ids : [ids];
  if (!arr.length) return;
  const db = await abrirDB();
  const tx = db.transaction(store, 'readwrite');
  for (const id of arr) tx.objectStore(store).delete(id);
  await done(tx);
}
export async function borrarEmpresa(empresaId) {
  const db = await abrirDB();
  for (const s of STORES.filter(s => s !== 'empresas')) {
    const ids = await wrap(db.transaction(s).objectStore(s).index('empresa_id').getAllKeys(empresaId));
    await borrar(s, ids);
  }
  await borrar('empresas', empresaId);
}

// Cola de cambios pendientes de subir a Sheets.
export async function encolar(ops) {
  const arr = Array.isArray(ops) ? ops : [ops];
  const db = await abrirDB();
  const tx = db.transaction('outbox', 'readwrite');
  for (const o of arr) tx.objectStore('outbox').add(o);
  await done(tx);
}
export async function colaTodo() {
  const db = await abrirDB();
  const st = db.transaction('outbox').objectStore('outbox');
  const [keys, vals] = await Promise.all([wrap(st.getAllKeys()), wrap(st.getAll())]);
  return keys.map((k, i) => ({ key: k, ...vals[i] }));
}
export async function colaQuitar(keys) {
  const db = await abrirDB();
  const tx = db.transaction('outbox', 'readwrite');
  for (const k of keys) tx.objectStore('outbox').delete(k);
  await done(tx);
}
export async function colaCantidad() {
  const db = await abrirDB();
  return wrap(db.transaction('outbox').objectStore('outbox').count());
}

export async function metaGet(key, def = null) {
  const db = await abrirDB();
  const r = await wrap(db.transaction('meta').objectStore('meta').get(key));
  return r ? r.value : def;
}
export async function metaSet(key, value) {
  const db = await abrirDB();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await done(tx);
}

export async function contar(store, empresaId) {
  const db = await abrirDB();
  return wrap(db.transaction(store).objectStore(store).index('empresa_id').count(empresaId));
}
