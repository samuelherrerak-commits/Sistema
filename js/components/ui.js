// Piezas de interfaz compartidas. Mismos estilos que el módulo de Contabilidad de CIFCalc.
import { esc, MESES, ensureXlsx } from '../utils.js';
import { icon } from './icons.js';
import Store from '../store.js';

export const btnPrimary = 'bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50';
export const btnSecondary = 'bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 px-4 rounded-lg border border-slate-200 transition';
export const btnDanger = 'bg-white hover:bg-rose-50 text-rose-600 text-sm font-medium py-2 px-4 rounded-lg border border-rose-200 transition';
export const btnIcon = 'p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition';
export const card = 'bg-white border border-slate-200/70 rounded-xl shadow-sm p-4';
export const input = 'w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none';
export const label = 'block text-xs font-medium text-slate-500 mb-1';
export const th = 'p-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide';

export function badge(color, text) {
  return `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-${color}-700 bg-${color}-100">${esc(text)}</span>`;
}

// ── Avisos ───────────────────────────────────────────────
export function toast(msg, tipo = 'ok') {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.className = 'fixed bottom-20 md:bottom-5 right-4 z-[100] space-y-2 no-print'; document.body.appendChild(host); }
  const t = document.createElement('div');
  const col = tipo === 'error' ? 'bg-rose-600' : tipo === 'aviso' ? 'bg-amber-500' : 'bg-slate-900';
  t.className = `${col} text-white text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-sm`;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3000);
}

// ── Modal genérico ───────────────────────────────────────
// abrirModal({ titulo, cuerpo (html), ancho, onMount(el, cerrar) }) → cerrar()
export function abrirModal({ titulo, cuerpo, ancho = 'max-w-lg', onMount, alCerrar }) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-[90] flex items-start justify-center bg-black/40 p-3 sm:p-6 overflow-y-auto no-print';
  wrap.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full ${ancho} my-auto p-5 space-y-4" role="dialog" aria-modal="true">
      <div class="flex justify-between items-center gap-3">
        <h3 class="text-base font-semibold text-slate-900">${esc(titulo)}</h3>
        <button data-cerrar class="${btnIcon}" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div data-cuerpo>${cuerpo}</div>
    </div>`;
  const cerrar = () => { document.removeEventListener('keydown', onKey, true); wrap.remove(); if (alCerrar) alCerrar(); };
  const onKey = (e) => { if (e.key === 'Escape' && wrap === [...document.querySelectorAll('.fixed.z-\\[90\\]')].pop()) { e.stopPropagation(); cerrar(); } };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) cerrar(); });
  wrap.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(wrap);
  if (onMount) onMount(wrap.querySelector('[data-cuerpo]'), cerrar);
  return cerrar;
}

export function confirmar(texto, { si = 'Aceptar', peligro = false, titulo = 'Confirmar' } = {}) {
  return new Promise(resolve => {
    let resuelto = false;
    const fin = (v) => { if (!resuelto) { resuelto = true; resolve(v); } };
    abrirModal({
      titulo, ancho: 'max-w-sm',
      cuerpo: `<p class="text-sm text-slate-600 whitespace-pre-line">${esc(texto)}</p>
        <div class="flex justify-end gap-2 mt-4"><button data-no class="${btnSecondary}">Cancelar</button><button data-si class="${peligro ? 'bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold py-2 px-4 rounded-lg' : btnPrimary}">${esc(si)}</button></div>`,
      onMount: (el, cerrar) => {
        el.querySelector('[data-no]').onclick = () => { fin(false); cerrar(); };
        el.querySelector('[data-si]').onclick = () => { fin(true); cerrar(); };
        el.querySelector('[data-si]').focus();
      },
      alCerrar: () => fin(false)
    });
  });
}

// ── Selector de periodo (mes desde / hasta) compartido por los reportes ───────────────────
const periodo = { clave: '', desde: 1, hasta: 12 };
export function getPeriodo() {
  const clave = `${Store.empresa && Store.empresa.id}|${Store.anio}`;
  if (periodo.clave !== clave) {
    periodo.clave = clave; periodo.desde = 1;
    periodo.hasta = ultimoMesConDatos() || (Store.anio === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  }
  return periodo;
}
export function ultimoMesConDatos() {
  let max = 0;
  for (const a of Store.calc().asientos) { const m = Number(a.fecha.slice(5, 7)); if (m > max) max = m; }
  return max;
}
const opcionesMes = (sel) => MESES.map((m, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${m}</option>`).join('');

