import Store from '../store.js';
import { balanceComprobacion } from '../engine.js';
import { fmtNum, esc } from '../utils.js';
import { card, th, barraPeriodo, botonesReporte, encabezadoReporte, periodoTexto, enlazarAcciones, exportarExcel, chipCuadre, getPeriodo } from '../components/ui.js';

const Comprobacion = {
  async render(app, { envolver }) {
    const calcular = () => { const p = getPeriodo(); return balanceComprobacion(Store.calc().acc, p.desde, p.hasta); };
    const cuerpoTabla = () => {
      const p = getPeriodo(), r = calcular();
      document.getElementById('bc-doc').innerHTML = `
        ${encabezadoReporte('Balance de comprobación', periodoTexto(p))}
        <div class="flex justify-center mb-3 no-print">${chipCuadre(r.cuadra, 'Debe = Haber y saldos cuadrados', `Descuadre: Debe − Haber = ${fmtNum(r.totales.debe - r.totales.haber)} · saldos ${fmtNum(r.totales.saldo)}`)}</div>
        <div class="overflow-x-auto"><table class="w-full text-xs">
          <thead><tr class="text-left border-b border-slate-200"><th class="${th}">Cuenta</th><th class="${th}">Nombre</th><th class="${th} text-right">Saldo anterior</th><th class="${th} text-right">Debe</th><th class="${th} text-right">Haber</th><th class="${th} text-right">Saldo</th></tr></thead>
          <tbody>${r.filas.length ? r.filas.map(f => `<tr class="border-b border-slate-100"><td class="p-2 font-mono text-slate-500">${esc(f.codigo)}</td><td class="p-2 text-slate-800">${esc(f.nombre)}</td>
            <td class="p-2 text-right font-mono tabular">${fmtNum(f.ant)}</td><td class="p-2 text-right font-mono tabular text-blue-600">${fmtNum(f.debe)}</td><td class="p-2 text-right font-mono tabular text-emerald-600">${fmtNum(f.haber)}</td><td class="p-2 text-right font-mono tabular font-semibold">${fmtNum(f.saldo)}</td></tr>`).join('') : `<tr><td colspan="6" class="p-6 text-center text-slate-400">Sin movimientos ni saldos en el periodo.</td></tr>`}</tbody>
          <tfoot><tr class="font-bold border-t-2 border-slate-800"><td class="p-2" colspan="2">TOTAL</td><td class="p-2 text-right font-mono tabular">${fmtNum(r.totales.ant)}</td><td class="p-2 text-right font-mono tabular">${fmtNum(r.totales.debe)}</td><td class="p-2 text-right font-mono tabular">${fmtNum(r.totales.haber)}</td><td class="p-2 text-right font-mono tabular">${fmtNum(r.totales.saldo)}</td></tr></tfoot>
        </table></div>
        <p class="text-[11px] text-slate-400 mt-2 no-print">Los totales de saldo anterior y saldo suman las cuentas deudoras y restan las acreedoras: si la contabilidad cuadra dan cero.</p>`;
    };
    const bp = barraPeriodo(cuerpoTabla);
    app.innerHTML = envolver(`
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h1 class="text-xl font-semibold text-slate-900">Balance de comprobación</h1><p class="text-xs text-slate-500">Saldo anterior, movimientos y saldo de cada cuenta en el periodo.</p></div>${botonesReporte()}</div>
      <div class="${card}">${bp.html}</div><div class="${card} card-print" id="bc-doc"></div>`);
    bp.bind(app); cuerpoTabla();
    enlazarAcciones(app, { excel: () => {
      const p = getPeriodo(), r = calcular();
      exportarExcel(`Balance de comprobacion ${Store.empresa.nombre} ${Store.anio}.xlsx`, [{ nombre: 'Balance', anchos: [14, 46, 16, 16, 16, 16], filas: [[Store.empresa.nombre], ['Balance de comprobación'], [periodoTexto(p)], [], ['Cuenta', 'Nombre', 'Saldo anterior', 'Debe', 'Haber', 'Saldo'], ...r.filas.map(f => [f.codigo, f.nombre, f.ant, f.debe, f.haber, f.saldo]), ['', 'TOTAL', r.totales.ant, r.totales.debe, r.totales.haber, r.totales.saldo]] }]);
    } });
    return () => {};
  }
};
export default Comprobacion;
