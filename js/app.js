import { abrirDB } from './db.js';
import Sync from './sync.js';
import { iniciar } from './router.js';

(async () => {
  try {
    await abrirDB();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="p-6 max-w-xl"><p class="font-semibold text-rose-700">Este navegador no permite guardar datos locales.</p><p class="text-sm text-slate-600 mt-1">Abre la app en una ventana normal (no privada) de Chrome, Edge o Firefox. (${e.message})</p></div>`;
    return;
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // evita que el navegador borre los datos por falta de espacio
  await Sync.refrescarEstado();
  Sync.subirCola();
  iniciar();
})();
