import Store from '../store.js';
import { filasMovimientos } from '../xlsx-io.js';
import { esc, descargar } from '../utils.js';
import { card, input, label, btnPrimary, btnSecondary, btnDanger, toast, confirmar, exportarExcel } from '../components/ui.js';
import { tarjetaConexion, enlazarConexion } from './conexion.js';

const Ajustes = {
  async render(app, { envolver }) {
    const e = Store.empresa, { plan, asientos } = Store.calc();
    const cuentasC = plan.lista.filter(c => c.hoja && c.abrev === 'C');
    app.innerHTML = envolver(`
      <div><h1 class="text-xl font-semibold text-slate-900">Empresa y respaldo</h1><p class="text-xs text-slate-500">Datos de la empresa, parámetros contables y copias de seguridad.</p></div>
      <div class="${card} space-y-3 max-w-3xl"><h2 class="text-sm font-semibold text-slate-900">Datos de la empresa</h2>
        <form id="aj-form" class="space-y-3">
          <div class="grid sm:grid-cols-3 gap-3"><div class="sm:col-span-2"><label class="${label}">Nombre</label><input name="nombre" class="${input}" required value="${esc(e.nombre)}"></div><div><label class="${label}">RIF</label><input name="rif" class="${input}" value="${esc(e.rif)}"></div></div>
          <div><label class="${label}">Cuenta de resultados (donde se acumula la utilidad/pérdida del ejercicio)</label>
            <select name="res" class="${input}">${cuentasC.map(c => `<option value="${c.codigo}" ${c.codigo === e.cuenta_resultados ? 'selected' : ''}>${c.codigo} — ${esc(c.nombre)}</option>`).join('')}</select></div>
          <div><label class="${label}">Clases de cuentas (por el primer dígito del código)</label>
            <table class="w-full text-xs"><thead><tr class="text-left text-[10px] uppercase text-slate-400"><th class="p-1">Dígito</th><th class="p-1">Abrev.</th><th class="p-1">Nombre</th><th class="p-1">Saldo normal</th><th class="p-1">Clase</th></tr></thead><tbody>
            ${e.clases.map((c, i) => `<tr><td class="p-1 font-mono">${esc(c.digito)}</td><td class="p-1 font-mono text-slate-500">${esc(c.abrev)}</td><td class="p-1">${esc(c.nombre)}</td>
              <td class="p-1"><select data-i="${i}" data-k="tipo" class="${input} !py-1"><option value="D" ${c.tipo === 'D' ? 'selected' : ''}>Deudor</option><option value="A" ${c.tipo === 'A' ? 'selected' : ''}>Acreedor</option></select></td>
              <td class="p-1"><select data-i="${i}" data-k="clase" class="${input} !py-1"><option value="R" ${c.clase === 'R' ? 'selected' : ''}>Real (balance)</option><option value="N" ${c.clase === 'N' ? 'selected' : ''}>Nominal (resultados)</option></select></td></tr>`).join('')}
            </tbody></table></div>
          <div class="flex justify-end"><button class="${btnPrimary}">Guardar cambios</button></div>
        </form></div>
      <div class="${card} space-y-3 max-w-3xl"><h2 class="text-sm font-semibold text-slate-900">Copias de seguridad</h2>
        <div class="flex flex-wrap gap-2"><button id="aj-json" class="${btnSecondary}">Descargar respaldo (.json)</button><button id="aj-xlsx" class="${btnSecondary}">Exportar movimientos a Excel</button></div>
        <p class="text-xs text-slate-500">El respaldo .json incluye plan de cuentas, asientos, saldos y propuestas de esta empresa; se restaura desde la pantalla de empresas. El Excel tiene el mismo formato de la hoja “Movimientos” del sistema anterior.</p></div>
      <div class="max-w-3xl">${tarjetaConexion()}</div>
      <div class="${card} space-y-2 max-w-3xl border-rose-200"><h2 class="text-sm font-semibold text-rose-700">Zona peligrosa</h2><p class="text-xs text-slate-500">Elimina esta empresa con todos sus asientos, cuentas y saldos (también de Google Sheets si está conectado).</p><button id="aj-del" class="${btnDanger}">Eliminar empresa</button></div>`);
    enlazarConexion(app);
    const clases = structuredClone(e.clases);
    app.querySelectorAll('select[data-i]').forEach(s => s.onchange = () => { clases[s.dataset.i][s.dataset.k] = s.value; });
    document.getElementById('aj-form').onsubmit = async (ev) => {
      ev.preventDefault(); const f = new FormData(ev.target);
      await Store.guardarEmpresa({ ...Store.empresa, nombre: f.get('nombre').trim(), rif: f.get('rif').trim(), cuenta_resultados: f.get('res'), clases });
      toast('Cambios guardados'); window.dispatchEvent(new Event('hashchange'));
    };
    document.getElementById('aj-json').onclick = () => descargar(`respaldo ${e.nombre} ${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(Store.exportarJSON()));
    document.getElementById('aj-xlsx').onclick = () => {
      const m = filasMovimientos(); [...Store.calc().asientos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero).forEach(a => m.add(plan, a));
      exportarExcel(`Movimientos ${e.nombre} ${Store.anio}.xlsx`, [{ nombre: 'Movimientos', anchos: [8, 6, 12, 12, 40, 40, 14, 14, 6], filas: m.filas }, { nombre: 'Plan', anchos: [14, 60], filas: [['Cuenta', 'Nombre'], ...plan.lista.map(c => [c.codigo, c.nombre])] }]);
    };
    document.getElementById('aj-del').onclick = async () => {
      if (!(await confirmar(`Vas a eliminar “${e.nombre}” con ${asientos.length} asiento(s) de ${Store.anio} y todo lo demás. Descarga un respaldo antes si no estás segura.`, { si: 'Eliminar para siempre', peligro: true }))) return;
      await Store.eliminarEmpresa(e.id); toast('Empresa eliminada'); location.hash = '#/';
    };
    return () => {};
  }
};
export default Ajustes;
