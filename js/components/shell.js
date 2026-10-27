// Armazón de la app: barra superior + menú lateral azul oscuro (igual que el módulo de Contabilidad de CIFCalc).
import Store from '../store.js';
import Sync from '../sync.js';
import { icon } from './icons.js';
import { esc } from '../utils.js';

export const SECCIONES = [
  { title: '', items: [{ key: 'resumen', label: 'Resumen', icon: 'home' }] },
  { title: 'Registro', items: [
    { key: 'asientos', label: 'Asientos', icon: 'journal' },
    { key: 'facturas', label: 'Facturas con IA', short: 'Facturas', icon: 'sparkles' }
  ] },
  { title: 'Libros', items: [
    { key: 'diario', label: 'Libro diario', icon: 'book' },
    { key: 'mayor', label: 'Libro mayor', icon: 'table' },
    { key: 'comprobacion', label: 'Balance de comprobación', icon: 'calculator' }
  ] },
  { title: 'Estados financieros', items: [
    { key: 'situacion', label: 'Situación financiera', icon: 'landmark' },
    { key: 'resultados', label: 'Estado de resultados', icon: 'chart' },
    { key: 'cierre', label: 'Asiento de cierre', icon: 'lock' }
  ] },
  { title: 'Configuración', items: [
    { key: 'plan', label: 'Plan de cuentas', icon: 'list' },
    { key: 'ajustes', label: 'Empresa y respaldo', short: 'Ajustes', icon: 'settings' }
  ] }
];
const TODOS = SECCIONES.flatMap(s => s.items);
const MOVIL = ['resumen', 'asientos', 'diario', 'situacion'];
export const href = (key) => `#/e/${Store.empresa.id}/${key}`;

const COLOR_SYNC = { sincronizado: 'bg-emerald-500', subiendo: 'bg-blue-500 animate-pulse', bajando: 'bg-blue-500 animate-pulse', pendiente: 'bg-amber-500', error: 'bg-rose-500', 'sin-conexion': 'bg-amber-500', desactivado: 'bg-slate-300' };
function badgeSync(e) {
  const txt = e.estado === 'desactivado' ? 'Solo en este equipo' : e.msg;
  return `<a href="#/conexion" title="${esc(e.msg || '')}" class="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-800">
    <span class="w-2 h-2 rounded-full ${COLOR_SYNC[e.estado] || 'bg-slate-300'}"></span><span class="hidden sm:inline max-w-[14rem] truncate">${esc(txt)}</span></a>`;
}

let desuscribir = null;
export function pintarBarra() {
  const emp = Store.empresa;
  const anios = emp ? Store.aniosConDatos() : [];
  document.getElementById('navbar').innerHTML = `
    <nav class="bg-white border-b border-slate-200 no-print">
      <div class="px-3 md:px-6 h-12 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <a href="#/" class="flex items-center gap-2 font-semibold text-[15px] text-slate-900 shrink-0">
            <span class="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">${icon('book', 'w-4 h-4')}</span>
            <span class="hidden sm:inline">Sistema Contable</span>
          </a>
          ${emp ? `<span class="text-slate-300 hidden sm:inline">/</span>
          <a href="#/" title="Cambiar de empresa" class="flex items-center gap-1.5 text-sm text-slate-700 hover:text-blue-600 min-w-0">
            ${icon('building', 'w-4 h-4 text-slate-400')}<span class="truncate max-w-[10rem] sm:max-w-xs font-medium">${esc(emp.nombre)}</span>${icon('swap', 'w-3.5 h-3.5 text-slate-300')}</a>` : ''}
        </div>
        <div class="flex items-center gap-3 shrink-0">
          ${emp ? `<label class="flex items-center gap-1.5 text-xs text-slate-500">Ejercicio
            <select id="sel-anio" class="border border-slate-200 rounded-lg text-sm py-1 px-2 bg-white font-medium text-slate-800">${anios.map(a => `<option ${a === Store.anio ? 'selected' : ''}>${a}</option>`).join('')}</select></label>` : ''}
          <span id="sync-badge">${badgeSync(Sync.estado)}</span>
        </div>
      </div>
    </nav>`;
  const sel = document.getElementById('sel-anio');
  if (sel) sel.addEventListener('change', async () => { await Store.cambiarAnio(Number(sel.value)); window.dispatchEvent(new Event('hashchange')); });
  if (desuscribir) desuscribir();
  desuscribir = Sync.on((e) => { const b = document.getElementById('sync-badge'); if (b) b.innerHTML = badgeSync(e); });
}

