// Motor contable puro (sin DOM ni almacenamiento): réplica de la lógica del SISTEMA.xlsm
// de Asesores A. Pinto, pero calculando todo en una sola pasada en vez de miles de SUMIFS.
//
// Lógica original (hojas Excel → función):
//   Parametros (tabla de clases)  → CLASES_DEFAULT / infoCuenta
//   Plan (jerarquía por código)   → construirPlan
//   Movimientos + Acumulados      → agregar + calcularAcumulados  (Saldo anterior / Debe / Haber / Saldo por mes)
//   Libro Diario                  → libroDiario
//   Libro Mayor                   → libroMayor
//   Balance Comprobacion          → balanceComprobacion
//   ESTADO DE SITUACION FINANC.   → estadoSituacion
//   ESTADO DE RESULTADOS          → estadoResultados
//   Asiento Cierre                → asientoCierre
//
// Todos los montos se acumulan en CENTAVOS enteros para que nunca haya errores de coma
// flotante; las funciones públicas devuelven números normales (centavos / 100).

// ── Parámetros por defecto (hoja Parametros, tabla A19:G27) ─────────────────────────────
// tipo: D = saldo deudor, A = saldo acreedor. clase: R = cuenta real (balance), N = nominal (resultados).
export const CLASES_DEFAULT = [
  { digito: '1', abrev: 'A', nombre: 'ACTIVO', tipo: 'D', clase: 'R' },
  { digito: '2', abrev: 'P', nombre: 'PASIVO', tipo: 'A', clase: 'R' },
  { digito: '3', abrev: 'C', nombre: 'PATRIMONIO', tipo: 'A', clase: 'R' },
  { digito: '4', abrev: 'I', nombre: 'INGRESOS', tipo: 'A', clase: 'N' },
  { digito: '5', abrev: 'CV', nombre: 'COSTO DE VENTAS', tipo: 'D', clase: 'N' },
  { digito: '6', abrev: 'E', nombre: 'EGRESOS O GASTOS', tipo: 'D', clase: 'N' },
  { digito: '7', abrev: 'OI', nombre: 'OTROS INGRESOS', tipo: 'A', clase: 'N' },
  { digito: '8', abrev: 'OE', nombre: 'OTROS EGRESOS', tipo: 'D', clase: 'N' }
];

export const CUENTA_RESULTADOS_DEFAULT = '3103002';

export const cent = (v) => Math.round(+((Number(v) || 0) * 100).toFixed(4));
const dec = (c) => c / 100;

// ── Plan de cuentas ────────────────────────────────────────────────────────────────────
// La jerarquía sale del propio código: el padre es el prefijo más largo que exista en el plan
// (1 → 11 → 1101 → 1101001). Solo las cuentas sin hijas ("de movimiento") reciben asientos.
export function construirPlan(cuentas, clases = CLASES_DEFAULT) {
  const porDigito = new Map(clases.map(c => [String(c.digito), c]));
  const lista = cuentas
    .map(c => ({ codigo: String(c.codigo).trim(), nombre: String(c.nombre || '').trim() }))
    .filter(c => c.codigo)
    .sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
  const porCodigo = new Map();
  for (const c of lista) porCodigo.set(c.codigo, c);
  const hijos = new Map();
  for (const c of lista) {
    c.padre = null;
    for (let n = c.codigo.length - 1; n >= 1; n--) {
      const p = c.codigo.slice(0, n);
      if (porCodigo.has(p)) { c.padre = p; break; }
    }
    if (c.padre) {
      if (!hijos.has(c.padre)) hijos.set(c.padre, []);
      hijos.get(c.padre).push(c.codigo);
    }
  }
  for (const c of lista) {
    const cl = porDigito.get(c.codigo[0]);
    c.tipo = cl ? cl.tipo : 'D';
    c.clase = cl ? cl.clase : 'N';
    c.abrev = cl ? cl.abrev : '?';
    c.definida = !!cl;
    c.hoja = !hijos.has(c.codigo);
    c.nivel = 1;
    for (let p = c.padre; p; p = porCodigo.get(p).padre) c.nivel++;
  }
  return { lista, porCodigo, hijos, clases, porDigito };
}

