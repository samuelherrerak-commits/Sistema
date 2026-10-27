import Store from '../store.js';
import { estadoSituacion, estadoResultados, balanceComprobacion, resumenMensual, diagnostico } from '../engine.js';
import { esc, fmtNum, fmtFecha, MESES } from '../utils.js';
import { icon } from '../components/icons.js';
import { card, btnPrimary, chipCuadre } from '../components/ui.js';
import { abrirEditorAsiento } from '../components/asiento-editor.js';
import { href } from '../components/shell.js';

const Resumen = {
  async render(app, { envolver }) {
    const { plan, acc, asientos } = Store.calc();
    let ultimo = 0; for (const a of asientos) ultimo = Math.max(ultimo, Number(a.fecha.slice(5, 7)));
    const hasta = ultimo || 12;
    const esf = estadoSituacion(plan, acc, 1, hasta, Store.empresa.cuenta_resultados);
    const er = estadoResultados(plan, acc, 1, hasta);
    const bc = balanceComprobacion(acc, 1, hasta);
    const meses = resumenMensual(acc);
    const max = Math.max(1, ...meses.map(m => Math.max(m.ingresos, m.egresos)));
    const diag = diagnostico(plan, Store.asientos.filter(a => a.anio === Store.anio), Store.calc().saldosIni);
    const pend = Store.borradores.filter(b => b.estado === 'pendiente').length;
    const ult = [...asientos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero).slice(0, 8);
    const kpi = (t, v, sub, color = 'slate') => `<div class="${card}"><p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">${t}</p><p class="text-xl font-semibold text-${color}-900 tabular">${fmtNum(v)}</p><p class="text-[11px] text-slate-400">${sub}</p></div>`;

    app.innerHTML = envolver(`
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div><h1 class="text-xl font-semibold text-slate-900">${esc(Store.empresa.nombre)}</h1><p class="text-xs text-slate-500">Ejercicio ${Store.anio} · ${asientos.length.toLocaleString('en-US')} asientos${ultimo ? ` · al cierre de ${MESES[hasta - 1]}` : ''}</p></div>
        <button id="rs-nuevo" class="${btnPrimary} flex items-center gap-1.5 self-start">${icon('plus', 'w-4 h-4')}Nuevo asiento</button>
      </div>
      <div class="flex flex-wrap gap-2">${chipCuadre(bc.cuadra, 'Libro cuadrado (Debe = Haber)', 'Tienes una diferencia en el libro')}${chipCuadre(esf.cuadra, 'Activo = Pasivo + Patrimonio', 'El balance no cuadra')}
        ${pend ? `<a href="${href('facturas')}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800">✦ ${pend} factura(s) por aprobar</a>` : ''}</div>
      ${diag.map(d => `<p class="text-xs ${d.nivel === 'error' ? 'text-rose-700 bg-rose-50' : 'text-amber-800 bg-amber-50'} rounded-lg px-3 py-2">${d.nivel === 'error' ? '⚠' : 'ℹ'} ${esc(d.texto)}</p>`).join('')}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${kpi('Activos', esf.totalActivo, 'al ' + MESES[hasta - 1].toLowerCase())}${kpi('Pasivos', esf.totalPasivo, 'al ' + MESES[hasta - 1].toLowerCase())}${kpi('Patrimonio', esf.totalPatrimonio, 'incluye el resultado')}
        ${kpi(er.utilidad >= 0 ? 'Utilidad del ejercicio' : 'Pérdida del ejercicio', er.utilidad, 'enero – ' + MESES[hasta - 1].toLowerCase(), er.utilidad >= 0 ? 'emerald' : 'rose')}</div>
      <div class="grid lg:grid-cols-5 gap-4">
        <div class="${card} lg:col-span-3"><h2 class="text-sm font-semibold text-slate-900 mb-3">Ingresos y egresos por mes</h2>
          <div class="flex items-end gap-1.5 h-40">${meses.map(m => `<div class="flex-1 flex flex-col items-center gap-1 min-w-0" title="${MESES[m.mes - 1]}: ingresos ${fmtNum(m.ingresos)} · egresos ${fmtNum(m.egresos)}">
            <div class="flex items-end gap-0.5 h-32 w-full justify-center"><div class="w-2.5 sm:w-3 rounded-t bg-emerald-400" style="height:${(m.ingresos / max) * 100}%"></div><div class="w-2.5 sm:w-3 rounded-t bg-rose-400" style="height:${(m.egresos / max) * 100}%"></div></div>
            <span class="text-[9px] text-slate-400">${MESES[m.mes - 1].slice(0, 3)}</span></div>`).join('')}</div>
          <div class="flex gap-4 text-[11px] text-slate-500 mt-2"><span class="flex items-center gap-1"><i class="w-2 h-2 rounded-sm bg-emerald-400"></i>Ingresos</span><span class="flex items-center gap-1"><i class="w-2 h-2 rounded-sm bg-rose-400"></i>Costos y gastos</span></div></div>
        <div class="${card} lg:col-span-2"><div class="flex justify-between items-center mb-2"><h2 class="text-sm font-semibold text-slate-900">Últimos asientos</h2><a href="${href('asientos')}" class="text-xs text-blue-600">Ver todos</a></div>
          ${ult.length ? ult.map(a => `<div class="flex items-center gap-2 py-1.5 border-t border-slate-100 text-xs"><span class="font-semibold text-slate-800 w-8">${a.numero}</span><span class="text-slate-400 w-20">${fmtFecha(a.fecha)}</span><span class="truncate flex-1 text-slate-600">${esc(a.observacion || (a.lineas[0] && (a.lineas[0].descripcion || (plan.porCodigo.get(a.lineas[0].cuenta) || {}).nombre)) || '')}</span><span class="font-mono tabular text-slate-700">${fmtNum(a.lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0))}</span></div>`).join('') : `<p class="text-xs text-slate-400 py-4 text-center">Aún no hay asientos.</p>`}</div>
      </div>`);
    document.getElementById('rs-nuevo').onclick = () => abrirEditorAsiento({ onGuardado: () => window.dispatchEvent(new Event('hashchange')) });
    return () => {};
  }
};
export default Resumen;
