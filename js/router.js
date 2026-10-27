import Store from './store.js';
import Sync from './sync.js';
import { pintarBarra, envolver } from './components/shell.js';
import { toast } from './components/ui.js';

const PAGINAS = {
  resumen: () => import('./pages/resumen.js'),
  asientos: () => import('./pages/asientos.js'),
  facturas: () => import('./pages/facturas.js'),
  diario: () => import('./pages/diario.js'),
  mayor: () => import('./pages/mayor.js'),
  comprobacion: () => import('./pages/comprobacion.js'),
  situacion: () => import('./pages/situacion.js'),
  resultados: () => import('./pages/resultados.js'),
  cierre: () => import('./pages/cierre.js'),
  plan: () => import('./pages/plan.js'),
  ajustes: () => import('./pages/ajustes.js')
};

let limpiar = null, ruta = 0, sincronizadas = new Map();

export async function navegar() {
  const mi = ++ruta;
  const app = document.getElementById('app');
  if (limpiar) { try { limpiar(); } catch { /* */ } limpiar = null; }
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/e\/([^/]+)\/?([\w-]*)/);
  window.scrollTo(0, 0);

  try {
    if (m) {
      const [, id, key] = m;
      if (!Store.empresa || Store.empresa.id !== id) {
        if (!(await Store.abrir(id))) { location.hash = '#/'; return; }
      }
      if (mi !== ruta) return;
      const clave = key || 'resumen';
      if (!PAGINAS[clave]) { location.hash = `#/e/${id}/resumen`; return; }
      document.title = `${Store.empresa.nombre} · Sistema Contable`;
      pintarBarra();
      const mod = (await PAGINAS[clave]()).default;
      if (mi !== ruta) return;
      limpiar = await mod.render(app, { envolver: (c) => envolver(clave, c) });
      // Al abrir una empresa (como máximo cada minuto): traer cambios hechos desde otro equipo (o por el conector de IA).
      if (Date.now() - (sincronizadas.get(id) || 0) > 60000) {
        sincronizadas.set(id, Date.now());
        Sync.bajarEmpresa(id).then(n => { if (n) { window.dispatchEvent(new Event('sc-remoto')); toast(`Se actualizaron ${n} registro(s) desde Google Sheets`); } }).catch(e => toast(`Sincronización: ${e.message}`, 'aviso'));
      }
    } else if (hash === '#/conexion') {
      Store.cerrar(); document.title = 'Conexión · Sistema Contable'; pintarBarra();
      limpiar = await (await import('./pages/conexion.js')).default.render(app);
    } else {
      Store.cerrar(); document.title = 'Sistema Contable'; pintarBarra();
      limpiar = await (await import('./pages/empresas.js')).default.render(app);
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="p-6"><div class="bg-white border border-rose-200 rounded-xl p-5 max-w-xl"><p class="font-semibold text-rose-700">No se pudo cargar esta pantalla</p><p class="text-sm text-slate-600 mt-1">${String(e.message || e).replace(/</g, '&lt;')}</p><a href="#/" class="text-sm text-blue-600 mt-3 inline-block">Volver al inicio</a></div></div>`;
  }
}

export function iniciar() {
  window.addEventListener('hashchange', navegar);
  window.addEventListener('sc-remoto', navegar);
  navegar();
}