// Info de una cuenta aunque no esté en el plan (asientos importados con códigos huérfanos).
export function infoCuenta(plan, codigo) {
  const c = plan.porCodigo.get(codigo);
  if (c) return c;
  const cl = plan.porDigito.get(String(codigo)[0]);
  return { codigo, nombre: '(cuenta no existe en el plan)', tipo: cl ? cl.tipo : 'D', clase: cl ? cl.clase : 'N', abrev: cl ? cl.abrev : '?', hoja: true, definida: !!cl, huerfana: true };
}

// ── Agregación (hoja Movimientos → totales por cuenta y mes) ───────────────────────────
// opciones.incluirCierre=false (por defecto) ignora los asientos de cierre para que los
// reportes den igual antes y después de contabilizar el cierre.
export function agregar(asientos, { incluirCierre = false } = {}) {
  const agg = new Map();
  for (const a of asientos) {
    if (a.esCierre && !incluirCierre) continue;
    const mes = Number(String(a.fecha).slice(5, 7));
    if (!(mes >= 1 && mes <= 12)) continue;
    for (const l of a.lineas) {
      const d = cent(l.debe), h = cent(l.haber);
      if (!d && !h) continue;
      let e = agg.get(l.cuenta);
      if (!e) { e = { d: new Float64Array(13), h: new Float64Array(13) }; agg.set(l.cuenta, e); }
      e.d[mes] += d;
      e.h[mes] += h;
    }
  }
  return agg;
}

// ── Acumulados (hoja Acumulados: Saldo anterior, Debe, Haber, Saldo por mes) ───────────
// saldosIni: { codigo: monto } en la naturaleza de la cuenta (columna "Saldo Inicial").
export function calcularAcumulados(plan, saldosIni, agg) {
  const codigos = new Set([...agg.keys(), ...Object.keys(saldosIni || {}).filter(k => cent(saldosIni[k]) !== 0)]);
  const acc = new Map();
  for (const codigo of codigos) {
    const info = infoCuenta(plan, codigo);
    const ini = cent((saldosIni || {})[codigo]);
    const e = agg.get(codigo);
    const meses = new Array(13);
    let ant = ini;
    for (let m = 1; m <= 12; m++) {
      const debe = e ? e.d[m] : 0, haber = e ? e.h[m] : 0;
      const saldo = info.tipo === 'D' ? ant + debe - haber : ant + haber - debe;
      meses[m] = { ant, debe, haber, saldo };
      ant = saldo;
    }
    acc.set(codigo, { codigo, nombre: info.nombre, tipo: info.tipo, clase: info.clase, abrev: info.abrev, ini, meses, huerfana: !!info.huerfana });
  }
  return acc;
}

// Totales de una cuenta en [mes, hasta] (centavos).
function rango(a, mes, hasta) {
  let debe = 0, haber = 0;
  for (let m = mes; m <= hasta; m++) { debe += a.meses[m].debe; haber += a.meses[m].haber; }
  return { ant: a.meses[mes].ant, debe, haber, saldo: a.meses[hasta].saldo };
}

const porCodigoAsc = (x, y) => (x.codigo < y.codigo ? -1 : x.codigo > y.codigo ? 1 : 0);

