import Store from '../store.js';
import { construirPlan, cent } from '../engine.js';
import { PLAN_BASE } from '../plan-base.js';
import { esc, fmtNum, parseMonto } from '../utils.js';
import { icon } from '../components/icons.js';
import { card, input, label, th, btnPrimary, btnSecondary, btnIcon, badge, abrirModal, toast, confirmar, exportarExcel } from '../components/ui.js';

const Plan = {
  async render(app, { envolver }) {
    let q = '';
    const usada = (codigo) => Store.asientos.some(a => a.lineas.some(l => l.cuenta === codigo)) || Store.saldos.some(s => s.codigo === codigo && s.monto);

    const pintar = () => {
      const { plan } = Store.calc();
      const f = q.trim().toLowerCase();
      const lista = plan.lista.filter(c => !f || c.codigo.startsWith(f) || c.nombre.toLowerCase().includes(f));
      const ini = Store.calc().saldosIni;
      let deud = 0, acre = 0;
      for (const [cod, m] of Object.entries(ini)) { const c = plan.porCodigo.get(cod); if (!c) continue; if (c.tipo === 'D') deud += cent(m); else acre += cent(m); }
      document.getElementById('pl-resumen').innerHTML = `${plan.lista.length} cuentas · Saldos iniciales: deudores <b>${fmtNum(deud / 100)}</b> · acreedores <b>${fmtNum(acre / 100)}</b> ${deud === acre ? '<span class="text-emerald-600 font-semibold">✓ cuadran</span>' : `<span class="text-amber-600 font-semibold">⚠ diferencia ${fmtNum((deud - acre) / 100)}</span>`}`;
      document.getElementById('pl-tbody').innerHTML = lista.map(c => `
        <tr class="border-b border-slate-100 ${c.hoja ? '' : 'bg-slate-50/60'}" data-cod="${esc(c.codigo)}">
          <td class="p-2 font-mono text-slate-500">${esc(c.codigo)}</td>
          <td class="p-2 ${c.hoja ? 'text-slate-800' : 'font-semibold text-slate-900'}" style="padding-left:${0.5 + (c.nivel - 1) * 1}rem">${esc(c.nombre)}</td>
          <td class="p-2">${c.definida ? badge(c.tipo === 'D' ? 'blue' : 'emerald', c.tipo === 'D' ? 'Deudora' : 'Acreedora') : badge('rose', 'Sin clase')}</td>
          <td class="p-2 w-40">${c.hoja ? `<input data-saldo inputmode="decimal" class="${input} text-right tabular !py-1" value="${ini[c.codigo] ? fmtNum(ini[c.codigo]).replace(/,/g, '') : ''}" placeholder="0.00">` : ''}</td>
          <td class="p-2 w-20 text-right whitespace-nowrap"><button data-ed class="${btnIcon}" title="Renombrar">${icon('edit', 'w-4 h-4')}</button><button data-del class="${btnIcon} hover:!text-rose-600" title="Eliminar">${icon('trash', 'w-4 h-4')}</button></td></tr>`).join('') || `<tr><td colspan="5" class="p-6 text-center text-slate-400">Ninguna cuenta coincide.</td></tr>`;
    };

    app.innerHTML = envolver(`
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div><h1 class="text-xl font-semibold text-slate-900">Plan de cuentas</h1><p class="text-xs text-slate-500">Solo las cuentas de movimiento (sin subcuentas) reciben asientos. El saldo inicial de ${Store.anio} va en la naturaleza de la cuenta (Activo en positivo si es deudor, Pasivo/Patrimonio en positivo si es acreedor).</p></div>
        <div class="flex gap-2 self-start"><button id="pl-excel" class="${btnSecondary}">Excel</button><button id="pl-base" class="${btnSecondary}" title="Agrega las cuentas del plan base que falten">Completar con plan base</button><button id="pl-nueva" class="${btnPrimary} flex items-center gap-1.5">${icon('plus', 'w-4 h-4')}Nueva cuenta</button></div>
      </div>
      <div class="${card} space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3"><input id="pl-q" class="${input}" style="max-width:20rem" placeholder="Buscar por código o nombre…"><p id="pl-resumen" class="text-xs text-slate-500"></p></div>
        <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-left border-b border-slate-200"><th class="${th} w-28">Código</th><th class="${th}">Nombre</th><th class="${th}">Naturaleza</th><th class="${th} text-right">Saldo inicial ${Store.anio}</th><th></th></tr></thead><tbody id="pl-tbody"></tbody></table></div>
      </div>`);
    const $ = (id) => document.getElementById(id);
    $('pl-q').addEventListener('input', (e) => { q = e.target.value; pintar(); });

    $('pl-tbody').addEventListener('change', async (e) => {
      const inp = e.target.closest('[data-saldo]'); if (!inp) return;
      const cod = inp.closest('tr').dataset.cod, m = parseMonto(inp.value);
      if (isNaN(m)) { toast('Monto inválido', 'error'); return pintar(); }
      await Store.setSaldo(cod, m); pintar();
    });
    $('pl-tbody').addEventListener('click', async (e) => {
      const tr = e.target.closest('tr[data-cod]'); if (!tr) return;
      const { plan } = Store.calc(); const c = plan.porCodigo.get(tr.dataset.cod);
      if (e.target.closest('[data-ed]')) {
        abrirModal({ titulo: `Renombrar ${c.codigo}`, cuerpo: `<form class="space-y-3"><div><label class="${label}">Nombre</label><input name="n" class="${input}" value="${esc(c.nombre)}" required></div><div class="flex justify-end"><button class="${btnPrimary}">Guardar</button></div></form>`,
          onMount: (el, cerrar) => el.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await Store.guardarCuenta({ codigo: c.codigo, nombre: new FormData(ev.target).get('n') }); cerrar(); pintar(); } });
      } else if (e.target.closest('[data-del]')) {
        if (!c.hoja) return toast('Esta cuenta tiene subcuentas: elimina primero las subcuentas.', 'aviso');
        if (usada(c.codigo)) return toast('La cuenta tiene asientos o saldo inicial: no se puede eliminar.', 'aviso');
        if (await confirmar(`¿Eliminar la cuenta ${c.codigo} ${c.nombre}?`, { si: 'Eliminar', peligro: true })) { await Store.eliminarCuenta(c.codigo); pintar(); }
      }
    });

    $('pl-nueva').onclick = () => abrirModal({
      titulo: 'Nueva cuenta',
      cuerpo: `<form class="space-y-3"><div class="grid grid-cols-3 gap-3"><div><label class="${label}">Código *</label><input name="c" class="${input} font-mono" required inputmode="numeric" placeholder="1101004"></div><div class="col-span-2"><label class="${label}">Nombre *</label><input name="n" class="${input}" required></div></div>
        <p id="pl-hint" class="text-xs text-slate-500"></p><div class="flex justify-end"><button class="${btnPrimary}">Crear cuenta</button></div></form>`,
      onMount: (el, cerrar) => {
        const f = el.querySelector('form'), hint = el.querySelector('#pl-hint');
        f.c.addEventListener('input', () => {
          const { plan } = Store.calc(); const cod = f.c.value.trim();
          const t = construirPlan([...Store.cuentas, { codigo: cod || '0', nombre: '' }], Store.empresa.clases).porCodigo.get(cod);
          hint.textContent = !cod ? '' : plan.porCodigo.has(cod) ? 'Ese código ya existe.' : t && t.padre ? `Quedará dentro de ${t.padre} ${plan.porCodigo.get(t.padre).nombre}.` : 'No hay cuenta de grupo que la contenga (quedará suelta).';
        });
        f.onsubmit = async (ev) => {
          ev.preventDefault();
          const { plan } = Store.calc(); const cod = f.c.value.trim();
          if (!/^\d+$/.test(cod)) return toast('El código solo lleva números.', 'error');
          if (plan.porCodigo.has(cod)) return toast('Ese código ya existe.', 'error');
          if (!plan.porDigito.has(cod[0])) return toast(`No hay clase de cuenta para el dígito ${cod[0]} (revisa Ajustes).`, 'error');
          const padre = construirPlan([...Store.cuentas, { codigo: cod, nombre: '' }], Store.empresa.clases).porCodigo.get(cod).padre;
          if (padre && plan.porCodigo.get(padre).hoja && usada(padre)) return toast(`${padre} ya tiene movimientos o saldo; no puede volverse cuenta de grupo.`, 'error');
          await Store.guardarCuenta({ codigo: cod, nombre: f.n.value }); cerrar(); toast('Cuenta creada'); pintar();
        };
      }
    });

    $('pl-base').onclick = async () => {
      const tengo = new Set(Store.cuentas.map(c => c.codigo));
      const faltan = PLAN_BASE.filter(([c]) => !tengo.has(c));
      if (!faltan.length) return toast('Ya tienes todas las cuentas del plan base.');
      if (await confirmar(`Se agregarán ${faltan.length} cuenta(s) del plan base que no tienes. No se modifica nada de lo existente.`, { si: 'Agregar' })) { await Store.guardarCuentasLote(faltan.map(([codigo, nombre]) => ({ codigo, nombre }))); toast(`${faltan.length} cuentas agregadas`); pintar(); }
    };
    $('pl-excel').onclick = () => { const { plan } = Store.calc(); exportarExcel(`Plan de cuentas ${Store.empresa.nombre}.xlsx`, [{ nombre: 'Plan', anchos: [14, 60, 12], filas: [['Cuenta', 'Nombre', 'Tipo saldo'], ...plan.lista.map(c => [c.codigo, c.nombre, c.tipo === 'D' ? 'Deudora' : 'Acreedora'])] }]); };
    pintar();
    return () => {};
  }
};
export default Plan;