// opts.soloHasta: solo "Al mes" (estado de situación). opts.extra: html adicional.
export function barraPeriodo(onChange, opts = {}) {
  const p = getPeriodo();
  const html = `
    <div class="flex flex-wrap items-end gap-3 no-print">
      ${opts.soloHasta ? '' : `<div><label class="${label}">Desde</label><select data-per="desde" class="${input}" style="width:9.5rem">${opcionesMes(p.desde)}</select></div>`}
      <div><label class="${label}">${opts.soloHasta ? 'Al mes de' : 'Hasta'}</label><select data-per="hasta" class="${input}" style="width:9.5rem">${opcionesMes(p.hasta)}</select></div>
      ${opts.extra || ''}
    </div>`;
  const bind = (root) => {
    root.querySelectorAll('[data-per]').forEach(sel => sel.addEventListener('change', () => {
      p[sel.dataset.per] = Number(sel.value);
      if (!opts.soloHasta && p.desde > p.hasta) { if (sel.dataset.per === 'desde') p.hasta = p.desde; else p.desde = p.hasta; root.querySelectorAll('[data-per]').forEach(s => { s.value = p[s.dataset.per]; }); }
      onChange(p);
    }));
  };
  return { html, bind };
}

export function periodoTexto(p, soloHasta = false) {
  const fin = new Date(Store.anio, p.hasta, 0).getDate();
  return soloHasta ? `Al ${fin} de ${MESES[p.hasta - 1]} de ${Store.anio}` : `Del 1 de ${MESES[p.desde - 1]} al ${fin} de ${MESES[p.hasta - 1]} de ${Store.anio}`;
}

// Encabezado de reporte (se ve en pantalla y en la impresión).
export function encabezadoReporte(titulo, subtitulo) {
  const e = Store.empresa;
  return `
    <div class="text-center mb-4">
      <div class="text-sm font-bold text-slate-800">${esc(e.nombre)}</div>
      ${e.rif ? `<div class="text-xs text-slate-500">RIF: ${esc(e.rif)}</div>` : ''}
      <h2 class="text-base font-semibold uppercase tracking-wide text-slate-900 mt-1">${esc(titulo)}</h2>
      <div class="text-xs text-slate-500">${esc(subtitulo)}</div>
    </div>`;
}

export function botonesReporte() {
  return `<div class="flex gap-2 no-print">
    <button data-accion="imprimir" class="${btnSecondary} flex items-center gap-1.5">${icon('printer', 'w-4 h-4')}Imprimir</button>
    <button data-accion="excel" class="${btnSecondary} flex items-center gap-1.5">${icon('download', 'w-4 h-4')}Excel</button>
  </div>`;
}

// Exporta una o varias hojas (arreglos de filas) a .xlsx con SheetJS.
export async function exportarExcel(nombreArchivo, hojas) {
  try {
    const X = await ensureXlsx();
    const wb = X.utils.book_new();
    for (const h of hojas) {
      const ws = X.utils.aoa_to_sheet(h.filas);
      if (h.anchos) ws['!cols'] = h.anchos.map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
    }
    X.writeFile(wb, nombreArchivo);
  } catch (e) { toast(e.message, 'error'); }
}

// ── Selector de cuenta con búsqueda (código o nombre) ────────────────────────────────────
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Solo cuentas de movimiento. onPick(cuenta) al elegir; el input queda con "codigo".
export function adjuntarSelectorCuenta(inp, cuentas, onPick) {
  const lista = document.createElement('div');
  lista.className = 'hidden absolute z-[95] mt-1 w-[26rem] max-w-[90vw] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg text-xs';
  inp.parentElement.style.position = 'relative';
  inp.parentElement.appendChild(lista);
  let items = [], idx = 0;
  const pintar = () => {
    lista.innerHTML = items.map((c, i) => `<div data-i="${i}" class="px-2.5 py-1.5 cursor-pointer flex gap-2 ${i === idx ? 'bg-blue-50' : 'hover:bg-slate-50'}"><span class="font-mono text-slate-500 shrink-0">${esc(c.codigo)}</span><span class="text-slate-800 truncate">${esc(c.nombre)}</span></div>`).join('');
    lista.classList.toggle('hidden', !items.length);
  };
  const buscar = () => {
    const q = norm(inp.value.trim());
    if (!q) { items = []; return pintar(); }
    const porCodigo = cuentas.filter(c => c.codigo.startsWith(q));
    const porNombre = cuentas.filter(c => !c.codigo.startsWith(q) && (norm(c.nombre).includes(q) || c.codigo.includes(q)));
    items = [...porCodigo, ...porNombre].slice(0, 30); idx = 0; pintar();
  };
  const elegir = (c) => { inp.value = c.codigo; items = []; pintar(); onPick(c); };
  inp.addEventListener('input', buscar);
  inp.addEventListener('focus', () => { inp.select(); buscar(); });
  inp.addEventListener('blur', () => setTimeout(() => { items = []; pintar(); }, 150));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); pintar(); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); idx = Math.max(idx - 1, 0); pintar(); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      const exacta = cuentas.find(c => c.codigo === inp.value.trim());
      if (items.length && !(exacta && e.key === 'Tab')) { if (e.key === 'Enter') e.preventDefault(); elegir(exacta && items.some(i => i === exacta) ? exacta : items[idx]); }
    } else if (e.key === 'Escape' && items.length) { e.stopPropagation(); items = []; pintar(); }
  });
  lista.addEventListener('mousedown', (e) => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); elegir(items[Number(d.dataset.i)]); } });
}