// ── Balance de comprobación ────────────────────────────────────────────────────────────
export function balanceComprobacion(acc, mes, hasta) {
  const filas = [];
  let tDebe = 0, tHaber = 0, tAnt = 0, tSaldo = 0, tDeudor = 0, tAcreedor = 0;
  for (const a of [...acc.values()].sort(porCodigoAsc)) {
    const r = rango(a, mes, hasta);
    if (!r.ant && !r.debe && !r.haber) continue; // igual que el Excel: con saldo anterior o con movimiento
    filas.push({ codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, ant: dec(r.ant), debe: dec(r.debe), haber: dec(r.haber), saldo: dec(r.saldo) });
    tDebe += r.debe; tHaber += r.haber;
    // Totales con signo (deudoras +, acreedoras −): dan 0 si la contabilidad cuadra.
    tAnt += a.tipo === 'D' ? r.ant : -r.ant;
    tSaldo += a.tipo === 'D' ? r.saldo : -r.saldo;
    if (a.tipo === 'D') tDeudor += r.saldo; else tAcreedor += r.saldo;
  }
  return {
    filas,
    totales: { debe: dec(tDebe), haber: dec(tHaber), ant: dec(tAnt), saldo: dec(tSaldo), deudor: dec(tDeudor), acreedor: dec(tAcreedor) },
    cuadra: tDebe === tHaber && tSaldo === 0
  };
}

// ── Libro diario ───────────────────────────────────────────────────────────────────────
const ordenAsiento = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (Number(a.numero) - Number(b.numero)) || ((a.seq || 0) - (b.seq || 0)));

export function libroDiario(asientos, plan, mes, hasta, { incluirCierre = false } = {}) {
  const sel = asientos
    .filter(a => (incluirCierre || !a.esCierre) && inMeses(a.fecha, mes, hasta))
    .sort(ordenAsiento);
  let tD = 0, tH = 0;
  const lista = sel.map(a => {
    let d = 0, h = 0;
    const lineas = a.lineas.map(l => {
      d += cent(l.debe); h += cent(l.haber);
      return { cuenta: l.cuenta, nombre: infoCuenta(plan, l.cuenta).nombre, descripcion: l.descripcion || '', debe: Number(l.debe) || 0, haber: Number(l.haber) || 0 };
    });
    tD += d; tH += h;
    return { id: a.id, numero: a.numero, fecha: a.fecha, observacion: a.observacion || '', esCierre: !!a.esCierre, lineas, debe: dec(d), haber: dec(h) };
  });
  return { asientos: lista, totales: { debe: dec(tD), haber: dec(tH) } };
}

function inMeses(fecha, mes, hasta) {
  const m = Number(String(fecha).slice(5, 7));
  return m >= mes && m <= hasta;
}

// ── Libro mayor ────────────────────────────────────────────────────────────────────────
export function libroMayor(acc, asientos, mes, hasta, { cuenta = '', incluirCierre = false } = {}) {
  const porCuenta = new Map();
  for (const as of asientos) {
    if (as.esCierre && !incluirCierre) continue;
    if (!inMeses(as.fecha, mes, hasta)) continue;
    as.lineas.forEach((l, i) => {
      if (cuenta && l.cuenta !== cuenta) return;
      if (!cent(l.debe) && !cent(l.haber)) return;
      let arr = porCuenta.get(l.cuenta);
      if (!arr) porCuenta.set(l.cuenta, arr = []);
      arr.push({ as, i, l });
    });
  }
  const cuentas = [];
  for (const a of [...acc.values()].sort(porCodigoAsc)) {
    if (cuenta && a.codigo !== cuenta) continue;
    const r = rango(a, mes, hasta);
    if (!r.ant && !r.debe && !r.haber) continue;
    const items = (porCuenta.get(a.codigo) || []).sort((x, y) => ordenAsiento(x.as, y.as) || x.i - y.i);
    let saldo = r.ant;
    const movs = items.map(({ as, l }) => {
      const d = cent(l.debe), h = cent(l.haber);
      saldo += a.tipo === 'D' ? d - h : h - d;
      return { fecha: as.fecha, numero: as.numero, descripcion: l.descripcion || as.observacion || '', debe: dec(d), haber: dec(h), saldo: dec(saldo), esCierre: !!as.esCierre };
    });
    cuentas.push({ codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, saldoAnterior: dec(r.ant), movs, debe: dec(r.debe), haber: dec(r.haber), saldoFinal: dec(r.saldo) });
  }
  return cuentas;
}

