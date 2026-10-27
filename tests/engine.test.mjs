import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_BASE } from '../js/plan-base.js';
import { CLASES_DEFAULT, construirPlan, agregar, calcularAcumulados, balanceComprobacion, estadoSituacion, estadoResultados, asientoCierre, saldosNuevoEjercicio, validarAsiento, libroMayor, libroDiario, agruparFilas, diagnostico } from '../js/engine.js';
import { parseMonto, parseFecha } from '../js/utils.js';

const cuentas = PLAN_BASE.map(([codigo, nombre]) => ({ codigo, nombre }));
const plan = construirPlan(cuentas, CLASES_DEFAULT);
const A = (numero, fecha, lineas, extra = {}) => ({ id: `a${numero}`, numero, fecha, observacion: '', lineas: lineas.map(([cuenta, debe, haber]) => ({ cuenta, descripcion: '', debe, haber })), ...extra });
const calc = (asientos, ini = {}) => { const acc = calcularAcumulados(plan, ini, agregar(asientos)); return acc; };

// El ejemplo que traía el Excel original en el Libro Diario: aporte inicial 1050.
const aporte = A(1, '2024-10-22', [['1102002', 100, 0], ['1103001', 300, 0], ['1201007', 150, 0], ['1201003', 500, 0], ['3101002', 0, 1050]]);

test('jerarquía del plan: padres, hojas y clases', () => {
  assert.equal(plan.lista.length, 302);
  assert.equal(plan.porCodigo.get('1101001').padre, '1101');
  assert.equal(plan.porCodigo.get('1101').padre, '11');
  assert.equal(plan.porCodigo.get('11').padre, '1');
  assert.ok(plan.porCodigo.get('1101001').hoja && !plan.porCodigo.get('1101').hoja);
  assert.equal(plan.porCodigo.get('2101002').tipo, 'A');
  assert.equal(plan.porCodigo.get('6104001').clase, 'N');
});

test('balance de comprobación del aporte inicial cuadra (igual que el Excel)', () => {
  const bc = balanceComprobacion(calc([aporte]), 10, 10);
  assert.equal(bc.filas.length, 5);
  assert.equal(bc.totales.debe, 1050); assert.equal(bc.totales.haber, 1050);
  assert.equal(bc.cuadra, true);
});

test('saldo inicial + movimientos arrastran mes a mes', () => {
  const acc = calc([A(1, '2024-01-10', [['1101001', 100, 0], ['4101003', 0, 100]]), A(2, '2024-03-05', [['1101001', 0, 30], ['6104023', 30, 0]])], { '1101001': 1000, '3101002': 1000 });
  const caja = acc.get('1101001');
  assert.deepEqual([caja.meses[1].ant, caja.meses[1].saldo, caja.meses[2].saldo, caja.meses[3].saldo, caja.meses[12].saldo], [100000, 110000, 110000, 107000, 107000]);
});

test('estado de situación cuadra e incluye el resultado en patrimonio', () => {
  const asientos = [aporte, A(2, '2024-11-02', [['1101001', 800, 0], ['4101003', 0, 800]]), A(3, '2024-11-05', [['6104023', 250.75, 0], ['1101001', 0, 250.75]])];
  const acc = calc(asientos);
  const esf = estadoSituacion(plan, acc, 1, 12);
  assert.equal(esf.resultado, 549.25);
  assert.equal(esf.totalActivo, 1050 + 800 - 250.75);
  assert.equal(esf.totalPatrimonio, 1050 + 549.25);
  assert.equal(esf.cuadra, true);
  const er = estadoResultados(plan, acc, 1, 12);
  assert.equal(er.utilidad, 549.25); assert.equal(er.esUtilidad, true);
});

test('estado de resultados de un mes suelto muestra solo ese mes', () => {
  const acc = calc([A(1, '2024-01-10', [['1101001', 100, 0], ['4101003', 0, 100]]), A(2, '2024-02-10', [['1101001', 40, 0], ['4101003', 0, 40]])]);
  assert.equal(estadoResultados(plan, acc, 2, 2).utilidad, 40);
  assert.equal(estadoResultados(plan, acc, 1, 2).utilidad, 140);
});

