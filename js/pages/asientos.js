import Store from '../store.js';
import { esc, fmtNum, fmtFecha, debounce, MESES } from '../utils.js';
import { icon } from '../components/icons.js';
import { card, input, label, btnPrimary, btnIcon, badge, toast, confirmar, adjuntarSelectorCuenta } from '../components/ui.js';
import { abrirEditorAsiento } from '../components/asiento-editor.js';

const POR_PAGINA = 25;

const Asientos = {
  async render(app, { envolver }) {
    const { plan } = Store.calc();
    const st = { q: '', mes: 0, cuenta: '', pag: 1 };
    const anio = Store.anio;
    let cache = null; // texto buscable por asiento

    const todos = () => Store.asientos.filter(a => a.anio === anio);
    const textoDe = (a) => (a._t ||= `${a.numero} ${a.observacion} ${a.lineas.map(l => `${l.cuenta} ${l.descripcion} ${(plan.porCodigo.get(l.cuenta) || {}).nombre || ''}`).join(' ')}`.toLowerCase());
    const filtrados = () => {
      const q = st.q.trim().toLowerCase();
      return todos().filter(a => (!st.mes || Number(a.fecha.slice(5, 7)) === st.mes) && (!st.cuenta || a.lineas.some(l => l.cuenta === st.cuenta)) && (!q || textoDe(a).includes(q)))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.numero - a.numero) || (b.seq || 0) - (a.seq || 0)));
    };

    const pintarLista = () => {
      const f = filtrados();
      const paginas = Math.max(1, Math.ceil(f.length / POR_PAGINA));
      if (st.pag > paginas) st.pag = paginas;
      const vis = f.slice((st.pag - 1) * POR_PAGINA, st.pag * POR_PAGINA);
      document.getElementById('as-count').textContent = `${f.length.toLocaleString('en-US')} de ${todos().length.toLocaleString('en-US')} asiento${todos().length === 1 ? '' : 's'}`;
      document.getElementById('as-lista').innerHTML = vis.length ? vis.map(a => {
        const total = a.lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
        return `<div class="border border-slate-200 rounded-lg overflow-hidden" data-id="${a.id}">
          <div class="flex items-center gap-3 px-3 py-2 bg-slate-50 text-xs">
            <span class="font-semibold text-slate-900">Nº ${a.numero}</span><span class="text-slate-500">${fmtFecha(a.fecha)}</span>
            ${a.esCierre ? badge('violet', 'Cierre') : ''}
            <span class="text-slate-600 truncate flex-1">${esc(a.observacion)}</span>
            <span class="font-mono tabular text-slate-700">${fmtNum(total)}</span>
            <button data-ed class="${btnIcon}" title="Editar">${icon('edit', 'w-4 h-4')}</button>
            <button data-dup class="${btnIcon}" title="Duplicar">${icon('copy', 'w-4 h-4')}</button>
            <button data-del class="${btnIcon} hover:!text-rose-600" title="Eliminar">${icon('trash', 'w-4 h-4')}</button>
          </div>
          <table class="w-full text-xs"><tbody>${a.lineas.map(l => {
            const c = plan.porCodigo.get(l.cuenta);
            return `<tr class="border-t border-slate-100"><td class="px-3 py-1 font-mono text-slate-500 w-28">${esc(l.cuenta)}</td><td class="py-1 text-slate-800">${esc(c ? c.nombre : '(no existe)')}${l.descripcion ? `<span class="text-slate-400"> · ${esc(l.descripcion)}</span>` : ''}</td>
              <td class="py-1 pr-3 text-right font-mono tabular text-blue-600 w-28">${Number(l.debe) ? fmtNum(l.debe) : ''}</td><td class="py-1 pr-3 text-right font-mono tabular text-emerald-600 w-28">${Number(l.haber) ? fmtNum(l.haber) : ''}</td></tr>`;
          }).join('')}</tbody></table></div>`;
      }).join('') : `<p class="text-center text-sm text-slate-400 py-8">${todos().length ? 'Ningún asiento coincide con los filtros.' : 'Aún no hay asientos en este ejercicio. Crea el primero con “Nuevo asiento”.'}</p>`;
      document.getElementById('as-pag').innerHTML = paginas > 1 ? `<div class="flex items-center justify-center gap-3 text-xs text-slate-500">
        <button data-p="-1" class="${btnIcon}" ${st.pag === 1 ? 'disabled' : ''}>←</button>Página ${st.pag} de ${paginas}<button data-p="1" class="${btnIcon}" ${st.pag === paginas ? 'disabled' : ''}>→</button></div>` : '';
    };

    const cuerpo = `
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div><h1 class="text-xl font-semibold text-slate-900">Asientos</h1><p class="text-xs text-slate-500">Comprobantes de partida doble del ejercicio ${anio}. <span id="as-count"></span></p></div>
        <button id="as-nuevo" class="${btnPrimary} flex items-center gap-1.5 self-start">${icon('plus', 'w-4 h-4')}Nuevo asiento</button>
      </div>
      <div class="${card} space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label class="${label}">Buscar (número, descripción, cuenta)</label><input id="f-q" class="${input}" placeholder="Ej.: alquiler, 6104001, 25…"></div>
          <div><label class="${label}">Mes</label><select id="f-mes" class="${input}"><option value="0">Todos</option>${MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></div>
          <div><label class="${label}">Cuenta</label><div class="relative"><input id="f-cuenta" class="${input} font-mono" placeholder="Todas (escribe para filtrar)"></div></div>
        </div>
        <div id="as-lista" class="space-y-2"></div><div id="as-pag"></div>
      </div>`;
    app.innerHTML = envolver(cuerpo);

    const $ = (id) => document.getElementById(id);
    $('as-nuevo').onclick = () => abrirEditorAsiento({ onGuardado: pintarLista });
    $('f-q').addEventListener('input', debounce((e) => { st.q = e.target.value; st.pag = 1; pintarLista(); }, 200));
    $('f-mes').addEventListener('change', (e) => { st.mes = Number(e.target.value); st.pag = 1; pintarLista(); });
    adjuntarSelectorCuenta($('f-cuenta'), plan.lista.filter(c => c.hoja), (c) => { st.cuenta = c.codigo; st.pag = 1; pintarLista(); });
    $('f-cuenta').addEventListener('input', (e) => { if (!e.target.value.trim()) { st.cuenta = ''; st.pag = 1; pintarLista(); } });
    $('as-pag').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { st.pag += Number(b.dataset.p); pintarLista(); window.scrollTo(0, 0); } });
    $('as-lista').addEventListener('click', async (e) => {
      const box = e.target.closest('[data-id]'); if (!box) return;
      const a = Store.asientos.find(x => x.id === box.dataset.id);
      if (e.target.closest('[data-ed]')) abrirEditorAsiento({ asiento: a, onGuardado: pintarLista });
      else if (e.target.closest('[data-dup]')) abrirEditorAsiento({ borrador: { asiento: { fecha: a.fecha, observacion: a.observacion, lineas: a.lineas } }, onGuardado: pintarLista });
      else if (e.target.closest('[data-del]') && await confirmar(`¿Eliminar el asiento Nº ${a.numero} del ${fmtFecha(a.fecha)}? Esta acción no se puede deshacer.`, { si: 'Eliminar', peligro: true })) {
        await Store.eliminarAsiento(a.id); toast('Asiento eliminado'); pintarLista();
      }
    });
    pintarLista();
    return () => {};
  }
};
export default Asientos;