// ── Estados financieros ────────────────────────────────────────────────────────────────
// Árbol del plan filtrado por clase (A, P, C, I, CV, E, OI, OE). `montoDe(acc)` da el importe
// de cada cuenta de movimiento y `activa(acc)` dice si se muestra. Los grupos sin cuentas
// activas se podan (el Excel los ocultaba con Rows.Hidden).
function filasArbol(plan, acc, abrev, montoDe, activa, extra = null) {
  const filas = [];
  const raices = plan.lista.filter(c => !c.padre && c.abrev === abrev);
  // cuentas con datos cuyo código no está en el plan se muestran al final de su sección
  const huerfanas = [...acc.values()].filter(a => a.huerfana && a.abrev === abrev && activa(a));

  const visitar = (codigo, esRaiz) => {
    const c = plan.porCodigo.get(codigo);
    const hs = plan.hijos.get(codigo);
    if (!hs) {
      const a = acc.get(codigo);
      const ex = extra && extra.codigo === codigo ? extra : null;
      if ((!a || !activa(a)) && !ex) return { monto: 0, altura: 0, mostrado: false };
      const monto = (a && activa(a) ? montoDe(a) : 0) + (ex ? ex.monto : 0);
      filas.push({ tipo: 'cuenta', codigo, nombre: c.nombre, monto, col: 1, nivel: c.nivel });
      return { monto, altura: 0, mostrado: true };
    }
    const inicio = filas.length;
    if (!esRaiz) filas.push({ tipo: 'grupo', codigo, nombre: c.nombre, nivel: c.nivel });
    let monto = 0, altura = 0, mostrado = false;
    for (const h of hs) {
      const r = visitar(h, false);
      if (r.mostrado) { monto += r.monto; altura = Math.max(altura, r.altura + 1); mostrado = true; }
    }
    if (!mostrado) { filas.length = inicio; return { monto: 0, altura: 0, mostrado: false }; }
    if (!esRaiz) filas.push({ tipo: 'total', codigo, nombre: `TOTAL DE ${c.nombre}`, monto, col: Math.min(3, 1 + altura), nivel: c.nivel });
    return { monto, altura, mostrado: true };
  };

  let total = 0;
  for (const r of raices) total += visitar(r.codigo, true).monto;
  if (extra && extra.codigo && !plan.porCodigo.has(extra.codigo) && extra.monto) {
    filas.push({ tipo: 'cuenta', codigo: extra.codigo, nombre: extra.nombre, monto: extra.monto, col: 1, nivel: 9 });
    total += extra.monto;
  }
  for (const a of huerfanas) {
    const m = montoDe(a);
    filas.push({ tipo: 'cuenta', codigo: a.codigo, nombre: `${a.nombre}`, monto: m, col: 1, nivel: 9, huerfana: true });
    total += m;
  }
  return { filas, total };
}

// Resultado acumulado del año a un mes: Σ nominales acreedoras − Σ nominales deudoras (centavos).
function resultadoAcumulado(acc, hasta) {
  let r = 0;
  for (const a of acc.values()) {
    if (a.clase !== 'N') continue;
    r += a.tipo === 'A' ? a.meses[hasta].saldo : -a.meses[hasta].saldo;
  }
  return r;
}

