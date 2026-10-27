import Store from '../store.js';
import { libroDiario } from '../engine.js';
import { fmtNum, fmtFecha, esc } from '../utils.js';
import { card, th, barraPeriodo, botonesReporte, encabezadoReporte, periodoTexto, enlazarAcciones, exportarExcel, getPeriodo, btnIcon } from '../components/ui.js';

const POR_PAG = 60;

const Diario = {
  async render(app, { envolver }) {
    const st = { pag: 1, todo: false, cierre: false };
    const calc = () => { const p = getPeriodo(); const { plan } = Store.calc(); return libroDiario(Store.calc().asientos, plan, p.desde, p.hasta, { incluirCierre: st.cierre }); };
    const pintar = () => {
      const p = getPeriodo(), r = calc();
      const pag = Math.max(1, Math.ceil(r.asientos.length / POR_PAG));
      if (st.pag > pag) st.pag = pag;
      const vis = st.todo ? r.asientos : r.asientos.slice((st.pag - 1) * POR_PAG, st.pag * POR_PAG);
      document.getElementById('ld-doc').innerHTML = `
        ${encabezadoReporte('Libro diario', periodoTexto(p))}
        <div class="overflow-x-auto"><table class="w-full text-xs">
          <thead><tr class="text-left border-b border-slate-200"><th class="${th}">Fecha</th><th class="${th}">Nº</th><th class="${th}">Cuenta</th><th class="${th}">Nombre</th><th class="${th}">Descripción</th><th class="${th} text-right">Debe</th><th class="${th} text-right">Haber</th></tr></thead>
          <tbody>${vis.length ? vis.map(a => a.lineas.map((l, i) => `<tr class="${i === 0 ? 'border-t border-slate-200' : ''}">
            <td class="px-2 py-1 text-slate-600 whitespace-nowrap">${i === 0 ? fmtFecha(a.fecha) : ''}</td><td class="px-2 py-1 font-semibold text-slate-800">${i === 0 ? a.numero : ''}</td>
            <td class="px-2 py-1 font-mono text-slate-500">${esc(l.cuenta)}</td><td class="px-2 py-1 text-slate-800 ${l.haber ? 'pl-6' : ''}">${esc(l.nombre)}</td><td class="px-2 py-1 text-slate-500">${esc(l.descripcion || (i === 0 ? a.observacion : ''))}</td>
            <td class="px-2 py-1 text-right font-mono tabular">${l.debe ? fmtNum(l.debe) : ''}</td><td class="px-2 py-1 text-right font-mono tabular">${l.haber ? fmtNum(l.haber) : ''}</td></tr>`).join('')).join('')
            : `<tr><td colspan="7" class="p-6 text-center text-slate-400">Sin asientos en el periodo.</td></tr>`}</tbody>
          <tfoot><tr class="font-bold border-t-2 border-slate-800"><td class="p-2" colspan="5">TOTAL GENERAL (${r.asientos.length} asientos)</td><td class="p-2 text-right font-mono tabular">${fmtNum(r.totales.debe)}</td><td class="p-2 text-right font-mono tabular">${fmtNum(r.totales.haber)}</td></tr></tfoot></table></div>
        ${!st.todo && pag > 1 ? `<div class="flex items-center justify-center gap-3 text-xs text-slate-500 mt-3 no-print"><button data-p="-1" class="${btnIcon}" ${st.pag === 1 ? 'disabled' : ''}>←</button>Página ${st.pag} de ${pag}<button data-p="1" class="${btnIcon}" ${st.pag === pag ? 'disabled' : ''}>→</button></div>` : ''}`;
    };
    const bp = barraPeriodo(() => { st.pag = 1; pintar(); }, { extra: `<label class="flex items-center gap-2 text-xs text-slate-600 pb-2.5"><input id="ld-cierre" type="checkbox"> Incluir asiento de cierre</label>` });
    app.innerHTML = envolver(`
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h1 class="text-xl font-semibold text-slate-900">Libro diario</h1><p class="text-xs text-slate-500">Todos los asientos del periodo en orden cronológico.</p></div>${botonesReporte()}</div>
      <div class="${card}">${bp.html}</div><div class="${card} card-print" id="ld-doc"></div>`);
    bp.bind(app); pintar();
    document.getElementById('ld-cierre').onchange = (e) => { st.cierre = e.target.checked; st.pag = 1; pintar(); };
    app.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { st.pag += Number(b.dataset.p); pintar(); } });
    enlazarAcciones(app, {
      imprimirTodo: async (v) => { st.todo = v; pintar(); },
      excel: () => {
        const p = getPeriodo(), r = calc(); const filas = [[Store.empresa.nombre], ['Libro diario'], [periodoTexto(p)], [], ['Fecha', 'Nº', 'Cuenta', 'Nombre', 'Descripción', 'Debe', 'Haber']];
        for (const a of r.asientos) a.lineas.forEach((l, i) => filas.push([i === 0 ? fmtFecha(a.fecha) : '', i === 0 ? a.numero : '', l.cuenta, l.nombre, l.descripcion || (i === 0 ? a.observacion : ''), l.debe || '', l.haber || '']));
        filas.push(['', '', '', '', 'TOTAL GENERAL', r.totales.debe, r.totales.haber]);
        exportarExcel(`Libro diario ${Store.empresa.nombre} ${Store.anio}.xlsx`, [{ nombre: 'Libro diario', anchos: [12, 7, 12, 40, 40, 14, 14], filas }]);
      }
    });
    return () => {};
  }
};
export default Diario;
