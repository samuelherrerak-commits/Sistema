import Store from '../store.js';
import { estadoResultados } from '../engine.js';
import { fmtNum, fmtMoney } from '../utils.js';
import { card, barraPeriodo, botonesReporte, encabezadoReporte, periodoTexto, enlazarAcciones, exportarExcel, getPeriodo, filasEstado, aoaEstado } from '../components/ui.js';

const Resultados = {
  async render(app, { envolver }) {
    const calc = () => { const p = getPeriodo(); const { plan, acc } = Store.calc(); return estadoResultados(plan, acc, p.desde, p.hasta); };
    const sub = (t, v) => `<tr class="font-semibold text-slate-700 bg-slate-50"><td class="py-1.5 px-1">${t}</td><td></td><td></td><td class="py-1.5 pl-3 text-right font-mono tabular">${fmtMoney(v)}</td></tr>`;
    const pintar = () => {
      const p = getPeriodo(), r = calc();
      const S = (ab) => r.secciones.find(s => s.abrev === ab);
      const bloque = (ab) => filasEstado([S(ab)]);
      document.getElementById('er-doc').innerHTML = `
        ${encabezadoReporte('Estado de resultados', periodoTexto(p))}
        <div class="overflow-x-auto"><table class="w-full text-[13px]"><tbody>
          ${bloque('I')}${bloque('CV')}${sub('UTILIDAD BRUTA', r.utilidadBruta)}${bloque('E')}${sub('UTILIDAD OPERATIVA', r.utilidadOperativa)}${bloque('OI')}${bloque('OE')}
          <tr class="font-bold text-slate-900"><td class="pt-5 pb-1.5">${r.esUtilidad ? 'UTILIDAD' : r.utilidad < 0 ? 'PÉRDIDA' : 'RESULTADO'} DEL PERIODO</td><td></td><td></td><td class="pt-5 pb-1.5 pl-3 text-right font-mono tabular bg-amber-100 border-t border-b-4 border-double border-slate-800">${fmtMoney(r.utilidad)}</td></tr>
        </tbody></table></div>
        <p class="text-[11px] text-slate-400 mt-3 no-print">Cada cuenta muestra su movimiento neto dentro del periodo elegido. El impuesto sobre la renta lo determina el contador y no se calcula aquí.</p>`;
    };
    const bp = barraPeriodo(pintar);
    app.innerHTML = envolver(`
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h1 class="text-xl font-semibold text-slate-900">Estado de resultados</h1><p class="text-xs text-slate-500">Ingresos, costos y gastos del periodo.</p></div>${botonesReporte()}</div>
      <div class="${card}">${bp.html}</div><div class="${card} card-print max-w-4xl" id="er-doc"></div>`);
    bp.bind(app); pintar();
    enlazarAcciones(app, { excel: () => {
      const p = getPeriodo(), r = calc();
      exportarExcel(`Estado de resultados ${Store.empresa.nombre} ${Store.anio}.xlsx`, [{ nombre: 'Resultados', anchos: [58, 16, 16, 16], filas: [[Store.empresa.nombre], ['Estado de resultados'], [periodoTexto(p)], [], ...aoaEstado(r.secciones), ['UTILIDAD BRUTA', '', '', r.utilidadBruta], ['UTILIDAD OPERATIVA', '', '', r.utilidadOperativa], ['UTILIDAD / PÉRDIDA DEL PERIODO', '', '', r.utilidad]] }]);
    } });
    return () => {};
  }
};
export default Resultados;
