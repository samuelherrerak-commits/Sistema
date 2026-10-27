import Store from '../store.js';
import Sync from '../sync.js';
import * as DB from '../db.js';
import { contar } from '../db.js';
import { importarExcel } from '../xlsx-io.js';
import { diagnostico, construirPlan } from '../engine.js';
import { esc, ensureXlsx, uid } from '../utils.js';
import { icon } from '../components/icons.js';
import { card, input, label, btnPrimary, btnSecondary, abrirModal, toast } from '../components/ui.js';

const Empresas = {
  async render(app) {
    let lista = await Store.empresas();
    let q = '';
    const conteos = {};
    await Promise.all(lista.map(async e => { conteos[e.id] = await contar('asientos', e.id); }));

    const pintar = () => {
      const f = lista.filter(e => !q || `${e.nombre} ${e.rif}`.toLowerCase().includes(q.toLowerCase()));
      document.getElementById('emp-grid').innerHTML = f.length ? f.map(e => `
        <a href="#/e/${e.id}/resumen" class="${card} hover:border-blue-300 hover:shadow transition flex flex-col gap-2 group">
          <div class="flex items-start gap-3">
            <span class="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">${icon('building', 'w-5 h-5')}</span>
            <div class="min-w-0"><p class="font-semibold text-slate-900 truncate group-hover:text-blue-700">${esc(e.nombre)}</p><p class="text-xs text-slate-500">${esc(e.rif || 'Sin RIF')}</p></div>
          </div>
          <div class="flex justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-2"><span>Ejercicio ${e.anio}</span><span>${conteos[e.id] || 0} asiento${conteos[e.id] === 1 ? '' : 's'}</span></div>
        </a>`).join('') : `<div class="${card} col-span-full text-center py-10 text-slate-400">${lista.length ? 'Ninguna empresa coincide con la búsqueda.' : 'Aún no hay empresas. Crea la primera o importa un archivo del sistema anterior en Excel.'}</div>`;
    };

    app.innerHTML = `
      <div class="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div><h1 class="text-xl font-semibold text-slate-900">Empresas</h1><p class="text-xs text-slate-500">Elige con cuál empresa vas a trabajar.</p></div>
          <div class="flex flex-wrap gap-2">
            <button id="emp-nueva" class="${btnPrimary} flex items-center gap-1.5">${icon('plus', 'w-4 h-4')}Nueva empresa</button>
            <button id="emp-excel" class="${btnSecondary} flex items-center gap-1.5">${icon('upload', 'w-4 h-4')}Importar del Excel anterior</button>
            <button id="emp-json" class="${btnSecondary}">Restaurar respaldo</button>
            <a href="#/conexion" class="${btnSecondary} flex items-center gap-1.5">${icon('cloud', 'w-4 h-4')}Conexión</a>
          </div>
        </div>
        <input id="emp-q" class="${input}" style="max-width:22rem" placeholder="Buscar empresa o RIF…">
        <div id="emp-grid" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"></div>
        <input id="file-excel" type="file" accept=".xlsm,.xlsx,.xls" class="hidden"><input id="file-json" type="file" accept=".json" class="hidden">
      </div>`;
    pintar();
    document.getElementById('emp-q').addEventListener('input', (e) => { q = e.target.value; pintar(); });

    document.getElementById('emp-nueva').onclick = () => abrirModal({
      titulo: 'Nueva empresa',
      cuerpo: `<form id="f-emp" class="space-y-3">
        <div><label class="${label}">Nombre de la empresa *</label><input name="nombre" required class="${input}" autofocus></div>
        <div class="grid grid-cols-2 gap-3"><div><label class="${label}">RIF</label><input name="rif" class="${input}" placeholder="J-12345678-9"></div>
        <div><label class="${label}">Ejercicio (año)</label><input name="anio" type="number" min="1990" max="2100" value="${new Date().getFullYear()}" class="${input}"></div></div>
        <label class="flex items-center gap-2 text-sm text-slate-700"><input name="plan" type="checkbox" checked> Cargar el plan de cuentas base (302 cuentas del sistema anterior)</label>
        <div class="flex justify-end gap-2 pt-1"><button type="submit" class="${btnPrimary}">Crear y abrir</button></div></form>`,
      onMount: (el, cerrar) => el.querySelector('#f-emp').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const e = await Store.crearEmpresa({ nombre: f.get('nombre'), rif: f.get('rif'), anio: f.get('anio'), planBase: !!f.get('plan') });
        cerrar();
        location.hash = `#/e/${e.id}/resumen`;
      })
    });

    // Importación del Excel anterior
    const fx = document.getElementById('file-excel');
    document.getElementById('emp-excel').onclick = () => fx.click();
    fx.onchange = async () => {
      const file = fx.files[0]; fx.value = '';
      if (!file) return;
      toast('Leyendo el archivo…');
      try {
        const XLSX = await ensureXlsx();
        const r = importarExcel(XLSX, await file.arrayBuffer());
        const plan = construirPlan(r.cuentas, r.empresa.clases);
        const diag = diagnostico(plan, r.asientos, r.saldos);
        abrirModal({
          titulo: 'Importar del Excel anterior', ancho: 'max-w-xl',
          cuerpo: `<div class="space-y-3 text-sm">
            <div class="grid grid-cols-2 gap-3"><div><label class="${label}">Nombre</label><input id="im-nombre" class="${input}" value="${esc(r.empresa.nombre)}"></div><div><label class="${label}">RIF</label><input id="im-rif" class="${input}" value="${esc(r.empresa.rif)}"></div></div>
            <div class="grid grid-cols-3 gap-2 text-center">
              ${[['Cuentas', r.cuentas.length], ['Asientos', r.asientos.length], ['Líneas', r.asientos.reduce((s, a) => s + a.lineas.length, 0)]].map(([t, n]) => `<div class="bg-slate-50 rounded-lg p-2"><div class="text-lg font-semibold text-slate-900">${n.toLocaleString('en-US')}</div><div class="text-[10px] uppercase text-slate-400">${t}</div></div>`).join('')}</div>
            <p class="text-xs text-slate-500">Ejercicio detectado: <b>${r.empresa.anio}</b> · Saldos iniciales: <b>${Object.keys(r.saldos).length}</b></p>
            ${[...r.avisos.map(t => ({ nivel: 'aviso', texto: t })), ...diag].map(d => `<p class="text-xs ${d.nivel === 'error' ? 'text-rose-700 bg-rose-50' : 'text-amber-800 bg-amber-50'} rounded-lg px-3 py-2">${d.nivel === 'error' ? '⚠' : 'ℹ'} ${esc(d.texto)}</p>`).join('')}
            <div class="flex justify-end gap-2"><button id="im-ok" class="${btnPrimary}">Importar como empresa nueva</button></div></div>`,
          onMount: (el, cerrar) => el.querySelector('#im-ok').onclick = async () => {
            r.empresa.nombre = el.querySelector('#im-nombre').value.trim() || r.empresa.nombre;
            r.empresa.rif = el.querySelector('#im-rif').value.trim();
            const e = await Store.crearEmpresaImportada(r);
            cerrar(); toast('Empresa importada'); location.hash = `#/e/${e.id}/resumen`;
          }
        });
      } catch (e) { toast(e.message, 'error'); }
    };

    const fj = document.getElementById('file-json');
    document.getElementById('emp-json').onclick = () => fj.click();
    fj.onchange = async () => {
      const file = fj.files[0]; fj.value = '';
      if (!file) return;
      try { const e = await Store.importarJSON(JSON.parse(await file.text())); toast('Respaldo restaurado como empresa nueva'); location.hash = `#/e/${e.id}/resumen`; } catch (e) { toast(e.message, 'error'); }
    };

    // Traer empresas creadas desde otro equipo
    Sync.bajarEmpresas().then(async n => { if (n) { lista = await Store.empresas(); await Promise.all(lista.map(async e => { conteos[e.id] = await contar('asientos', e.id); })); pintar(); } }).catch(() => {});
    return () => {};
  }
};
export default Empresas;
