import Store from '../store.js';
import { asientoCierre, saldosNuevoEjercicio } from '../engine.js';
import { fmtNum, fmtFecha, esc } from '../utils.js';
import { card, th, btnPrimary, btnSecondary, btnDanger, badge, botonesReporte, encabezadoReporte, enlazarAcciones, exportarExcel, toast, confirmar, chipCuadre } from '../components/ui.js';

const Cierre = {
  async render(app, { envolver }) {
    const pintar = () => {
      const { plan, acc } = Store.calc();
      const emp = Store.empresa, anio = Store.anio;
      const c = asientoCierre(plan, acc, anio, emp.cuenta_resultados);
      const posteado = Store.asientos.find(a => a.anio === anio && a.esCierre);
      app.innerHTML = envolver(`
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h1 class="text-xl font-semibold text-slate-900">Asiento de cierre ${anio}</h1><p class="text-xs text-slate-500">Salda las cuentas de resultados al 31/12 contra “${esc((plan.porCodigo.get(emp.cuenta_resultados) || {}).nombre || 'Resultado del ejercicio')}”.</p></div>${botonesReporte()}</div>
        <div class="${card} card-print">
          ${encabezadoReporte('Asiento de cierre', `Al 31 de diciembre de ${anio}`)}
          <div class="flex justify-center gap-2 mb-3 no-print">${posteado ? badge('violet', `Contabilizado: asiento Nº ${posteado.numero}`) : badge('amber', 'Aún sin contabilizar (vista previa)')} ${chipCuadre(c.cuadra, 'Debe = Haber', 'Descuadrado')}</div>
          <table class="w-full text-xs"><thead><tr class="text-left border-b border-slate-200"><th class="${th}">Cuenta</th><th class="${th}">Nombre</th><th class="${th}">Descripción</th><th class="${th} text-right">Debe</th><th class="${th} text-right">Haber</th></tr></thead>
          <tbody>${c.lineas.length ? c.lineas.map(l => `<tr class="border-b border-slate-100"><td class="p-2 font-mono text-slate-500">${esc(l.cuenta)}</td><td class="p-2 text-slate-800">${esc(l.nombre)}</td><td class="p-2 text-slate-500">${esc(l.descripcion)}</td><td class="p-2 text-right font-mono tabular">${l.debe ? fmtNum(l.debe) : ''}</td><td class="p-2 text-right font-mono tabular">${l.haber ? fmtNum(l.haber) : ''}</td></tr>`).join('') : `<tr><td colspan="5" class="p-6 text-center text-slate-400">No hay saldos en cuentas de resultados para cerrar.</td></tr>`}</tbody>
          <tfoot><tr class="font-bold border-t-2 border-slate-800"><td class="p-2" colspan="3">TOTAL</td><td class="p-2 text-right font-mono tabular">${fmtNum(c.debe)}</td><td class="p-2 text-right font-mono tabular">${fmtNum(c.haber)}</td></tr></tfoot></table>
          <p class="text-sm mt-3 font-semibold ${c.resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'}">Resultado del ejercicio: ${c.resultado >= 0 ? 'ganancia' : 'pérdida'} de ${fmtNum(Math.abs(c.resultado))}</p>
        </div>
        <div class="${card} space-y-3 no-print">
          <h2 class="text-sm font-semibold text-slate-900">Acciones</h2>
          <div class="flex flex-wrap gap-2">
            ${posteado ? `<button id="ci-quitar" class="${btnDanger}">Deshacer asiento de cierre</button>` : `<button id="ci-post" class="${btnPrimary}" ${c.lineas.length ? '' : 'disabled'}>Contabilizar asiento de cierre</button>`}
            <button id="ci-nuevo" class="${btnSecondary}">Abrir ejercicio ${anio + 1} con estos saldos</button>
          </div>
          <p class="text-xs text-slate-500">Los reportes (balance, resultados, libros) dan lo mismo antes y después de contabilizar el cierre: el cierre solo queda registrado. “Abrir ejercicio” copia los saldos finales de las cuentas reales como saldos iniciales del año siguiente y suma el resultado a la cuenta de resultados.</p>
        </div>`);
      const $ = (id) => document.getElementById(id);
      if ($('ci-post')) $('ci-post').onclick = async () => {
        if (!(await confirmar(`Se creará el asiento de cierre al 31/12/${anio}. ¿Continuar?`, { si: 'Contabilizar' }))) return;
        await Store.guardarAsiento({ numero: Store.siguienteNumero(), fecha: c.fecha, observacion: 'Cierre de cuentas nominales', esCierre: true, lineas: c.lineas.map(l => ({ cuenta: l.cuenta, descripcion: l.descripcion, debe: l.debe, haber: l.haber })) });
        toast('Asiento de cierre contabilizado'); pintar();
      };
      if ($('ci-quitar')) $('ci-quitar').onclick = async () => { if (await confirmar('¿Deshacer el asiento de cierre?', { si: 'Deshacer', peligro: true })) { await Store.eliminarAsiento(posteado.id); toast('Cierre deshecho'); pintar(); } };
      $('ci-nuevo').onclick = async () => {
        const hay = Store.saldos.some(s => s.anio === anio + 1);
        if (!(await confirmar(`${hay ? `El ejercicio ${anio + 1} ya tiene saldos iniciales; se reemplazarán.\n\n` : ''}Se abrirá el ejercicio ${anio + 1} con los saldos finales de ${anio}. ¿Continuar?`, { si: 'Abrir ejercicio' }))) return;
        await Store.reemplazarSaldos(anio + 1, saldosNuevoEjercicio(plan, acc, emp.cuenta_resultados));
        await Store.cambiarAnio(anio + 1);
        toast(`Ejercicio ${anio + 1} abierto`); location.hash = `#/e/${emp.id}/plan`;
      };
      enlazarAcciones(app, { excel: () => exportarExcel(`Asiento de cierre ${emp.nombre} ${anio}.xlsx`, [{ nombre: 'Cierre', anchos: [14, 46, 30, 16, 16], filas: [[emp.nombre], [`Asiento de cierre ${anio}`], [], ['Cuenta', 'Nombre', 'Descripción', 'Debe', 'Haber'], ...c.lineas.map(l => [l.cuenta, l.nombre, l.descripcion, l.debe || '', l.haber || '']), ['', '', 'TOTAL', c.debe, c.haber]] }]) });
    };
    pintar();
    return () => {};
  }
};
export default Cierre;
