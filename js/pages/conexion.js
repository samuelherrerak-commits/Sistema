import Sync from '../sync.js';
import * as Sheets from '../sheets.js';
import Store from '../store.js';
import { esc } from '../utils.js';
import { card, input, label, btnPrimary, btnSecondary, toast, confirmar } from '../components/ui.js';

// Tarjeta reutilizable (también aparece en Ajustes de la empresa).
export function tarjetaConexion() {
  const c = Sheets.getConexion();
  return `
  <div class="${card} space-y-3" id="card-conexion">
    <div><h2 class="text-sm font-semibold text-slate-900">Conexión con Google Sheets</h2>
    <p class="text-xs text-slate-500">Los datos se guardan siempre en este navegador. Si conectas Google Sheets, además se respaldan y se comparten entre equipos. Sin conexión todo sigue funcionando y se sube cuando vuelva internet.</p></div>
    <div><label class="${label}">URL de la aplicación web (termina en /exec)</label><input id="cx-url" class="${input}" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.url)}"></div>
    <div><label class="${label}">Token</label><input id="cx-token" type="password" class="${input}" autocomplete="off" value="${esc(c.token)}"></div>
    <label class="flex items-center gap-2 text-sm text-slate-700"><input id="cx-activo" type="checkbox" ${c.activo ? 'checked' : ''}> Sincronizar con Google Sheets</label>
    <div class="flex flex-wrap gap-2">
      <button id="cx-guardar" class="${btnPrimary}">Guardar y probar</button>
      <button id="cx-subir" class="${btnSecondary}" title="Sube todas las empresas guardadas en este navegador">Subir todo lo de este equipo</button>
      <button id="cx-ahora" class="${btnSecondary}">Sincronizar ahora</button>
    </div>
    <p id="cx-estado" class="text-xs text-slate-500"></p>
    <p class="text-[11px] text-slate-400">Instrucciones del Apps Script en <code>apps-script/Code.gs</code>. El token de este sitio estático no es un secreto fuerte: usa una hoja exclusiva para la contabilidad.</p>
  </div>`;
}

export function enlazarConexion(root) {
  const $ = (id) => root.querySelector('#' + id);
  const leer = () => ({ url: $('cx-url').value, token: $('cx-token').value, activo: $('cx-activo').checked });
  const estado = (t, mal) => { $('cx-estado').textContent = t; $('cx-estado').className = `text-xs ${mal ? 'text-rose-600' : 'text-slate-500'}`; };
  $('cx-guardar').onclick = async () => {
    Sheets.setConexion(leer());
    if (!leer().url || !leer().token) { await Sync.refrescarEstado(); return estado('Guardado. Sin URL/token la app trabaja solo en este equipo.'); }
    estado('Probando conexión…');
    try { const r = await Sheets.ping(); estado(`Conexión correcta (${r.tables.length} tablas).`); toast('Conexión correcta'); }
    catch (e) { estado(`No se pudo conectar: ${e.message}`, true); }
    await Sync.refrescarEstado();
  };
  $('cx-subir').onclick = async () => {
    Sheets.setConexion(leer());
    if (!(await confirmar('Se subirán a Google Sheets todas las empresas guardadas en este navegador. Puede tardar si hay muchos asientos. ¿Continuar?', { si: 'Subir' }))) return;
    try { estado('Subiendo…'); await Sync.subirTodo(); estado('Todo subido.'); toast('Datos subidos a Google Sheets'); } catch (e) { estado(e.message, true); }
  };
  $('cx-ahora').onclick = async () => {
    Sheets.setConexion(leer());
    try {
      estado('Sincronizando…');
      await Sync.subirCola();
      let n = await Sync.bajarEmpresas();
      for (const e of await Store.empresas()) n += await Sync.bajarEmpresa(e.id);
      estado(`Listo. ${n} registro(s) actualizados.`);
      toast(`Listo. ${n} registro(s) actualizados`);
      if (n) window.dispatchEvent(new Event('sc-remoto'));
    } catch (e) { estado(e.message, true); }
  };
}

const Conexion = {
  async render(app) {
    app.innerHTML = `<div class="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <a href="#/" class="text-xs text-blue-600">← Volver a las empresas</a>
      <h1 class="text-xl font-semibold text-slate-900">Conexión</h1>${tarjetaConexion()}</div>`;
    enlazarConexion(app);
    return () => {};
  }
};
export default Conexion;
