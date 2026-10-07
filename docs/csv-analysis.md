# Analisis del CSV KPI Jefaturas

Archivo analizado: `048 KPIs Jefaturas 260807 122334.csv`

- Encoding detectado: UTF-8 con BOM.
- Delimitador: coma.
- SHA-256 inicial: `71E4AEC2968538410DB65E524FB6EE369430EB87EA0BED7F674BC74696467439`.
- Filas de datos: 2600.
- Anios detectados: 2026.
- Periodos detectados: 1, 2, 3, 4, 5, 6, 13, 14, 17, 19.
- Periodos no presentes actualmente: 7, 8, 9, 10, 11, 12, 15, 16, 18.

## Encabezados exactos

1. `01 Año`
2. `02 Mes`
3. `04 Id Cargo`
4. `03 Orden`
5. `05 Puesto`
6. `06 Id`
7. `07 Valor`
8. `08 KPI`
9. `09 Resultado`
10. `10 Objetivo`
11. `11 Valor Real`
12. `12 Calificacion`
13. `13 Tendencia`
14. `14 Parametros`
15. `15 Suma Valor`
16. `16 Suma Calificacion`
17. `17 Calificacion General`

## Cargos detectados

- 1: MBC
- 100: DIRECCION MBC
- 101: JEFATURA DE COMPRAS
- 102: JEFATURA DE CALIDAD
- 103: JEFATURA DE PPCP
- 104: JEFATURA DE LOGISTICA
- 200: GERENCIA ADMINISTRATIVA
- 201: JEFATURA DE CONTABILIDAD
- 300: GERENCIA OPERATIVA
- 301: JEFATURA DE PRODUCCION BOTAS I
- 302: JEFATURA DE PRODUCCION BOTAS II
- 303: JEFATURA DE PRODUCCION ACCESORIOS
- 304: JEFATURA DE DESARROLLO BOTAS
- 305: JEFATURA DE DESARROLLO ACCESORIOS
- 306: JEFATURA DE INGENIERIA DE PROCESOS
- 307: JEFATURA DE INGENIERIA DE COSTOS Y SISTEMA
- 308: JEFATURA DE MANTENIMIENTO
- 309: JEFATURA DE MAQUILAS
- 400: GERENCIA DE CAPITAL HUMANO
- 401: JEFATURA DE CAPITAL HUMANO
- 402: JEFATURA DE GESTION DE CALIDAD

## Particularidades

- `09 Resultado`, `10 Objetivo`, `11 Valor Real` y `17 Calificacion General` pueden incluir `%`, `$`, separadores de miles, espacios Unicode y `NA`.
- `14 Parametros` puede incluir reglas como `Mayor al 80 %` y tambien saltos HTML `<BR>`.
- `06 Id` puede contener sufijos no numericos como `102 b`; se guarda como texto.
- `13 Tendencia` tiene valores `0,1,2,3,4,5,6,7`, pero el CSV no incluye una leyenda verificable. La aplicacion conserva el raw y centraliza el mapeo visual en `tendencia-map.js`.
- No existe columna llamada `Forma de Calculo`; la tabla muestra `--` en esa columna hasta que exista una regla confiable.
- `07 Valor` parece corresponder al peso/valor del KPI; se conserva como raw y se parsea a numero auxiliar cuando es seguro.
- No se recalculan periodos ni totales. El CSV es la fuente de verdad para resumen y resultados.
