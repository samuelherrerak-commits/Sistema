# Análisis del SISTEMA.xlsm

## Qué es
Un libro de Excel con macros VBA que lleva la contabilidad de **una empresa por archivo** (cada cliente = una copia). 13 hojas, 14 formularios VBA.

| Hoja | Contenido |
|---|---|
| Parametros | Empresa, RIF, **año**, **cuenta de resultados** (3103002), tabla de clases por primer dígito (1 Activo… 8 Otros egresos) con saldo normal (D/A) y clase real/nominal |
| Plan | 302 cuentas jerárquicas: 1, 2, 4 y 7 dígitos (solo las de 7 reciben asientos) |
| Movimientos | Diario plano: Partida, Línea (fórmula), Fecha, Cuenta, Nombre (BUSCARV), Descripción, Debe, Haber, Mes (fórmula). Tope 5.000 filas |
| Acumulados | Por cuenta y mes: Saldo anterior, Debe, Haber, Saldo, con ~29.000 `SUMIFS` sobre Movimientos. Aquí está la lentitud |
| Libro Diario / Mayor / Balance Comprobación / Estados / Asiento Cierre | Se **regeneran por macro** copiando filas filtradas con AutoFilter |

## Lógica contable (extraída del VBA)
- **Asiento (FrmComprobante)**: número de partida + fecha + líneas. Cada línea: cuenta existente en el Plan, Debe XOR Haber (≠ 0 ambos), el asiento debe cuadrar al centavo. Se agrega al final de Movimientos; editar = borrar las filas de la partida y reinsertarlas.
- **Acumulados**: `saldo_mes = saldo_ant ± (debe − haber)`; signo según el tipo de la cuenta (D: debe−haber, A: haber−debe); `ROUND(…,2)`. El saldo inicial es una columna manual por cuenta.
- **Balance de comprobación**: cuentas con saldo anterior ≠ 0 o movimiento en el rango [mes, mes hasta]; total con signo (deudoras +, acreedoras −) que debe dar 0.
- **Libro mayor**: por cuenta con actividad: saldo anterior, movimientos del rango con saldo corrido, total.
- **Estado de situación**: secciones Activo / Pasivo / Patrimonio por la abreviatura (A/P/C), agrupando por cuentas de 2 y 4 dígitos, con totales por grupo; grupos sin movimiento se ocultan. **Resultado del ejercicio** = Σ nominales acreedoras − Σ nominales deudoras, y se muestra dentro de Patrimonio en la cuenta de resultados de Parámetros. Alerta si A ≠ P + C.
- **Estado de resultados**: Ingresos, Costo de ventas, Egresos, Otros ingresos, Otros egresos; utilidad = (I + OI) − (CV + E + OE). (Filas de ISLR ocultas y vacías.)
- **Asiento de cierre**: al 31/12 salda las cuentas nominales (ingresos por el Debe, gastos por el Haber) contra “Resultado del ejercicio”.

## Qué se conservó y qué se corrigió
Verificado cuenta por cuenta y mes contra el Excel recalculado por LibreOffice (700 asientos, 3.624 celdas, 0 diferencias).

| Excel | Aquí |
|---|---|
| Un archivo por empresa, copiar/pegar para pasar de año | Multiempresa en una sola app; “Abrir ejercicio” arrastra saldos finales y resultado |
| 5.000 filas máx., recálculo de ~29.000 `SUMIFS` | Una pasada O(n); 100.000 líneas ≈ 0,1 s |
| El mes sale de la fecha **sin mirar el año** (mezcla años en el mismo archivo) | Cada asiento pertenece a un ejercicio; los reportes filtran por año |
| Estado de resultados de un mes suelto mostraba el acumulado desde enero | Muestra el movimiento del periodo pedido |
| Balance con “mes desde” ocultaba cuentas con saldo y podía descuadrar | Balance siempre acumulado al mes elegido |
| Asiento de cierre solo cerraba saldos > 0 | Cierra también saldos de signo contrario; además se puede contabilizar y deshacer |
| Se podía asentar en cuentas de grupo; se permitía partida repetida sin aviso | Solo cuentas de movimiento; avisa números repetidos |
| Sin control de calidad | Panel de diagnóstico (cuentas huérfanas, asientos descuadrados, saldos iniciales sin cuenta) |
| Reportes generados por macro, se desactualizan | Siempre en vivo; imprimir y exportar a Excel |
| — | Importa los `.xlsm` existentes; bandeja de facturas con IA |
