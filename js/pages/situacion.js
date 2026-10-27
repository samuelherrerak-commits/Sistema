import Store from '../store.js';
import { estadoSituacion } from '../engine.js';
import { fmtNum } from '../utils.js';
import { card, barraPeriodo, botonesReporte, encabezadoReporte, periodoTexto, enlazarAcciones, exportarExcel, chipCuadre, getPeriodo, filasEstado, aoaEstado } from '../components/ui.js';

const Situacion = {
  async render(app, { envolver }) {
    const calc = () => { const p = getPeriodo(); const { plan, acc } = Store.calc(); return estadoSituacion(plan, acc, 1, p.hasta, Store.empresa.cuenta_resultados); };
    const pintar = () => {
      const p = getPeriodo(), r = calc();
      const secs = r.secciones.map(s => ({ ...s, resaltar: s.abrev === 'A' }));
      document.getElementById('es-doc').innerHTML = `
        ${encabezadoReporte('Estado de situación financiera', periodoTexto(p, true))}
        <div class="flex justify-center mb-3 no-print">${chipCuadre(r.cuadra, 'Activo = Pasivo + Patrimonio', `El balance no cuadra por ${fmtNum(r.diferencia)}`)}</div>
        <div class="overflow-x-auto"><table class="w-full text-[13px]"><tbody>
          ${filasEstado(secs, { resaltarFinal: true })}
          <tr class="font-bold text-slate-900"><td class="pt-5 pb-1.5">TOTAL DE PASIVO MÁS PATRIMONIO</td><td></td><td></td><td class="pt-5 pb-1.5 pl-3 text-right font-mono tabular bg-amber-100 border-t border-b-4 border-double border-slate-800">${fmtNum(r.totalPasivoPatrimonio)}</td></tr>
        </tbody></table></div>
        <p class="text-[11px] text-slate-400 mt-3">El resultado del ejercicio a la fecha (${fmtNum(r.resultado)}) está incluido en el patrimonio.</p>`;
    };
    const bp = barraPeriodo(pintar, { soloHasta: true });
    app.innerHTML = envolver(`
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h1 class="text-xl font-semibold text-slate-900">Estado de situación financiera</h1><p class="text-xs text-slate-500">Balance general acumulado al mes elegido.</p></div>${botonesReporte()}</div>
      <div class="${card}">${bp.html}</div><div class="${card} card-print max-w-4xl" id="es-doc"></div>`);
    bp.bind(app); pintar();
    enlazarAcciones(app, { excel: () => {
      const p = getPeriodo(), r = calc();
      exportarExcel(`Situacion financiera ${Store.empresa.nombre} ${Store.anio}.xlsx`, [{ nombre: 'Situación financiera', anchos: [58, 16, 16, 16], filas: [[Store.empresa.nombre], ['Estado de situación financiera'], [periodoTexto(p, true)], [], ...aoaEstado(r.secciones), ['TOTAL DE PASIVO MÁS PATRIMONIO', '', '', r.totalPasivoPatrimonio]] }]);
    } });
    return () => {};
  }
};
export default Situacion;