test('asiento de cierre salda las nominales y el resultado; con pérdida invierte', () => {
  const acc = calc([aporte, A(2, '2024-05-02', [['1101001', 100, 0], ['4101003', 0, 100]]), A(3, '2024-05-03', [['6104023', 340, 0], ['1101001', 0, 340]])]);
  const c = asientoCierre(plan, acc, 2024);
  assert.equal(c.cuadra, true); assert.equal(c.resultado, -240);
  const res = c.lineas.at(-1);
  assert.equal(res.cuenta, '3103002'); assert.equal(res.debe, 240); assert.equal(res.haber, 0);
  // nominal con saldo "al revés" también se cierra (el Excel lo dejaba abierto)
  const raro = asientoCierre(plan, calc([A(1, '2024-05-01', [['4101003', 50, 0], ['1101001', 0, 50]])]), 2024);
  assert.equal(raro.cuadra, true); assert.equal(raro.lineas.length, 2);
});

test('reportes dan igual antes y después de contabilizar el cierre', () => {
  const base = [aporte, A(2, '2024-05-02', [['1101001', 100, 0], ['4101003', 0, 100]])];
  const c = asientoCierre(plan, calc(base), 2024);
  const conCierre = [...base, A(3, '2024-12-31', c.lineas.map(l => [l.cuenta, l.debe, l.haber]), { esCierre: true })];
  const x = estadoSituacion(plan, calc(base), 1, 12), y = estadoSituacion(plan, calcularAcumulados(plan, {}, agregar(conCierre, { incluirCierre: false })), 1, 12);
  assert.deepEqual([x.totalActivo, x.totalPatrimonio, x.resultado], [y.totalActivo, y.totalPatrimonio, y.resultado]);
  // y si se incluye el cierre, el balance también cuadra (el resultado pasa a la cuenta 3103002)
  const z = estadoSituacion(plan, calcularAcumulados(plan, {}, agregar(conCierre, { incluirCierre: true })), 1, 12);
  assert.equal(z.cuadra, true); assert.equal(z.totalPatrimonio, x.totalPatrimonio);
});

test('nuevo ejercicio arrastra saldos reales y el resultado', () => {
  const acc = calc([aporte, A(2, '2024-05-02', [['1101001', 100, 0], ['4101003', 0, 100]])]);
  const s = saldosNuevoEjercicio(plan, acc);
  assert.equal(s['1101001'], 100); assert.equal(s['3103002'], 100); assert.equal(s['4101003'], undefined);
  const esf = estadoSituacion(plan, calc([], s), 1, 12);
  assert.equal(esf.cuadra, true); assert.equal(esf.totalActivo, 1150);
});

test('libro mayor: saldo corrido y saldo anterior por mes', () => {
  const asientos = [A(1, '2024-01-10', [['1101001', 100, 0], ['4101003', 0, 100]]), A(2, '2024-02-05', [['1101001', 0, 30], ['6104023', 30, 0]]), A(3, '2024-02-06', [['1101001', 10, 0], ['4101003', 0, 10]])];
  const m = libroMayor(calc(asientos), asientos, 2, 2, { cuenta: '1101001' });
  assert.equal(m.length, 1); assert.equal(m[0].saldoAnterior, 100);
  assert.deepEqual(m[0].movs.map(x => x.saldo), [70, 80]); assert.equal(m[0].saldoFinal, 80);
});

test('libro diario ordena por fecha y número', () => {
  const d = libroDiario([A(2, '2024-02-01', [['1101001', 1, 0], ['4101003', 0, 1]]), A(1, '2024-01-01', [['1101001', 1, 0], ['4101003', 0, 1]])], plan, 1, 12);
  assert.deepEqual(d.asientos.map(a => a.numero), [1, 2]); assert.equal(d.totales.debe, 2);
});