export function estadoSituacion(plan, acc, mes, hasta, cuentaResultados = CUENTA_RESULTADOS_DEFAULT) {
  const activa = (a) => {
    if (a.clase !== 'R') return false;
    const r = rango(a, mes, hasta);
    return r.saldo !== 0 || r.ant !== 0 || r.debe !== 0 || r.haber !== 0;
  };
  const monto = (a) => a.meses[hasta].saldo;
  const resultado = resultadoAcumulado(acc, hasta);

  const act = filasArbol(plan, acc, 'A', monto, activa);
  const pas = filasArbol(plan, acc, 'P', monto, activa);
  // El resultado del ejercicio se suma a la línea de su cuenta de patrimonio (o se agrega si no existe).
  const nombreRes = plan.porCodigo.has(cuentaResultados) ? plan.porCodigo.get(cuentaResultados).nombre : 'Resultado del ejercicio';
  const pat = filasArbol(plan, acc, 'C', monto, activa, { codigo: cuentaResultados, nombre: nombreRes, monto: resultado });
  const T = (c) => dec(c);
  const rows = (f) => f.map(x => ({ ...x, monto: x.monto != null ? dec(x.monto) : undefined }));
  const totalActivo = act.total, totalPasivo = pas.total, totalPatrimonio = pat.total;
  const dif = totalActivo - (totalPasivo + totalPatrimonio);
  return {
    secciones: [
      { abrev: 'A', titulo: 'ACTIVOS', filas: rows(act.filas), total: T(totalActivo), etiquetaTotal: 'TOTAL DE ACTIVOS' },
      { abrev: 'P', titulo: 'PASIVOS', filas: rows(pas.filas), total: T(totalPasivo), etiquetaTotal: 'TOTAL DE PASIVOS' },
      { abrev: 'C', titulo: 'PATRIMONIO', filas: rows(pat.filas), total: T(totalPatrimonio), etiquetaTotal: 'TOTAL DE PATRIMONIO' }
    ],
    resultado: T(resultado),
    totalActivo: T(totalActivo),
    totalPasivo: T(totalPasivo),
    totalPatrimonio: T(totalPatrimonio),
    totalPasivoPatrimonio: T(totalPasivo + totalPatrimonio),
    diferencia: T(dif),
    cuadra: dif === 0
  };
}

export const TITULOS_RESULTADOS = { I: 'INGRESOS', CV: 'COSTO DE VENTAS', E: 'EGRESOS', OI: 'OTROS INGRESOS', OE: 'OTROS EGRESOS' };

// Estado de resultados del periodo [mes, hasta]: movimiento neto de cada cuenta nominal en su
// naturaleza. (El Excel mostraba el saldo acumulado desde enero aunque se pidiera un mes suelto;
// aquí un mes suelto muestra solo ese mes. Para enero–hasta el resultado es idéntico.)
export function estadoResultados(plan, acc, mes, hasta) {
  const neto = (a) => { const r = rango(a, mes, hasta); return a.tipo === 'A' ? r.haber - r.debe : r.debe - r.haber; };
  const activa = (a) => { if (a.clase !== 'N') return false; const r = rango(a, mes, hasta); return r.debe !== 0 || r.haber !== 0; };
  const sec = {};
  for (const ab of Object.keys(TITULOS_RESULTADOS)) sec[ab] = filasArbol(plan, acc, ab, neto, activa);
  const t = (ab) => sec[ab].total;
  const bruta = t('I') - t('CV');
  const operativa = bruta - t('E');
  const utilidad = (t('I') + t('OI')) - (t('CV') + t('E') + t('OE'));
  const rows = (f) => f.map(x => ({ ...x, monto: x.monto != null ? dec(x.monto) : undefined }));
  return {
    secciones: Object.keys(TITULOS_RESULTADOS).map(ab => ({
      abrev: ab, titulo: TITULOS_RESULTADOS[ab], filas: rows(sec[ab].filas), total: dec(t(ab)), etiquetaTotal: `TOTAL DE ${TITULOS_RESULTADOS[ab]}`
    })),
    utilidadBruta: dec(bruta),
    utilidadOperativa: dec(operativa),
    utilidad: dec(utilidad),
    esUtilidad: utilidad > 0
  };
}

