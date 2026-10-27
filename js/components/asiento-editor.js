// Editor de asientos ("Comprobante" del Excel) pensado para teclear rápido:
// cuenta (código o nombre) → descripción → debe/haber → Enter agrega la línea siguiente ya con el
// monto que falta para cuadrar y la misma descripción.
import Store from '../store.js';
import { validarAsiento, cent } from '../engine.js';
import { esc, fmtNum, hoyISO, parseMonto } from '../utils.js';
import { abrirModal, adjuntarSelectorCuenta, btnPrimary, btnSecondary, btnIcon, input, label, th, toast, confirmar } from './ui.js';
import { icon } from './icons.js';

let ultimaFecha = '';

function fechaInicial() {
  if (ultimaFecha && Number(ultimaFecha.slice(0, 4)) === Store.anio) return ultimaFecha;
  const h = hoyISO();
  return Number(h.slice(0, 4)) === Store.anio ? h : `${Store.anio}-12-31`;
}

const linea = (o = {}) => ({ cuenta: '', descripcion: '', debe: '', haber: '', ...o });

// opciones: { asiento (editar), borrador (aprobar), onGuardado(row) }
export function abrirEditorAsiento({ asiento = null, borrador = null, onGuardado = () => {} } = {}) {
  const { plan } = Store.calc();
  const hojas = plan.lista.filter(c => c.hoja);
  const f = asiento
    ? { id: asiento.id, numero: asiento.numero, fecha: asiento.fecha, observacion: asiento.observacion || '', esCierre: asiento.esCierre, seq: asiento.seq, lineas: asiento.lineas.map(l => linea({ ...l, debe: l.debe || '', haber: l.haber || '' })) }
    : borrador
      ? { numero: Store.siguienteNumero(), fecha: borrador.asiento.fecha || borrador.fecha || fechaInicial(), observacion: borrador.asiento.observacion || [borrador.proveedor, borrador.nro_factura && `Fact. ${borrador.nro_factura}`].filter(Boolean).join(' · '), lineas: (borrador.asiento.lineas || []).map(l => linea({ ...l, debe: l.debe || '', haber: l.haber || '' })) }
      : { numero: Store.siguienteNumero(), fecha: fechaInicial(), observacion: '', lineas: [linea(), linea()] };
  while (f.lineas.length < 2) f.lineas.push(linea());

  const esFactura = !!(borrador && borrador.origen);
  const titulo = asiento ? `Editar asiento Nº ${asiento.numero}` : esFactura ? 'Revisar factura y aprobar asiento' : borrador ? 'Duplicar asiento' : 'Nuevo asiento';
  let cerrarModal;

  const num = (v) => { const n = parseMonto(v); return isNaN(n) ? 0 : n; };
  const totales = () => {
    const d = f.lineas.reduce((s, l) => s + cent(num(l.debe)), 0), h = f.lineas.reduce((s, l) => s + cent(num(l.haber)), 0);
    return { d, h, dif: d - h };
  };

  const cuerpo = `
    <div class="space-y-4" id="ae">
      ${esFactura ? `<div class="text-xs bg-blue-50 text-blue-800 rounded-lg px-3 py-2">Propuesta de la IA para <b>${esc(borrador.proveedor || 'factura')}</b>${borrador.nro_factura ? ` · Fact. ${esc(borrador.nro_factura)}` : ''}${borrador.total ? ` · Total ${fmtNum(borrador.total)}` : ''}. Revísala y corrige lo que haga falta antes de guardar.${borrador.nota ? `<br><span class="text-blue-600">${esc(borrador.nota)}</span>` : ''}</div>` : ''}
      <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div><label class="${label}">Nº partida</label><input id="ae-num" type="number" min="1" class="${input}" value="${f.numero}"></div>
        <div class="md:col-span-2"><label class="${label}">Fecha</label><input id="ae-fecha" type="date" class="${input}" value="${f.fecha}"></div>
        <div class="col-span-2 md:col-span-3"><label class="${label}">Observación</label><input id="ae-obs" class="${input}" value="${esc(f.observacion)}" placeholder="Opcional: se muestra en el libro mayor si la línea no tiene descripción"></div>
      </div>
      <div class="overflow-x-auto"><table class="w-full text-xs">
        <thead><tr class="text-left"><th class="${th} w-36">Cuenta</th><th class="${th}">Nombre</th><th class="${th}">Descripción</th><th class="${th} w-32 text-right">Debe</th><th class="${th} w-32 text-right">Haber</th><th class="w-8"></th></tr></thead>
        <tbody id="ae-lineas"></tbody></table></div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <button id="ae-add" class="${btnSecondary} flex items-center gap-1.5">${icon('plus', 'w-4 h-4')}Agregar línea</button>
        <div class="flex items-center gap-4 text-sm tabular"><span>Debe <b id="ae-td" class="text-blue-600"></b></span><span>Haber <b id="ae-th" class="text-emerald-600"></b></span><span id="ae-dif" class="text-xs font-bold"></span></div>
      </div>
      <div id="ae-err" class="hidden text-xs bg-rose-50 text-rose-700 rounded-lg px-3 py-2 space-y-0.5"></div>
      <div class="flex flex-wrap justify-end gap-2 pt-1 border-t border-slate-100 pt-3">
        <button id="ae-cancel" class="${btnSecondary}">Cancelar</button>
        ${asiento || esFactura ? '' : `<button id="ae-nuevo" class="${btnSecondary}">Guardar y nuevo</button>`}
        <button id="ae-save" class="${btnPrimary}">${asiento ? 'Guardar cambios' : esFactura ? 'Aprobar y contabilizar' : 'Guardar asiento'} <span class="opacity-60 text-xs ml-1">Ctrl+Enter</span></button>
      </div>
    </div>`;

  const montar = (el, cerrar) => {
    cerrarModal = cerrar;
    const $ = (s) => el.querySelector(s);
    const tbody = $('#ae-lineas');

    const nombreDe = (cod) => { const c = plan.porCodigo.get(String(cod).trim()); return c ? (c.hoja ? { t: c.nombre, ok: true } : { t: `${c.nombre} (cuenta de grupo)`, ok: false }) : { t: cod ? 'No existe en el plan' : '', ok: !cod }; };

    const pintarTotales = () => {
      const t = totales();
      $('#ae-td').textContent = fmtNum(t.d / 100); $('#ae-th').textContent = fmtNum(t.h / 100);
      const d = $('#ae-dif');
      d.textContent = t.dif === 0 ? (t.d ? '✓ Cuadrado' : '') : `Diferencia ${fmtNum(Math.abs(t.dif) / 100)} (${t.dif > 0 ? 'falta Haber' : 'falta Debe'})`;
      d.className = `text-xs font-bold ${t.dif === 0 ? 'text-emerald-600' : 'text-amber-600'}`;
    };

    const pintarLineas = (enfocar = null) => {
      tbody.innerHTML = f.lineas.map((l, i) => {
        const n = nombreDe(l.cuenta);
        return `<tr data-i="${i}" class="border-b border-slate-100">
          <td class="p-1"><input data-c="cuenta" class="${input} font-mono ${n.ok ? '' : 'border-rose-300'}" value="${esc(l.cuenta)}" placeholder="Código o nombre" autocomplete="off"></td>
          <td class="p-1 text-slate-600 max-w-[16rem]"><span data-nom class="block truncate ${n.ok ? '' : 'text-rose-600'}">${esc(n.t)}</span></td>
          <td class="p-1"><input data-c="descripcion" class="${input}" value="${esc(l.descripcion)}"></td>
          <td class="p-1"><input data-c="debe" inputmode="decimal" class="${input} text-right tabular" value="${esc(l.debe)}"></td>
          <td class="p-1"><input data-c="haber" inputmode="decimal" class="${input} text-right tabular" value="${esc(l.haber)}"></td>
          <td class="p-1"><button data-del class="${btnIcon}" tabindex="-1" title="Quitar línea">${icon('x', 'w-4 h-4')}</button></td></tr>`;
      }).join('');
      tbody.querySelectorAll('tr').forEach(tr => {
        const i = Number(tr.dataset.i), l = f.lineas[i];
        const cuentaInp = tr.querySelector('[data-c=cuenta]');
        adjuntarSelectorCuenta(cuentaInp, hojas, (c) => { l.cuenta = c.codigo; actualizarNombre(tr, l); tr.querySelector('[data-c=descripcion]').focus(); });
        tr.querySelectorAll('input').forEach(inp => {
          inp.addEventListener('input', () => {
            const k = inp.dataset.c;
            l[k] = inp.value;
            if (k === 'cuenta') actualizarNombre(tr, l);
            if (k === 'debe' && num(inp.value) > 0) { l.haber = ''; tr.querySelector('[data-c=haber]').value = ''; }
            if (k === 'haber' && num(inp.value) > 0) { l.debe = ''; tr.querySelector('[data-c=debe]').value = ''; }
            pintarTotales();
          });
          inp.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.defaultPrevented) return;
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) return guardar(false);
            const k = inp.dataset.c;
            if (k === 'descripcion') tr.querySelector('[data-c=debe]').focus();
            else if (k === 'debe') (num(l.debe) > 0 ? siguienteLinea(i) : tr.querySelector('[data-c=haber]').focus());
            else if (k === 'haber') siguienteLinea(i);
          });
        });
        tr.querySelector('[data-del]').onclick = () => { if (f.lineas.length <= 2) { f.lineas[i] = linea(); } else f.lineas.splice(i, 1); pintarLineas(); };
      });
      pintarTotales();
      if (enfocar != null) { const tr = tbody.querySelector(`tr[data-i="${enfocar}"] [data-c=cuenta]`); if (tr) tr.focus(); }
    };

    const actualizarNombre = (tr, l) => {
      const n = nombreDe(l.cuenta); const s = tr.querySelector('[data-nom]');
      s.textContent = n.t; s.className = `block truncate ${n.ok ? '' : 'text-rose-600'}`;
      tr.querySelector('[data-c=cuenta]').classList.toggle('border-rose-300', !n.ok);
    };

    // Siguiente línea: reutiliza una vacía o crea una nueva con la descripción anterior y el monto que falta.
    const siguienteLinea = (i) => {
      const t = totales();
      const faltante = (l) => { if (t.dif > 0) l.haber = (t.dif / 100).toFixed(2); else if (t.dif < 0) l.debe = (-t.dif / 100).toFixed(2); };
      if (i + 1 < f.lineas.length && !f.lineas[i + 1].cuenta) {
        const l = f.lineas[i + 1];
        if (!l.descripcion) l.descripcion = f.lineas[i].descripcion;
        if (!num(l.debe) && !num(l.haber)) faltante(l);
        pintarLineas(i + 1); return;
      }
      const nueva = linea({ descripcion: f.lineas[i].descripcion });
      faltante(nueva);
      f.lineas.splice(i + 1, 0, nueva);
      pintarLineas(i + 1);
    };

    $('#ae-add').onclick = () => siguienteLinea(f.lineas.length - 1);
    $('#ae-cancel').onclick = () => cerrar();

    const leerCabecera = () => { f.numero = Number($('#ae-num').value); f.fecha = $('#ae-fecha').value; f.observacion = $('#ae-obs').value.trim(); };

    const guardar = async (nuevo) => {
      leerCabecera();
      const datos = { ...f, lineas: f.lineas.filter(l => l.cuenta || num(l.debe) || num(l.haber)).map(l => ({ cuenta: l.cuenta.trim(), descripcion: l.descripcion.trim(), debe: num(l.debe), haber: num(l.haber) })) };
      const errs = validarAsiento(datos, plan, { anio: Store.anio });
      const box = $('#ae-err');
      if (errs.length) { box.innerHTML = errs.map(e => `<p>• ${esc(e)}</p>`).join(''); box.classList.remove('hidden'); return; }
      box.classList.add('hidden');
      const repetido = Store.asientos.some(a => a.anio === Store.anio && !a.esCierre && a.numero === datos.numero && a.id !== f.id);
      if (repetido && !(await confirmar(`Ya existe una partida con el Nº ${datos.numero} en ${Store.anio}. ¿Guardar de todos modos?`, { si: 'Guardar igual' }))) return;
      const row = await Store.guardarAsiento(datos);
      ultimaFecha = row.fecha;
      toast(`Asiento Nº ${row.numero} guardado`);
      onGuardado(row);
      if (nuevo) {
        f.id = undefined; f.numero = Store.siguienteNumero(); f.observacion = ''; f.lineas = [linea(), linea()];
        $('#ae-num').value = f.numero; $('#ae-obs').value = ''; pintarLineas(0);
      } else cerrar();
    };
    $('#ae-save').onclick = () => guardar(false);
    const bn = $('#ae-nuevo'); if (bn) bn.onclick = () => guardar(true);
    $('#ae-fecha').addEventListener('change', () => { ultimaFecha = $('#ae-fecha').value; });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); guardar(false); } });

    pintarLineas(borrador || asiento ? null : 0);
    if (!borrador && !asiento) setTimeout(() => { const c = tbody.querySelector('[data-c=cuenta]'); if (c) c.focus(); }, 30);
  };

  abrirModal({ titulo, cuerpo, ancho: 'max-w-5xl', onMount: montar });
  return () => cerrarModal && cerrarModal();
}
