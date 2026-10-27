// Prueba extremo a extremo: dos "equipos" (contextos de navegador) sincronizando por el Apps Script simulado,
// bandeja de IA y asiento de cierre. Requiere: servidor estático en :8765.
const { chromium } = require('playwright');
(async () => {
  const { crearServidor, ultimas } = await import('./apps-script-simulado.mjs');
  const { tablas, srv } = await crearServidor(8766, { facturaIA: (b) => ({ tipo: 'compra', fecha: '2024-03-10', proveedor: 'Papelería XYZ', rif: 'J-111', nro_factura: 'F-001', moneda: 'VES', base_imponible: 100, iva: 16, total: 116, observacion: 'Compra de papelería', confianza: 0.93, notas: '', lineas: [{ cuenta: '6104023', descripcion: 'Papelería', debe: 100, haber: 0 }, { cuenta: '1108004', descripcion: 'IVA', debe: 16, haber: 0 }, { cuenta: '2101002', descripcion: 'Proveedor', debe: 0, haber: 116 }] }) });
  const b = await chromium.launch(); let fallos = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fallos++; };
  const conectar = async (p) => { await p.goto('http://localhost:8765/#/conexion'); await p.fill('#cx-url', 'http://localhost:8766/exec'); await p.fill('#cx-token', 'TEST'); await p.check('#cx-activo'); await p.click('#cx-guardar'); await p.waitForFunction(() => document.querySelector('#cx-estado').textContent.includes('correcta')); };

  // Equipo A: crea empresa y 1 asiento
  const A = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); const errA = []; A.on('pageerror', e => errA.push(e.message));
  await conectar(A);
  await A.goto('http://localhost:8765/#/'); await A.click('#emp-nueva'); await A.fill('input[name=nombre]', 'Cliente Sync C.A.'); await A.fill('input[name=anio]', '2024'); await A.click('text=Crear y abrir'); await A.waitForSelector('#rs-nuevo');
  await A.click('#rs-nuevo'); await A.waitForSelector('#ae-lineas'); await A.fill('#ae-fecha', '2024-03-05');
  const cuenta = async (i, t) => { const inp = A.locator(`#ae-lineas tr[data-i="${i}"] [data-c=cuenta]`); await inp.click(); await inp.fill(t); await A.keyboard.press('Enter'); };
  await cuenta(0, '1101001'); await A.keyboard.type('venta'); await A.keyboard.press('Enter'); await A.keyboard.type('500.50'); await A.keyboard.press('Enter');
  await cuenta(1, '4101003'); await A.click('#ae-save'); await A.waitForSelector('text=Asiento Nº 1 guardado');
  await A.waitForFunction(() => document.querySelector('#sync-badge').textContent.includes('Sincronizado'), null, { timeout: 15000 });
  ok(tablas.empresas.length === 1 && tablas.asientos.length === 1 && tablas.cuentas.length === 302, `Sheets recibió empresa(${tablas.empresas.length}), 302 cuentas(${tablas.cuentas.length}) y el asiento(${tablas.asientos.length})`);
  const fila = tablas.asientos[0]; const lineas = JSON.parse(fila.lineas);
  ok(lineas.length === 2 && lineas[0].debe === 500.5 && fila.numero === '1' && fila.fecha === '2024-03-05', 'El asiento se guardó como una sola fila con líneas en JSON');
  const empId = tablas.empresas[0].id;

  // Equipo B: otro navegador, mismas credenciales → ve la empresa y el asiento
  const B = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); const errB = [];
  B.on('pageerror', e => errB.push(e.message));
  await conectar(B); await B.goto('http://localhost:8765/#/'); await B.waitForSelector('text=Cliente Sync C.A.', { timeout: 15000 });
  ok(true, 'Equipo B ve la empresa creada en el equipo A');
  await B.click('text=Cliente Sync C.A.'); await B.waitForSelector('#rs-nuevo');
  await B.goto(`http://localhost:8765/#/e/${empId}/asientos`); await B.waitForSelector('text=Nº 1', { timeout: 15000 });
  ok(true, 'Equipo B descargó el asiento Nº 1');

  // Conector externo (Claude) deja una propuesta: llega a la bandeja
  tablas.borradores.push({ id: 'ext-1', empresa_id: empId, estado: 'pendiente', origen: 'claude', fecha: '2024-03-12', proveedor: 'Proveedor Conector', rif: 'J-9', nro_factura: 'C-77', total: '232', moneda: 'VES', asiento: JSON.stringify({ fecha: '2024-03-12', observacion: 'desde conector', lineas: [{ cuenta: '6104023', descripcion: 'x', debe: 200, haber: 0 }, { cuenta: '1108004', descripcion: 'iva', debe: 32, haber: 0 }, { cuenta: '2101002', descripcion: 'prov', debe: 0, haber: 232 }] }), archivo: '', nota: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  await B.goto(`http://localhost:8765/#/e/${empId}/facturas`); await B.click('#fa-act'); await B.waitForSelector('text=Proveedor Conector', { timeout: 15000 });
  ok(true, 'La propuesta del conector aparece en la bandeja de B');
  await B.click('[data-apr]'); await B.waitForSelector('#ae-save'); await B.click('#ae-save'); await B.waitForSelector('text=Asiento Nº 2 guardado');
  await B.waitForFunction(() => document.querySelector('#sync-badge').textContent.includes('Sincronizado'), null, { timeout: 15000 });
  ok(tablas.asientos.length === 2 && tablas.borradores.find(x => x.id === 'ext-1').estado === 'aprobado', 'Aprobar la propuesta creó el asiento Nº 2 y marcó el borrador como aprobado en Sheets');

  // IA en la app (extraerFactura simulado)
  await B.goto(`http://localhost:8765/#/e/${empId}/facturas`); await B.waitForSelector('#fa-file', { state: 'attached' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await B.setInputFiles('#fa-file', { name: 'factura.png', mimeType: 'image/png', buffer: png });
  await B.waitForSelector('text=Papelería XYZ', { timeout: 15000 });
  ok(true, 'La factura leída por la IA entra como propuesta pendiente');
  await B.locator('[data-apr]').first().click(); await B.waitForSelector('#ae-save');
  const sumas = await B.locator('#ae-dif').innerText(); ok(sumas.includes('Cuadrado'), 'La propuesta de la IA llega cuadrada al editor');
  await B.click('#ae-save'); await B.waitForSelector('text=guardado'); await B.waitForFunction(() => document.querySelector('#sync-badge').textContent.includes('Sincronizado'), null, { timeout: 15000 }); await B.waitForTimeout(1500);

  // PDF: se convierte a imagen en el navegador antes de enviarlo a la IA (los modelos de visión no leen PDF)
  await B.goto(`http://localhost:8765/#/e/${empId}/facturas`); await B.waitForSelector('#fa-file', { state: 'attached' });
  ultimas.extraer = null;
  await B.setInputFiles('#fa-file', process.env.PDF_PRUEBA);
  for (let i = 0; i < 60 && !ultimas.extraer; i++) await B.waitForTimeout(250);
  const im = ultimas.extraer && ultimas.extraer.imagenes;
  ok(im && im.length >= 1 && im[0].mime === 'image/jpeg' && im[0].data.length > 2000 && !ultimas.extraer.data, `El PDF llegó al servidor como imagen JPEG (${im ? im[0].data.length : 0} caracteres base64)`);
  await B.waitForTimeout(800);

  // Equipo A trae los cambios de B
  await A.goto(`http://localhost:8765/#/e/${empId}/asientos`); await A.waitForTimeout(500); await A.goto('http://localhost:8765/#/conexion'); await A.click('#cx-ahora');
  await A.waitForSelector('#toasts >> text=Listo', { timeout: 20000 });
  await A.goto(`http://localhost:8765/#/e/${empId}/asientos`); await A.waitForSelector('text=Nº 3', { timeout: 15000 });
  ok(true, 'Equipo A recibió los asientos Nº 2 y 3 hechos en B');

  // Borrar en A desaparece en B
  await A.locator('[data-id]').filter({ hasText: 'Nº 3' }).locator('[data-del]').click(); await A.click('text=Eliminar >> nth=-1');
  for (let i = 0; i < 40 && tablas.asientos.length !== 2; i++) await A.waitForTimeout(250);
  ok(tablas.asientos.length === 2, 'Eliminar un asiento en A lo elimina de Sheets');

  // Cierre
  await A.goto(`http://localhost:8765/#/e/${empId}/cierre`); await A.waitForSelector('#ci-post');
  await A.click('#ci-post'); await A.click('text=Contabilizar >> nth=-1'); await A.waitForSelector('text=Contabilizado: asiento');
  const cierre = (await A.evaluate(async () => (await (await import('/js/db.js')).todos('asientos')).filter(a => a.esCierre))).length;
  ok(cierre === 1, 'El asiento de cierre se contabilizó');
  console.log('errores JS A:', errA, 'B:', errB);
  await b.close(); srv.close(); process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
