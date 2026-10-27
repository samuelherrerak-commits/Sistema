// Importa un archivo SISTEMA.xlsm/.xlsx del sistema original (hojas Parametros, Plan, Movimientos, Acumulados).
// Función pura: recibe la librería SheetJS y el contenido del archivo; no toca el DOM (se prueba en Node).
import { agruparFilas, CLASES_DEFAULT, CUENTA_RESULTADOS_DEFAULT } from './engine.js';
import { parseFecha } from './utils.js';

const serialAISO = (n) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const texto = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

export function importarExcel(XLSX, datos) {
  const wb = XLSX.read(datos, { type: 'array' });
  const avisos = [];
  const hoja = (n) => wb.Sheets[wb.SheetNames.find(x => x.toLowerCase() === n.toLowerCase())];
  const celda = (ws, a) => (ws && ws[a] ? ws[a].v : undefined);
  if (!hoja('Plan') || !hoja('Movimientos')) throw new Error('El archivo no parece un SISTEMA contable: faltan las hojas "Plan" y/o "Movimientos".');

  // Parámetros
  const P = hoja('Parametros');
  const nombre = texto(celda(P, 'A4')) || 'Empresa importada';
  const rif = texto(celda(P, 'A6'));
  const anioP = Number(celda(P, 'C4')) || 0;
  const cuentaRes = texto(celda(P, 'D4')) || CUENTA_RESULTADOS_DEFAULT;
  const clases = [];
  if (P) for (let r = 20; r <= 40; r++) {
    const dig = texto(celda(P, 'A' + r));
    if (!dig) break;
    clases.push({ digito: dig, abrev: texto(celda(P, 'B' + r)), nombre: texto(celda(P, 'C' + r)), tipo: texto(celda(P, 'F' + r)) || 'D', clase: texto(celda(P, 'G' + r)) || 'N' });
  }

  // Plan (A: cuenta, B: nombre desde la fila 4)
  const PL = hoja('Plan');
  const cuentas = [], filaPlan = [];
  for (let r = 4; r <= 2000; r++) {
    const c = texto(celda(PL, 'A' + r));
    if (!c) continue;
    cuentas.push({ codigo: c, nombre: texto(celda(PL, 'B' + r)) });
    filaPlan.push([r, c]);
  }

  // Saldos iniciales: Acumulados!F alineada fila a fila con Plan
  const saldos = {};
  const AC = hoja('Acumulados');
  if (AC) for (const [r, c] of filaPlan) {
    const v = Number(celda(AC, 'F' + r));
    if (v) saldos[c] = Math.round(v * 100) / 100;
  }

  // Movimientos (A partida, C fecha, D cuenta, F descripción, G debe, H haber)
  const M = hoja('Movimientos');
  const filas = [];
  const rango = XLSX.utils.decode_range(M['!ref']);
  let sinFecha = 0, sinCuenta = 0;
  for (let r = 3; r <= rango.e.r + 1; r++) {
    const cuenta = texto(celda(M, 'D' + r));
    const debe = Number(celda(M, 'G' + r)) || 0, haber = Number(celda(M, 'H' + r)) || 0;
    if (!cuenta) { if (debe || haber) sinCuenta++; continue; }
    const fv = celda(M, 'C' + r);
    const fecha = typeof fv === 'number' ? serialAISO(fv) : parseFecha(fv);
    if (!fecha) { sinFecha++; continue; }
    const cm = M['D' + r] && M['D' + r].c && M['D' + r].c[0] ? texto(M['D' + r].c[0].t).replace(/^.*Observacion\s*/i, '') : '';
    filas.push({ partida: Number(celda(M, 'A' + r)) || 0, fecha, cuenta, descripcion: texto(celda(M, 'F' + r)), debe, haber, observacion: cm });
  }
  if (sinCuenta) avisos.push(`${sinCuenta} fila(s) con monto pero sin cuenta se omitieron.`);
  if (sinFecha) avisos.push(`${sinFecha} fila(s) con fecha inválida se omitieron.`);
  const asientos = agruparFilas(filas);

  const conteo = {};
  for (const a of asientos) { const y = a.fecha.slice(0, 4); conteo[y] = (conteo[y] || 0) + 1; }
  const anioDatos = Number(Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0]) || 0;
  const anio = anioDatos || anioP || new Date().getFullYear();
  if (anioDatos && anioP && anioDatos !== anioP) avisos.push(`El archivo dice ejercicio ${anioP} pero la mayoría de los asientos son de ${anioDatos}; se usó ${anioDatos}.`);

  return { empresa: { nombre, rif, anio, cuenta_resultados: cuentaRes, ...(clases.length ? { clases } : { clases: CLASES_DEFAULT }) }, cuentas, asientos, saldos, avisos };
}

// Hoja "Movimientos" con el mismo orden de columnas del Excel original (para entregar al cliente o volver al Excel).
export function filasMovimientos(asientos) {
  const filas = [['Partida', 'Línea', 'Fecha', 'Cuenta', 'Nombre', 'Descripción', 'Debe', 'Haber', 'Mes']];
  return { filas, add(plan, a) { a.lineas.forEach((l, i) => filas.push([a.numero, i + 1, a.fecha.split('-').reverse().join('/'), l.cuenta, (plan.porCodigo.get(l.cuenta) || {}).nombre || '', l.descripcion || '', l.debe || 0, l.haber || 0, Number(a.fecha.slice(5, 7))])); } };
}