// ── Asiento de cierre (hoja Asiento Cierre) ────────────────────────────────────────────
// Salda todas las cuentas nominales al 31/12 contra "Resultado del ejercicio".
// (El Excel solo cerraba saldos > 0; aquí también los de signo contrario, para que nunca quede
// una cuenta nominal sin cerrar.)
export function asientoCierre(plan, acc, anio, cuentaResultados = CUENTA_RESULTADOS_DEFAULT) {
  const lineas = [];
  let resultado = 0;
  for (const a of [...acc.values()].sort(porCodigoAsc)) {
    if (a.clase !== 'N') continue;
    const s = a.meses[12].saldo;
    if (!s) continue;
    resultado += a.tipo === 'A' ? s : -s;
    // ingresos (acreedoras) se cierran por el Debe; gastos (deudoras) por el Haber
    const aDebe = a.tipo === 'A' ? s > 0 : s < 0;
    lineas.push({ cuenta: a.codigo, nombre: a.nombre, descripcion: 'Cierre de Cuentas Nominales', debe: aDebe ? dec(Math.abs(s)) : 0, haber: aDebe ? 0 : dec(Math.abs(s)) });
  }
  if (resultado) {
    const ganancia = resultado > 0;
    const nombre = plan.porCodigo.has(cuentaResultados) ? plan.porCodigo.get(cuentaResultados).nombre : 'Resultado del ejercicio';
    lineas.push({ cuenta: cuentaResultados, nombre: `${nombre} (${ganancia ? 'ganancia' : 'pérdida'})`, descripcion: 'Cierre de Cuentas Nominales', debe: ganancia ? 0 : dec(-resultado), haber: ganancia ? dec(resultado) : 0 });
  }
  const debe = lineas.reduce((s, l) => s + cent(l.debe), 0), haber = lineas.reduce((s, l) => s + cent(l.haber), 0);
  return { fecha: `${anio}-12-31`, lineas, resultado: dec(resultado), debe: dec(debe), haber: dec(haber), cuadra: debe === haber };
}

// Saldos iniciales del ejercicio siguiente: saldos finales de cuentas reales + el resultado
// del año sumado a la cuenta de resultados (las nominales arrancan en cero).
export function saldosNuevoEjercicio(plan, acc, cuentaResultados = CUENTA_RESULTADOS_DEFAULT) {
  const out = {};
  for (const a of acc.values()) {
    if (a.clase !== 'R') continue;
    const s = a.meses[12].saldo;
    if (s) out[a.codigo] = dec(s);
  }
  const res = resultadoAcumulado(acc, 12);
  if (res) {
    const info = infoCuenta(plan, cuentaResultados);
    const actual = cent(out[cuentaResultados]);
    out[cuentaResultados] = dec(actual + (info.tipo === 'A' ? res : -res));
  }
  return out;
}

// Resultado por mes para el panel de resumen.
export function resumenMensual(acc) {
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    let ing = 0, egr = 0;
    for (const a of acc.values()) {
      if (a.clase !== 'N') continue;
      const x = a.meses[m];
      if (a.tipo === 'A') ing += x.haber - x.debe; else egr += x.debe - x.haber;
    }
    meses.push({ mes: m, ingresos: dec(ing), egresos: dec(egr), resultado: dec(ing - egr) });
  }
  return meses;
}

// ── Validación de asientos (formulario "Comprobante") ──────────────────────────────────
export function validarAsiento(a, plan, { anio = null } = {}) {
  const errores = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha || ''))) errores.push('La fecha no es válida.');
  else if (anio && Number(a.fecha.slice(0, 4)) !== Number(anio)) errores.push(`La fecha debe estar dentro del ejercicio ${anio}.`);
  const num = Number(a.numero);
  if (!Number.isInteger(num) || num < 1) errores.push('El número de partida debe ser un entero mayor a cero.');
  const lineas = (a.lineas || []).filter(l => l.cuenta || Number(l.debe) || Number(l.haber));
  if (lineas.length < 2) errores.push('El asiento necesita al menos 2 líneas.');
  lineas.forEach((l, i) => {
    const n = i + 1;
    if (!l.cuenta) { errores.push(`Línea ${n}: falta la cuenta.`); return; }
    const c = plan.porCodigo.get(String(l.cuenta));
    if (!c) errores.push(`Línea ${n}: la cuenta ${l.cuenta} no existe en el plan.`);
    else if (!c.hoja) errores.push(`Línea ${n}: ${l.cuenta} es una cuenta de grupo; usa una de sus subcuentas.`);
    const d = cent(l.debe), h = cent(l.haber);
    if (d < 0 || h < 0) errores.push(`Línea ${n}: no se permiten montos negativos.`);
    else if (!d && !h) errores.push(`Línea ${n}: Debe y Haber no pueden ser cero a la vez.`);
    else if (d && h) errores.push(`Línea ${n}: Debe y Haber no pueden tener monto a la vez.`);
  });
  const td = lineas.reduce((s, l) => s + cent(l.debe), 0), th = lineas.reduce((s, l) => s + cent(l.haber), 0);
  if (td !== th) errores.push(`El asiento está descuadrado por ${dec(Math.abs(td - th)).toFixed(2)}.`);
  return errores;
}