export function chipCuadre(ok, textoOk, textoMal) {
  return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}">${ok ? '✓' : '⚠'} ${esc(ok ? textoOk : textoMal)}</span>`;
}

// Enlaza los botones Imprimir / Excel de botonesReporte(). `todo(fn)` debe repintar sin paginar para imprimir completo.
export function enlazarAcciones(root, { excel, imprimirTodo }) {
  const imp = root.querySelector('[data-accion=imprimir]');
  if (imp) imp.onclick = async () => {
    if (imprimirTodo) await imprimirTodo(true);
    setTimeout(() => { window.print(); if (imprimirTodo) setTimeout(() => imprimirTodo(false), 300); }, 50);
  };
  const ex = root.querySelector('[data-accion=excel]');
  if (ex) ex.onclick = () => excel();
}

// Filas de un estado financiero (árbol de cuentas con 3 columnas de importes, como el Excel original).
import { fmtMoney } from '../utils.js';
export function filasEstado(secciones, { resaltarFinal = false } = {}) {
  const celdas = (f) => [1, 2, 3].map(c => `<td class="py-1 pl-3 text-right font-mono tabular w-32 ${f.col === c ? '' : 'text-transparent select-none'}">${f.col === c ? fmtMoney(f.monto) : '·'}</td>`).join('');
  return secciones.map(s => {
    const filas = s.filas.map(f => {
      const pad = `padding-left:${Math.max(0, f.nivel - 1) * 14}px`;
      if (f.tipo === 'grupo') return `<tr><td colspan="4" class="pt-2 pb-0.5 ${f.nivel <= 2 ? 'font-semibold text-blue-700' : 'font-semibold text-slate-800'}" style="${pad}">${esc(f.nombre)}</td></tr>`;
      if (f.tipo === 'cuenta') return `<tr class="text-slate-700"><td class="py-0.5 pr-2" style="${pad}"><span class="font-mono text-[10px] text-slate-400 mr-1.5">${esc(f.codigo)}</span>${esc(f.nombre)}</td>${celdas(f)}</tr>`;
      return `<tr class="font-semibold text-slate-800"><td class="py-1 pr-2 border-t border-slate-200" style="${pad}">${esc(f.nombre)}</td>${[1, 2, 3].map(c => `<td class="py-1 pl-3 text-right font-mono tabular ${f.col === c ? 'border-t border-slate-300' : ''}">${f.col === c ? fmtMoney(f.monto) : ''}</td>`).join('')}</tr>`;
    }).join('');
    return `<tr><td colspan="4" class="pt-5 pb-1 text-sm font-bold tracking-wide text-slate-900 border-b-2 border-slate-800">${esc(s.titulo)}</td></tr>${filas}
      <tr class="font-bold text-slate-900"><td class="py-1.5">${esc(s.etiquetaTotal)}</td><td></td><td></td><td class="py-1.5 pl-3 text-right font-mono tabular ${s.resaltar && resaltarFinal ? 'bg-amber-100' : ''} border-t border-b-4 border-double border-slate-800">${fmtMoney(s.total)}</td></tr>`;
  }).join('');
}

// Para Excel: aplana un estado a filas [concepto, col1, col2, col3].
export function aoaEstado(secciones) {
  const out = [];
  for (const s of secciones) {
    out.push([s.titulo, '', '', '']);
    for (const f of s.filas) {
      const row = [`${'  '.repeat(Math.max(0, f.nivel - 1))}${f.tipo === 'cuenta' ? f.codigo + ' ' : ''}${f.nombre}`, '', '', ''];
      if (f.tipo !== 'grupo') row[f.col] = f.monto;
      out.push(row);
    }
    out.push([s.etiquetaTotal, '', '', s.total], ['', '', '', '']);
  }
  return out;
}
