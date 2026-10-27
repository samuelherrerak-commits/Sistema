// Simula el Apps Script (Code.gs) en memoria para probar la sincronización sin Google.
// Uso: node tests/apps-script-simulado.mjs [puerto]   → URL http://localhost:PUERTO/exec  token: TEST
import http from 'node:http';
const TOKEN = 'TEST';
const tablas = { empresas: [], cuentas: [], asientos: [], saldos: [], borradores: [] };
const texto = (v) => (v == null ? '' : String(v));
export function crearServidor(puerto, { facturaIA } = {}) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const responder = (o) => { res.writeHead(200, cors); res.end(JSON.stringify(o)); };
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      const b = body ? JSON.parse(body) : {};
      const pt = b.pt ?? u.searchParams.get('pt');
      if (pt !== TOKEN) return responder({ ok: false, error: 'unauthorized', code: 401 });
      if (req.method === 'GET') {
        if (u.searchParams.get('action') === 'ping') return responder({ ok: true, data: 'pong', tables: Object.keys(tablas) });
        const t = u.searchParams.get('table'); let d = tablas[t];
        if (!d) return responder({ ok: false, error: 'tabla desconocida', code: 400 });
        const c = u.searchParams.get('column'); if (c) d = d.filter(r => r[c] === u.searchParams.get('value'));
        return responder({ ok: true, data: d });
      }
      if (b.action === 'upsert') {
        let ins = 0, upd = 0, skip = 0;
        for (const row of b.rows) {
          const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, texto(v)]));
          const i = tablas[b.table].findIndex(x => x.id === r.id);
          if (i >= 0) { if (tablas[b.table][i].updated_at > r.updated_at) skip++; else { tablas[b.table][i] = r; upd++; } } else { tablas[b.table].push(r); ins++; }
        }
        return responder({ ok: true, inserted: ins, updated: upd, skipped: skip });
      }
      if (b.action === 'delete') { tablas[b.table] = tablas[b.table].filter(r => r.id !== b.id); return responder({ ok: true }); }
      if (b.action === 'deleteWhere') { tablas[b.table] = tablas[b.table].filter(r => r[b.column] !== b.value); return responder({ ok: true }); }
      if (b.action === 'crearBorrador') {
        const x = b.borrador, now = new Date().toISOString();
        tablas.borradores.push({ id: 'ext-' + tablas.borradores.length, empresa_id: x.empresa_id, estado: 'pendiente', origen: x.origen || 'conector', fecha: texto(x.fecha), proveedor: texto(x.proveedor), rif: texto(x.rif), nro_factura: texto(x.nro_factura), total: texto(x.total), moneda: '', asiento: JSON.stringify(x.asiento), archivo: '', nota: texto(x.nota), created_at: now, updated_at: now });
        return responder({ ok: true });
      }
      if (b.action === 'extraerFactura') return responder({ ok: true, factura: facturaIA ? facturaIA(b) : { tipo: 'compra', fecha: '2024-03-10', total: 116, lineas: [] } });
      responder({ ok: false, error: 'acción desconocida', code: 400 });
    });
  });
  return new Promise(r => srv.listen(puerto, () => r({ srv, tablas })));
}
if (process.argv[1].endsWith('apps-script-simulado.mjs')) { const p = Number(process.argv[2]) || 8766; await crearServidor(p); console.log(`Apps Script simulado en http://localhost:${p}/exec (token TEST)`); }