export function siguienteNumero(asientos) {
  let max = 0;
  for (const a of asientos) if (!a.esCierre && Number(a.numero) > max) max = Number(a.numero);
  return max + 1;
}

// ── Diagnóstico (control de calidad de lo importado o capturado) ───────────────────────
export function diagnostico(plan, asientos, saldosIni = {}) {
  const items = [];
  const huerfanas = new Map();
  let descuadrados = 0;
  const vistos = new Map();
  for (const a of asientos) {
    let d = 0, h = 0;
    for (const l of a.lineas) {
      d += cent(l.debe); h += cent(l.haber);
      if (!plan.porCodigo.has(l.cuenta)) huerfanas.set(l.cuenta, (huerfanas.get(l.cuenta) || 0) + 1);
    }
    if (d !== h) descuadrados++;
    if (!a.esCierre) { const k = String(a.numero); vistos.set(k, (vistos.get(k) || 0) + 1); }
  }
  if (descuadrados) items.push({ nivel: 'error', texto: `${descuadrados} asiento(s) descuadrado(s) (Debe ≠ Haber).` });
  if (huerfanas.size) items.push({ nivel: 'error', texto: `Cuentas usadas en asientos que no existen en el plan: ${[...huerfanas.keys()].slice(0, 8).join(', ')}${huerfanas.size > 8 ? '…' : ''}.` });
  const repetidos = [...vistos.values()].filter(n => n > 1).length;
  if (repetidos) items.push({ nivel: 'aviso', texto: `${repetidos} número(s) de partida repetido(s).` });
  const sinClase = plan.lista.filter(c => !c.definida).length;
  if (sinClase) items.push({ nivel: 'aviso', texto: `${sinClase} cuenta(s) del plan empiezan con un dígito sin clase definida en Parámetros.` });
  const ini = Object.keys(saldosIni).filter(k => cent(saldosIni[k]) !== 0 && !plan.porCodigo.has(k));
  if (ini.length) items.push({ nivel: 'aviso', texto: `Saldos iniciales en cuentas que no existen en el plan: ${ini.slice(0, 6).join(', ')}.` });
  return items;
}

// ── Importación: filas planas del Excel (Movimientos) → asientos agrupados ──────────────
// Una "partida" del Excel son filas consecutivas con el mismo número de partida y la misma fecha
// (así numera la columna Línea: se reinicia cuando cambia la partida o la fecha).
export function agruparFilas(filas) {
  const asientos = [];
  let cur = null, seq = 0;
  for (const f of filas) {
    if (!cur || cur.numero !== f.partida || cur.fecha !== f.fecha) {
      cur = { numero: f.partida, fecha: f.fecha, observacion: '', esCierre: false, lineas: [], seq: seq++ };
      asientos.push(cur);
    }
    if (f.observacion && !cur.observacion) cur.observacion = f.observacion;
    cur.lineas.push({ cuenta: String(f.cuenta), descripcion: f.descripcion || '', debe: Number(f.debe) || 0, haber: Number(f.haber) || 0 });
  }
  return asientos;
}

// ── Calculo completo de una empresa-ejercicio ──────────────────────────────────────────
export function calcular(cuentas, clases, asientos, saldosIni, opts = {}) {
  const plan = construirPlan(cuentas, clases);
  const agg = agregar(asientos, opts);
  const acc = calcularAcumulados(plan, saldosIni, agg);
  return { plan, acc };
}
