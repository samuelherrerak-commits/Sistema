// Genera un conjunto de asientos aleatorios (pero cuadrados) y los resultados que calcula el motor.
// Se usa para compararlos contra el SISTEMA.xlsm recalculado por LibreOffice (verify-contra-excel.py).
import { writeFileSync } from 'node:fs';
import { PLAN_BASE } from '../js/plan-base.js';
import { CLASES_DEFAULT, construirPlan, agregar, calcularAcumulados } from '../js/engine.js';

let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const plan = construirPlan(PLAN_BASE.map(([codigo, nombre]) => ({ codigo, nombre })), CLASES_DEFAULT);
const hojas = plan.lista.filter(c => c.hoja);

const asientos = [];
let numero = 1;
for (let i = 0; i < 700; i++) {
  const mes = 1 + Math.floor(rnd() * 12), dia = 1 + Math.floor(rnd() * 28);
  const fecha = `2023-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const nl = 2 + Math.floor(rnd() * 3);
  const lineas = [];
  let total = 0;
  for (let j = 0; j < nl - 1; j++) {
    const m = Math.round(rnd() * 500000) / 100 + 0.01;
    total = Math.round((total + m) * 100) / 100;
    lineas.push({ cuenta: pick(hojas).codigo, descripcion: 'mov ' + i, debe: j % 2 === 0 ? m : 0, haber: j % 2 === 0 ? 0 : m });
  }
  // última línea cuadra el asiento
  const d = lineas.reduce((s, l) => s + l.debe, 0), h = lineas.reduce((s, l) => s + l.haber, 0);
  const dif = Math.round((d - h) * 100) / 100;
  lineas.push({ cuenta: pick(hojas).codigo, descripcion: 'cuadre ' + i, debe: dif < 0 ? -dif : 0, haber: dif > 0 ? dif : 0 });
  asientos.push({ numero: numero++, fecha, observacion: '', lineas: lineas.filter(l => l.debe || l.haber) });
}
// saldos iniciales: algunas cuentas reales
const saldosIni = { '1101001': 1500.55, '1102002': 20000.1, '1103001': 340.07, '2101002': 5000.33, '3101002': 16841.39 };
const agg = agregar(asientos);
const acc = calcularAcumulados(plan, saldosIni, agg);
const out = { asientos, saldosIni, acumulados: {} };
for (const [codigo, a] of acc) out.acumulados[codigo] = a.meses.slice(1).map(m => [m.ant, m.debe, m.haber, m.saldo].map(x => x / 100));
writeFileSync(process.argv[2] || 'datos.json', JSON.stringify(out));
console.log('asientos', asientos.length, 'lineas', asientos.reduce((s, a) => s + a.lineas.length, 0), 'cuentas con datos', acc.size);
