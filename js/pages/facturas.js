// Bandeja de facturas: la IA (Claude, vía Apps Script) lee la factura y PROPONE un asiento;
// nada se contabiliza hasta que una persona lo revisa y aprueba. Los conectores externos
// (action "crearBorrador" del Apps Script) también dejan aquí sus propuestas.
import Store from '../store.js';
import Sync from '../sync.js';
import * as Sheets from '../sheets.js';
import { validarAsiento } from '../engine.js';
import { esc, fmtNum, fmtFecha } from '../utils.js';
import { icon } from '../components/icons.js';
import { card, btnPrimary, btnSecondary, btnIcon, badge, toast, confirmar } from '../components/ui.js';
import { abrirEditorAsiento } from '../components/asiento-editor.js';

// Reduce fotos grandes (los celulares sacan 5–10 MB) antes de enviarlas a la IA.
function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      const r = new FileReader();
      r.onload = () => resolve({ mime: file.type, data: String(r.result).split(',')[1] });
      r.onerror = reject; r.readAsDataURL(file); return;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error('Formato no soportado: usa foto (JPG/PNG/WEBP) o PDF.'));
    const img = new Image();
    img.onload = () => {
      const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    img.src = URL.createObjectURL(file);
  });
}

const Facturas = {
  async render(app, { envolver }) {
    let tab = 'pendiente';
    const { plan } = Store.calc();
    const hojas = plan.lista.filter(c => c.hoja);
    const iaLista = Sheets.configurado();

    const duplicada = (b) => Store.borradores.find(x => x.id !== b.id && x.estado !== 'rechazado' && b.rif && b.nro_factura && x.rif === b.rif && x.nro_factura === b.nro_factura);

    const pintar = () => {
      const lista = Store.borradores.filter(b => b.estado === tab).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const cuenta = (e) => Store.borradores.filter(b => b.estado === e).length;
      document.getElementById('fa-tabs').innerHTML = [['pendiente', 'Pendientes'], ['aprobado', 'Aprobadas'], ['rechazado', 'Rechazadas']].map(([k, t]) =>
        `<button data-tab="${k}" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'}">${t} (${cuenta(k)})</button>`).join('');
      document.getElementById('fa-lista').innerHTML = lista.length ? lista.map(b => {
        const errs = validarAsiento({ numero: 1, fecha: (b.asiento && b.asiento.fecha) || b.fecha, lineas: (b.asiento && b.asiento.lineas) || [] }, plan);
        const dup = duplicada(b);
        return `<div class="border border-slate-200 rounded-lg p-3 space-y-2 bg-white" data-id="${b.id}">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-semibold text-slate-900">${esc(b.proveedor || 'Sin proveedor')}</span>
            ${b.nro_factura ? `<span class="text-xs text-slate-500">Fact. ${esc(b.nro_factura)}</span>` : ''}${b.rif ? `<span class="text-xs text-slate-400">${esc(b.rif)}</span>` : ''}
            ${badge(b.origen === 'ia' ? 'blue' : b.origen === 'manual' ? 'slate' : 'violet', b.origen === 'ia' ? 'IA' : b.origen === 'manual' ? 'Manual' : esc(b.origen))}
            ${dup ? badge('amber', 'Posible duplicada') : ''}
            <span class="ml-auto text-xs text-slate-500">${b.fecha ? fmtFecha(b.fecha) : ''}</span><span class="font-mono tabular text-sm font-semibold">${b.total ? fmtNum(b.total) : ''} ${esc(b.moneda || '')}</span>
          </div>
          <table class="w-full text-xs"><tbody>${((b.asiento && b.asiento.lineas) || []).map(l => {
            const c = plan.porCodigo.get(String(l.cuenta));
            return `<tr class="border-t border-slate-100"><td class="py-1 font-mono text-slate-500 w-24 ${c ? '' : 'text-rose-600'}">${esc(l.cuenta)}</td><td class="py-1 ${c ? 'text-slate-700' : 'text-rose-600'}">${esc(c ? c.nombre : 'No existe en el plan')}</td><td class="py-1 text-right font-mono tabular text-blue-600 w-24">${Number(l.debe) ? fmtNum(l.debe) : ''}</td><td class="py-1 text-right font-mono tabular text-emerald-600 w-24">${Number(l.haber) ? fmtNum(l.haber) : ''}</td></tr>`;
          }).join('')}</tbody></table>
          ${b.nota ? `<p class="text-xs text-slate-500 bg-slate-50 rounded px-2 py-1">${esc(b.nota)}</p>` : ''}
          ${tab === 'pendiente' && errs.length ? `<p class="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">Requiere ajustes: ${esc(errs[0])}${errs.length > 1 ? ` (+${errs.length - 1} más)` : ''}</p>` : ''}
          <div class="flex justify-end gap-2">
            ${tab === 'pendiente' ? `<button data-rech class="${btnSecondary}">Rechazar</button><button data-apr class="${btnPrimary}">Revisar y aprobar</button>` : ''}
            ${tab !== 'pendiente' ? `<button data-rest class="${btnSecondary}">Volver a pendientes</button>` : ''}
            <button data-del class="${btnIcon} hover:!text-rose-600" title="Eliminar">${icon('trash', 'w-4 h-4')}</button>
          </div></div>`;
      }).join('') : `<p class="text-center text-sm text-slate-400 py-8">No hay facturas ${tab === 'pendiente' ? 'pendientes' : tab === 'aprobado' ? 'aprobadas' : 'rechazadas'}.</p>`;
    };

    app.innerHTML = envolver(`
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div><h1 class="text-xl font-semibold text-slate-900">Facturas con IA</h1><p class="text-xs text-slate-500">Sube la foto o PDF de una factura: la IA propone el asiento y tú lo apruebas. Nada se contabiliza sin tu revisión.</p></div>
        <button id="fa-act" class="${btnSecondary} self-start">Buscar propuestas nuevas</button>
      </div>
      <div class="${card} space-y-3">
        <div id="fa-drop" class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-400 transition cursor-pointer">
          <div class="text-blue-600 flex justify-center mb-2">${icon('sparkles', 'w-7 h-7')}</div>
          <p class="text-sm font-medium text-slate-800">Arrastra facturas aquí o haz clic para elegirlas</p>
          <p class="text-xs text-slate-400 mt-1">Foto (JPG/PNG/WEBP) o PDF · puedes subir varias</p>
          <input id="fa-file" type="file" multiple accept="image/*,application/pdf" class="hidden">
        </div>
        ${iaLista ? '' : `<p class="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">La lectura con IA necesita la conexión con Google Sheets (el Apps Script guarda la clave de Claude). <a href="#/conexion" class="underline">Configurar conexión</a>. Mientras tanto la bandeja recibe propuestas de otros conectores.</p>`}
        <div id="fa-prog" class="text-xs text-slate-500"></div>
      </div>
      <div id="fa-tabs" class="flex gap-2"></div>
      <div id="fa-lista" class="space-y-3"></div>`);

    const $ = (id) => document.getElementById(id);
    $('fa-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; pintar(); } });

    const procesar = async (files) => {
      if (!iaLista) return toast('Configura primero la conexión con Google Sheets para usar la IA.', 'aviso');
      const e = Store.empresa; let ok = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        $('fa-prog').textContent = `Leyendo ${f.name} (${i + 1} de ${files.length})…`;
        try {
          const { mime, data } = await leerArchivo(f);
          const r = await Sheets.extraerFactura({
            empresa_id: e.id, mime, data, plan: hojas.map(c => [c.codigo, c.nombre]),
            contexto: `La empresa contabilizada es "${e.nombre}"${e.rif ? ` (RIF ${e.rif})` : ''}. Si la factura está emitida A NOMBRE de esa empresa es una compra; si la emite esa empresa es una venta.`
          });
          const lineas = (r.lineas || []).map(l => ({ cuenta: String(l.cuenta || ''), descripcion: l.descripcion || r.observacion || '', debe: Number(l.debe) || 0, haber: Number(l.haber) || 0 }));
          await Store.guardarBorrador({
            origen: 'ia', fecha: r.fecha || '', proveedor: r.proveedor || '', rif: r.rif || '', nro_factura: r.nro_factura || '', total: Number(r.total) || 0, moneda: r.moneda || '',
            archivo: f.name, nota: [r.notas, r.confianza != null ? `Confianza de la IA: ${Math.round(r.confianza * 100)}%` : ''].filter(Boolean).join(' · '),
            asiento: { fecha: r.fecha || '', observacion: r.observacion || '', lineas }
          });
          ok++; pintar();
        } catch (err) { toast(`${f.name}: ${err.message}`, 'error'); }
      }
      $('fa-prog').textContent = ok ? `${ok} factura(s) agregadas a Pendientes.` : '';
      tab = 'pendiente'; pintar();
    };
    const fi = $('fa-file');
    $('fa-drop').onclick = () => fi.click();
    fi.onchange = () => { const l = [...fi.files]; fi.value = ''; if (l.length) procesar(l); };
    $('fa-drop').addEventListener('dragover', (e) => { e.preventDefault(); });
    $('fa-drop').addEventListener('drop', (e) => { e.preventDefault(); const l = [...e.dataTransfer.files]; if (l.length) procesar(l); });

    $('fa-act').onclick = async () => {
      try { const n = await Sync.bajarEmpresa(Store.empresa.id); toast(n ? `${n} cambio(s) traídos` : 'No hay propuestas nuevas'); pintar(); } catch (e) { toast(e.message, 'error'); }
    };

    $('fa-lista').addEventListener('click', async (e) => {
      const box = e.target.closest('[data-id]'); if (!box) return;
      const b = Store.borradores.find(x => x.id === box.dataset.id);
      if (e.target.closest('[data-apr]')) {
        abrirEditorAsiento({ borrador: b, onGuardado: async (row) => { await Store.guardarBorrador({ ...b, estado: 'aprobado', nota: `${b.nota ? b.nota + ' · ' : ''}Asiento Nº ${row.numero}` }); pintar(); } });
      } else if (e.target.closest('[data-rech]')) { await Store.guardarBorrador({ ...b, estado: 'rechazado' }); pintar(); }
      else if (e.target.closest('[data-rest]')) { await Store.guardarBorrador({ ...b, estado: 'pendiente' }); pintar(); }
      else if (e.target.closest('[data-del]') && await confirmar('¿Eliminar esta propuesta?', { si: 'Eliminar', peligro: true })) { await Store.eliminarBorrador(b.id); pintar(); }
    });
    pintar();
    return () => {};
  }
};
export default Facturas;
