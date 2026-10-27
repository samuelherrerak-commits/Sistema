import Store from '../store.js';
import { libroMayor } from '../engine.js';
import { fmtNum, fmtFecha, esc } from '../utils.js';
import { card, th, input, label, barraPeriodo, botonesReporte, encabezadoReporte, periodoTexto, enlazarAcciones, exportarExcel, getPeriodo, btnIcon, adjuntarSelectorCuenta } from '../components/ui.js';

const POR_PAG = 12;

const Mayor = {
  async render(app, { envolver }) {
    const st = { pag: 1, todo: false, cuenta: '', cierre: false };
    const calc = () => { const p = getPeriodo(); const { acc } = Store.calc(); return libroMayor(acc, Store.calc().asientos, p.desde, p.hasta, { cuenta: st.cuenta, incluirCierre: st.cierre }); };
    const pintar = () => {
      const p = getPeriodo(), r = calc();
      const pag = Math.max(1, Math.ceil(r.length / POR_PAG));
      if (st.pag > pag) st.pag = pag;
      const vis = st.todo ? r : r.slice((st.pag - 1) * POR_PAG, st.pag * POR_PAG);
      document.getElementById('lm-doc').innerHTML = `
        ${encabezadoReporte('Libro mayor', periodoTexto(p))}
        ${vis.length ? vis.map(c => `
          <div class="mb-5 break-inside-avoid">
            <div class="flex items-baseline gap-2 border-b-2 border-slate-800 pb-0.5"><span class="font-mono text-xs text-slate-500">${esc(c.codigo)}</span><span class="font-semibold text-sm text-slate-900">${esc(c.nombre)}</span><span class="ml-auto text-[10px] uppercase text-slate-400">Saldo ${c.tipo === 'D' ? 'deudor' : 'acreedor'}</span></div>
            <table class="w-full text-xs"><thead><tr class="text-left"><th class="${th} w-24">Fecha</th><th class="${th} w-12">Nº</th><th class="${th}">Descripción</th><th class="${th} text-right w-28">Debe</th><th class="${th} text-right w-28">Haber</th><th class="${th} text-right w-32">Saldo</th></tr></thead><tbody>
              <tr class="text-slate-500 italic"><td class="px-2 py-1" colspan="5">Saldo anterior</td><td class="px-2 py-1 text-right font-mono tabular">${fmtNum(c.saldoAnterior)}</td></tr>
              ${c.movs.map(m => `<tr class="border-t border-slate-100"><td class="px-2 py-1 text-slate-600">${fmtFecha(m.fecha)}</td><td class="px-2 py-1">${m.numero}</td><td class="px-2 py-1 text-slate-700">${esc(m.descripcion)}</td><td class="px-2 py-1 text-right font-mono tabular">${m.debe ? fmtNum(m.debe) : ''}</td><td class="px-2 py-1 text-right font-mono tabular">${m.haber ? fmtNum(m.haber) : ''}</td><td class="px-2 py-1 text-right font-mono tabular">${fmtNum(m.saldo)}</td></tr>`).join('')}
              <tr class="font-bold border-t border-slate-400"><td class="px-2 py-1" colspan="3">TOTAL</td><td class="px-2 py-1 text-right font-mono tabular">${fmtNum(c.debe)}</td><td class="px-2 py-1 text-right font-mono tabular">${fmtNum(c.haber)}</td><td class="px-2 py-1 text-right font-mono tabular">${fmtNum(c.saldoFinal)}</td></tr>
            </tbody></table></div>`).join('') : `<p class="p-6 text-center text-sm text-slate-400">Sin movimientos en el periodo.</p>`}
        ${!st.todo && pag > 1 ? `<div class="flex items-center justify-center gap-3 text-xs text-slate-500 no-print"><button data-p="-1" class="${btnIcon}" ${st.pag === 1 ? 'disabled' : ''}>←</button>Cuentas ${(st.pag - 1) * POR_PAG + 1}–${Math.min(st.pag * POR_PAG, r.length)} de ${r.length}<button data-p="1" class="${btnIcon}" ${st.pag === pag ? 'disabled' : ''}>→</button></div>` : ''}`;
    };
    const { plan } = Store.calc();
    const bp = barraPeriodo(() => { st.pag = 1; pintar(); }, { extra: `
      <div class="relative"><label class="${label}">Una sola cuenta</label><input id="lm-cuenta" class="${input} font-mono" style="width:16rem" placeholder="Todas las cuentas"></div>
      <label class="flex items-center gap-2 text-xs text-slate-600 pb-2.5"><input id="lm-cierre" type="checkbox"> Incluir asiento de cierre</label>` });
    app.innerHTML = envolver(`
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h1 class="text-xl font-semibold text-slate-900">Libro mayor</h1><p class="text-xs text-slate-500">Movimientos y saldo corrido de cada cuenta.</p></div>${botonesReporte()}</div>
      <div class="${card}">${bp.html}</div><div class="${card} card-print" id="lm-doc"></div>`);
    bp.bind(app);
    adjuntarSelectorCuenta(document.getElementById('lm-cuenta'), plan.lista.filter(c => c.hoja), (c) => { st.cuenta = c.codigo; st.pag = 1; pintar(); });
    document.getElementById('lm-cuenta').addEventListener('input', (e) => { if (!e.target.value.trim()) { st.cuenta = ''; st.pag = 1; pintar(); } });
    document.getElementById('lm-cierre').onchange = (e) => { st.cierre = e.target.checked; pintar(); };
    app.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { st.pag += Number(b.dataset.p); pintar(); window.scrollTo(0, 0); } });
    pintar();
    enlazarAcciones(app, {
      imprimirTodo: async (v) => { st.todo = v; pintar(); },
      excel: () => {
        const p = getPeriodo(), r = calc(); const filas = [[Store.empresa.nombre], ['Libro mayor'], [periodoTexto(p)], []];
        for (const c of r) {
          filas.push([`${c.codigo} ${c.nombre}`], ['Fecha', 'Nº', 'Descripción', 'Debe', 'Haber', 'Saldo'], ['', '', 'Saldo anterior', '', '', c.saldoAnterior]);
          for (const m of c.movs) filas.push([fmtFecha(m.fecha), m.numero, m.descripcion, m.debe || '', m.haber || '', m.saldo]);
          filas.push(['', '', 'TOTAL', c.debe, c.haber, c.saldoFinal], []);
        }
        exportarExcel(`Libro mayor ${Store.empresa.nombre} ${Store.anio}.xlsx`, [{ nombre: 'Libro mayor', anchos: [12, 7, 44, 14, 14, 16], filas }]);
      }
    });
    return () => {};
  }
};
export default Mayor;
