export const CSV_HEADERS = [
  "01 Año",
  "02 Mes",
  "04 Id Cargo",
  "03 Orden",
  "05 Puesto",
  "06 Id",
  "07 Valor",
  "08 KPI",
  "09 Resultado",
  "10 Objetivo",
  "11 Valor Real",
  "12 Calificacion",
  "13 Tendencia",
  "14 Parametros",
  "15 Suma Valor",
  "16 Suma Calificacion",
  "17 Calificacion General"
] as const;

export type CsvHeader = (typeof CSV_HEADERS)[number];
export type KpiCsvRow = Record<CsvHeader, string>;

export const cleanDisplay = (value: string | null | undefined) => {
  if (value === undefined || value === null) return "";
  return value
    .replace(/\u2003/g, " ")
    .replace(/\?/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const parseRequiredInt = (value: string, field: string, rowNumber: number) => {
  const normalized = cleanDisplay(value);
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`Fila ${rowNumber}: ${field} debe ser entero, recibido "${value}"`);
  }
  return Number.parseInt(normalized, 10);
};

export const parseOptionalNumber = (value: string | null | undefined): number | null => {
  const normalized = cleanDisplay(value);
  if (!normalized || /^NA$/i.test(normalized)) return null;
  const withoutUnits = normalized
    .replace(/\$/g, "")
    .replace(/%/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!/^-?\d+(\.\d+)?$/.test(withoutUnits)) return null;
  return Number(withoutUnits);
};

export const normalizeHeaderName = (header: string): string => {
  const trimmed = header.trim();
  // Tolerar "01 Año", "01 A?o", "01 Ao" o variantes con BOM
  if (/^01\s+A[\?ñ\u00f1\ufffd]?o$/i.test(trimmed)) {
    return "01 Año";
  }
  return trimmed;
};

export const validateHeaders = (headers: string[]) => {
  const normalizedHeaders = headers.map(normalizeHeaderName);
  const missing = CSV_HEADERS.filter((header) => !normalizedHeaders.includes(header));
  const extra = normalizedHeaders.filter((header) => !(CSV_HEADERS as readonly string[]).includes(header));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Encabezados invalidos. Faltan: ${missing.join(", ") || "ninguno"}. Extra: ${extra.join(", ") || "ninguno"}.`);
  }
};
