# Sistema Contable

Reemplazo en JavaScript del `SISTEMA.xlsm` (contabilidad por partida doble con macros). Sitio **100 % estático**
(sin build, sin servidor): HTML + módulos ES + Tailwind por CDN, con el mismo diseño del módulo de Contabilidad de CIFCalc.

- **Multiempresa**: pantalla de inicio para elegir con qué empresa trabajar (cada una con su plan de cuentas, ejercicios y saldos).
- **Rápido**: todo se calcula en el navegador desde IndexedDB (100.000 líneas con todos los reportes ≈ 0,1 s).
- **Base de datos en Google Sheets** (Apps Script) como respaldo y para compartir entre equipos; sin conexión la app sigue funcionando y sube los cambios después.
- **Facturas con IA**: sube una foto/PDF → Claude propone el asiento → una persona lo revisa y aprueba (nunca se contabiliza solo).
- Importa los archivos `.xlsm` del sistema anterior (Parámetros, Plan, Movimientos, Saldo inicial).

## Desplegar (estático)

Sube la carpeta tal cual a cualquier hosting estático (GitHub Pages, Netlify, Cloudflare Pages…). No hay paso de compilación.
Para probar local: `python3 -m http.server 8765` y abrir http://localhost:8765.

## Conectar Google Sheets (una vez)

1. Crea una hoja de cálculo de Google → *Extensiones → Apps Script* → pega `apps-script/Code.gs`.
2. Pon en `TOKEN` la clave que usará la app (hoy `SISTEMA EK`, la misma de `js/config.js`).
3. *Implementar → Nueva implementación → Aplicación web*: ejecutar como **Yo**, acceso **Cualquier persona**. Copia la URL `/exec`.
4. La URL y el token ya vienen precargados desde `js/config.js`; en la app: *Conexión* → *Guardar y probar* → *Subir todo lo de este equipo*. Cada navegador puede cambiarlos ahí.

Las hojas (`empresas`, `cuentas`, `asientos`, `saldos`, `borradores`) las crea el script solo. Un asiento = una fila (las líneas van en JSON).

## Facturas con IA

El proveedor de IA se elige en el Apps Script (*Configuración del proyecto → Propiedades del script*); las claves **nunca llegan al navegador**:

| Propiedad | Valor |
|---|---|
| `IA_PROVIDER` | `nvidia` o `anthropic` (opcional: por defecto NVIDIA si existe `NVIDIA_API_KEY`) |
| `NVIDIA_API_KEY` / `NVIDIA_MODEL` | clave `nvapi-…` de build.nvidia.com / modelo de visión (por defecto `meta/llama-4-maverick-17b-128e-instruct`; copia el ID exacto de su página en build.nvidia.com) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | clave de Anthropic / modelo (por defecto `claude-sonnet-5-5`; `claude-haiku-5-5` es más barato) |

En la app: *Facturas con IA* → arrastra fotos o PDF (los PDF se convierten a imagen en el navegador; se usan hasta 3 páginas con Claude y la primera con NVIDIA). La IA recibe el plan de cuentas de la empresa, solo puede usar esas cuentas y devuelve datos + asiento propuesto. Queda en **Pendientes**; “Revisar y aprobar” abre el editor para corregir y contabilizar. Avisa de posibles facturas duplicadas (mismo RIF + número).

Para comparar proveedores: procesa las mismas 20–30 facturas reales con cada uno (cambia `IA_PROVIDER`) y cuenta cuántas salen bien sin corregir. Los modelos gratuitos de NVIDIA tienen límite de ~40 solicitudes por minuto y pueden devolver JSON imperfecto (el script lo interpreta con tolerancia y normaliza los montos "1.000,00").

### Conector para Claude (u otra automatización)

El Apps Script expone `crearBorrador`: cualquier agente que pueda hacer un POST deja una propuesta en la bandeja de una empresa (no contabiliza nada):

```bash
curl -L -X POST "$URL_EXEC" -H "Content-Type: text/plain" -d '{
  "action":"crearBorrador","pt":"TU_TOKEN",
  "borrador":{"empresa_id":"<id de la empresa>","origen":"claude","proveedor":"Proveedor C.A.","rif":"J-123","nro_factura":"F-77","total":232,"moneda":"VES",
    "asiento":{"fecha":"2024-03-12","observacion":"Compra","lineas":[
      {"cuenta":"6104023","descripcion":"Suministros","debe":200,"haber":0},
      {"cuenta":"1108004","descripcion":"IVA crédito","debe":32,"haber":0},
      {"cuenta":"2101002","descripcion":"Proveedor","debe":0,"haber":232}]}}}'
```

Lectura de datos para el agente: `GET ?table=cuentas&column=empresa_id&value=<id>&pt=TOKEN` (plan de cuentas) y lo mismo con `asientos`.

## Estructura

```
index.html            entrada (Tailwind CDN, Inter)
js/engine.js          motor contable puro (réplica verificada del Excel)
js/store.js, db.js    estado + IndexedDB;  sync.js, sheets.js  cola de cambios y cliente de Sheets
js/xlsx-io.js         importar el Excel anterior / exportar
js/pages/*.js         una pantalla por archivo;  js/components/*  menú, editor de asientos, UI común
apps-script/Code.gs   backend (Sheets + IA + bandeja)
tests/                pruebas (ver abajo)
docs/ANALISIS-EXCEL.md  cómo funcionaba el Excel y qué se mejoró
```

## Pruebas

```bash
node --test tests/engine.test.mjs                 # motor: 16 pruebas + rendimiento
python3 -m http.server 8765 &                     # y luego, con Playwright instalado:
node tests/e2e-sync.cjs                           # dos equipos + Sheets simulado + bandeja IA + cierre
node tests/gen-datos.mjs /tmp/datos.json          # compara el motor contra el SISTEMA.xlsm recalculado por LibreOffice:
python3 -I tests/verify-contra-excel.py SISTEMA.xlsm /tmp/datos.json /tmp/vx
```

## Seguridad y límites

- El sitio es estático: la URL y el token de Sheets se guardan en el navegador de cada equipo. Es un secreto débil; usa una hoja exclusiva y no compartas la URL.
- Sin usuarios/roles todavía: quien tenga la URL+token ve todas las empresas.
- Conflictos: gana el cambio más reciente por fila (`updated_at`). Si dos personas editan el mismo asiento a la vez, se queda el último.
- La IA puede equivocarse: por eso todo pasa por revisión humana y por la validación de partida doble.