test('sin errores de coma flotante (centavos)', () => {
  const l = []; for (let i = 0; i < 1000; i++) { l.push(A(i + 1, '2024-01-15', [['1101001', 0.1, 0], ['4101003', 0, 0.1]])); }
  const acc = calc(l); assert.equal(acc.get('1101001').meses[1].saldo, 10000);
  assert.equal(balanceComprobacion(acc, 1, 1).cuadra, true);
});

test('validación de asientos', () => {
  const v = (a) => validarAsiento(a, plan, { anio: 2024 });
  assert.deepEqual(v(A(1, '2024-01-01', [['1101001', 5, 0], ['4101003', 0, 5]])), []);
  assert.ok(v(A(1, '2024-01-01', [['1101001', 5, 0], ['4101003', 0, 4]])).some(e => /descuadrado/.test(e)));
  assert.ok(v(A(1, '2024-01-01', [['1101', 5, 0], ['4101003', 0, 5]])).some(e => /cuenta de grupo/.test(e)));
  assert.ok(v(A(1, '2024-01-01', [['9999999', 5, 0], ['4101003', 0, 5]])).some(e => /no existe/.test(e)));
  assert.ok(v(A(1, '2023-01-01', [['1101001', 5, 0], ['4101003', 0, 5]])).some(e => /ejercicio/.test(e)));
  assert.ok(v(A(1, '2024-01-01', [['1101001', 5, 5], ['4101003', 0, 0]])).length >= 2);
  assert.ok(v(A(1, '2024-01-01', [['1101001', 5, 0]])).some(e => /al menos 2/.test(e)));
});

test('importación: filas planas se agrupan por partida y fecha', () => {
  const f = [{ partida: 1, fecha: '2024-01-01', cuenta: '1101001', debe: 5, haber: 0 }, { partida: 1, fecha: '2024-01-01', cuenta: '4101003', debe: 0, haber: 5 }, { partida: 1, fecha: '2024-01-02', cuenta: '1101001', debe: 1, haber: 0 }, { partida: 2, fecha: '2024-01-02', cuenta: '4101003', debe: 0, haber: 1 }];
  assert.deepEqual(agruparFilas(f).map(a => a.lineas.length), [2, 1, 1]);
});

test('diagnóstico detecta cuentas huérfanas y descuadres', () => {
  const d = diagnostico(plan, [A(1, '2024-01-01', [['1101001', 5, 0], ['9999999', 0, 4]])]);
  assert.ok(d.some(x => /descuadrado/.test(x.texto)) && d.some(x => /no existen/.test(x.texto)));
});

test('parseo de montos y fechas escritos a mano', () => {
  assert.equal(parseMonto('1.234,56'), 1234.56); assert.equal(parseMonto('1,234.56'), 1234.56); assert.equal(parseMonto('12,5'), 12.5); assert.equal(parseMonto(''), 0); assert.ok(isNaN(parseMonto('abc')));
  assert.equal(parseFecha('05/03/2024'), '2024-03-05'); assert.equal(parseFecha('31/02/2024'), ''); assert.equal(parseFecha('2024-03-05'), '2024-03-05');
});

test('rendimiento: 100.000 líneas calculadas y reportadas en menos de 1.5 s', () => {
  const hojas = plan.lista.filter(c => c.hoja); const as = [];
  for (let i = 0; i < 50000; i++) { const m = 1 + (i % 12); const a = hojas[i % hojas.length].codigo, b = hojas[(i * 7 + 3) % hojas.length].codigo; as.push(A(i + 1, `2024-${String(m).padStart(2, '0')}-10`, [[a, 12.34, 0], [b, 0, 12.34]])); }
  const t = performance.now();
  const acc = calc(as); balanceComprobacion(acc, 1, 12); estadoSituacion(plan, acc, 1, 12); estadoResultados(plan, acc, 1, 12);
  const ms = performance.now() - t; console.log(`   100.000 líneas: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 1500);
});
