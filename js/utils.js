export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function fmtNum(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Montos de estados financieros: negativos entre paréntesis, ceros como guion.
export function fmtMoney(val) {
  const n = Math.round((Number(val) || 0) * 100) / 100;
  if (Math.abs(n) < 0.005) return '—';
  return n < 0 ? `(${fmtNum(-n)})` : fmtNum(n);
}

export function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9));

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (formato que usa el Excel original).
export function fmtFecha(iso) {
  const s = String(iso || '');
  return s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s;
}

export function ultimoDia(mes, anio) {
  return new Date(anio, mes, 0).getDate();
}

// Acepta 'DD/MM/YYYY', 'D/M/YY' o ISO y devuelve ISO válido o ''.
export function parseFecha(txt) {
  const s = String(txt || '').trim();
  let y, m, d;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/))) {
    d = +r[1]; m = +r[2]; y = +r[3];
    if (y < 100) y += 2000;
  } else return '';
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Números escritos a mano: acepta "1.234,56" y "1,234.56".
export function parseMonto(txt) {
  let s = String(txt == null ? '' : txt).trim().replace(/\s/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// SheetJS se carga a demanda (igual que en CIFCalc) para no frenar el arranque.
const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let xlsxPromise = null;
export function ensureXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = XLSX_CDN;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { xlsxPromise = null; reject(new Error('No se pudo cargar la librería de Excel (¿sin internet?).')); };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

export function descargar(nombre, contenido, tipo = 'application/json') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