export function envolver(activa, cuerpo) {
  const link = (it) => `
    <a href="${href(it.key)}" title="${it.label}" class="relative flex items-center justify-center xl:justify-start gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition ${it.key === activa ? 'bg-blue-500/20 text-white font-medium' : 'text-slate-300/80 hover:bg-white/5 hover:text-white'}">
      ${it.key === activa ? '<span class="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-blue-400"></span>' : ''}
      <span class="${it.key === activa ? 'text-blue-300' : 'text-slate-400'}">${icon(it.icon)}</span>
      <span class="truncate hidden xl:inline">${it.label}</span>
      ${it.key === 'facturas' && Store.borradores.some(b => b.estado === 'pendiente') ? `<span class="hidden xl:inline ml-auto text-[10px] bg-amber-400 text-slate-900 font-bold rounded-full px-1.5">${Store.borradores.filter(b => b.estado === 'pendiente').length}</span>` : ''}
    </a>`;
  const lateral = `
    <aside class="hidden md:flex flex-col shrink-0 w-[3.75rem] xl:w-60 sticky top-12 h-[calc(100vh-3rem)] bg-[#0f1d3a] text-slate-300">
      <div class="hidden xl:flex items-center gap-2.5 px-4 pt-4 pb-3 shrink-0">
        <span class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center">${icon('building', 'w-4 h-4')}</span>
        <div class="min-w-0"><p class="text-sm font-semibold text-white leading-tight truncate">${esc(Store.empresa.nombre)}</p><p class="text-[11px] text-slate-400 truncate">${esc(Store.empresa.rif || 'Sin RIF')} · ${Store.anio}</p></div>
      </div>
      <nav class="flex-1 min-h-0 overflow-y-auto dark-scroll px-2 xl:px-3 pt-3 xl:pt-1 pb-2 space-y-4">
        ${SECCIONES.map((s, i) => `<div>
          ${s.title ? `<p class="hidden xl:block px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-200/50">${s.title}</p>` : ''}
          ${i ? '<div class="xl:hidden border-t border-white/10 mx-1 mb-2"></div>' : ''}
          <div class="space-y-0.5">${s.items.map(link).join('')}</div></div>`).join('')}
      </nav>
      <div class="shrink-0 border-t border-white/10 px-2 xl:px-3 py-3">
        <a href="#/" class="flex items-center justify-center xl:justify-start gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-slate-400 hover:text-white hover:bg-white/5" title="Cambiar de empresa">${icon('swap')}<span class="hidden xl:inline">Cambiar de empresa</span></a>
      </div>
    </aside>`;
  const movil = `
    <nav class="mobile-bar md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex no-print">
      ${MOVIL.map(k => TODOS.find(i => i.key === k)).map(it => `<a href="${href(it.key)}" class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${it.key === activa ? 'text-blue-600' : 'text-slate-400'}">${icon(it.icon, 'w-5 h-5')}${it.short || it.label}</a>`).join('')}
      <button data-mas class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${MOVIL.includes(activa) ? 'text-slate-400' : 'text-blue-600'}">${icon('menu', 'w-5 h-5')}Más</button>
    </nav>
    <div id="mas-menu" class="hidden md:hidden fixed inset-0 z-50 bg-black/30 no-print" data-mas-cerrar>
      <div class="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto space-y-4">
        <div class="flex justify-between items-center"><p class="font-semibold text-slate-900 truncate">${esc(Store.empresa.nombre)}</p><button data-mas-cerrar class="text-slate-400 text-xl leading-none">✕</button></div>
        ${SECCIONES.map(s => `<div>${s.title ? `<p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">${s.title}</p>` : ''}
          <div class="grid grid-cols-3 gap-1.5">${s.items.map(it => `<a href="${href(it.key)}" class="flex flex-col items-center gap-1 p-2.5 rounded-xl text-center text-[10px] font-medium ${it.key === activa ? 'bg-slate-100 text-blue-600' : 'text-slate-600 border border-slate-100'}">${icon(it.icon, 'w-5 h-5')}${it.label}</a>`).join('')}</div></div>`).join('')}
        <a href="#/" class="block text-center text-xs text-slate-500 py-2 border border-slate-200 rounded-xl">Cambiar de empresa</a>
      </div>
    </div>`;
  return `<div class="flex items-start">${lateral}<div class="flex-1 min-w-0 p-3 sm:p-4 lg:p-5 pb-24 md:pb-5 space-y-4">${cuerpo}</div></div>${movil}`;
}

// Un solo juego de listeners para el menú "Más" del teléfono.
document.addEventListener('click', (e) => {
  const m = document.getElementById('mas-menu');
  if (!m) return;
  if (e.target.closest('[data-mas]')) { m.classList.remove('hidden'); return; }
  if (e.target.closest('button[data-mas-cerrar]') || e.target === m || e.target.closest('#mas-menu a')) m.classList.add('hidden');
});
