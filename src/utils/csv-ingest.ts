import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { CSV_HEADERS, cleanDisplay, normalizeHeaderName, parseOptionalNumber, parseRequiredInt, validateHeaders, type KpiCsvRow } from "./csv-normalize.js";

export type ParsedKpiRow = {
  anio: number;
  periodo: number;
  cargoId: number;
  cargoNombre: string;
  orden: number;
  kpiId: string;
  kpiNombre: string;
  valorRaw: string;
  resultadoRaw: string;
  objetivoRaw: string;
  valorRealRaw: string;
  calificacionRaw: string;
  tendenciaRaw: string;
  parametrosRaw: string;
  sumaValorRaw: string;
  sumaCalificacionRaw: string;
  calificacionGeneralRaw: string;
  valorNumero: number | null;
  resultadoNumero: number | null;
  objetivoNumero: number | null;
  valorRealNumero: number | null;
  calificacionNumero: number | null;
};

const parseRecords = (content: string): KpiCsvRow[] => {
  let headers: string[] = [];
  const records = parse(content, {
    bom: true,
    columns: (header: string[]) => {
      headers = header;
      validateHeaders(header);
      return header.map(normalizeHeaderName);
    },
    skip_empty_lines: true,
    relax_column_count: false
  }) as KpiCsvRow[];

  if (headers.length === 0) throw new Error("CSV sin encabezados.");
  if (records.length === 0) throw new Error("CSV vacio: no contiene filas de datos.");
  return records;
};

export const parseKpiCsvContent = (content: string): ParsedKpiRow[] => {
  const records = parseRecords(content);

  // Filtrar registros que estén completamente vacíos o contengan solo espacios en blanco
  const validRecords = records.filter((row) => {
    return Object.values(row).some((val) => {
      if (val === undefined || val === null) return false;
      return val.trim() !== "";
    });
  });

  return validRecords.map((row, index) => {
    const rowNumber = index + 2; // Nota: el rowNumber visual para reportar errores puede no coincidir exactamente si se filtran filas intermedias, pero normalmente se filtran al final.
    const parsed: ParsedKpiRow = {
      anio: parseRequiredInt(row["01 Año"], "01 Año", rowNumber),
      periodo: parseRequiredInt(row["02 Mes"], "02 Mes", rowNumber),
      cargoId: parseRequiredInt(row["04 Id Cargo"], "04 Id Cargo", rowNumber),
      cargoNombre: cleanDisplay(row["05 Puesto"]),
      orden: parseRequiredInt(row["03 Orden"], "03 Orden", rowNumber),
      kpiId: cleanDisplay(row["06 Id"]),
      kpiNombre: cleanDisplay(row["08 KPI"]),
      valorRaw: cleanDisplay(row["07 Valor"]),
      resultadoRaw: cleanDisplay(row["09 Resultado"]),
      objetivoRaw: cleanDisplay(row["10 Objetivo"]),
      valorRealRaw: cleanDisplay(row["11 Valor Real"]),
      calificacionRaw: cleanDisplay(row["12 Calificacion"]),
      tendenciaRaw: cleanDisplay(row["13 Tendencia"]),
      parametrosRaw: cleanDisplay(row["14 Parametros"]),
      sumaValorRaw: cleanDisplay(row["15 Suma Valor"]),
      sumaCalificacionRaw: cleanDisplay(row["16 Suma Calificacion"]),
      calificacionGeneralRaw: cleanDisplay(row["17 Calificacion General"]),
      valorNumero: parseOptionalNumber(row["07 Valor"]),
      resultadoNumero: parseOptionalNumber(row["09 Resultado"]),
      objetivoNumero: parseOptionalNumber(row["10 Objetivo"]),
      valorRealNumero: parseOptionalNumber(row["11 Valor Real"]),
      calificacionNumero: parseOptionalNumber(row["12 Calificacion"])
    };

    if (!parsed.cargoNombre) throw new Error(`Fila ${rowNumber}: 05 Puesto esta vacio.`);
    if (!parsed.kpiId) throw new Error(`Fila ${rowNumber}: 06 Id esta vacio.`);
    if (!parsed.kpiNombre) throw new Error(`Fila ${rowNumber}: 08 KPI esta vacio.`);
    return parsed;
  });
};

export const parseKpiCsvFile = async (filePath: string) => {
  const content = await fs.readFile(filePath, "utf8");
  return parseKpiCsvContent(content);
};

export const detectCsvSummary = (rows: ParsedKpiRow[]) => ({
  rowCount: rows.length,
  cargos: Array.from(new Map(rows.map((row) => [row.cargoId, row.cargoNombre])).entries()).sort((a, b) => a[0] - b[0]),
  anios: Array.from(new Set(rows.map((row) => row.anio))).sort((a, b) => a - b),
  periodos: Array.from(new Set(rows.map((row) => row.periodo))).sort((a, b) => a - b)
});
