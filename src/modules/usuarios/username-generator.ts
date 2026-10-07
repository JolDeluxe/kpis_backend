import type { Cargo } from "@prisma/client";

export const CARGO_USERNAME_PREFIX = "mbc.";
export const MAX_USERNAME_LENGTH = 30;

const TYPE_ABBREVIATIONS = new Map([
  ["direccion", "dir"],
  ["gerencia", "ger"],
  ["jefatura", "jef"],
  ["ingenieria", "ing"]
]);

const STOPWORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "en", "para"]);
const LOW_VALUE_WHEN_LONG = new Set(["internas", "internos", "interna", "interno", "externas", "externos", "externa", "externo", "almacen"]);
const ROMAN_NUMBERS = new Map([["i", "1"], ["ii", "2"], ["iii", "3"], ["iv", "4"], ["v", "5"]]);

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ñ/g, "n")
  .replace(/Ñ/g, "n")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const compactTokens = (tokens: string[]) => {
  const mapped = tokens
    .filter((token) => token && !STOPWORDS.has(token))
    .map((token) => ROMAN_NUMBERS.get(token) || TYPE_ABBREVIATIONS.get(token) || token);

  if (mapped.includes("produccion") && (mapped.includes("botas") || mapped.includes("accesorios"))) {
    return mapped.filter((token) => token !== "produccion");
  }
  if (mapped.includes("costos")) {
    return mapped.filter((token) => token !== "sistema");
  }
  return mapped;
};

const fitUsername = (base: string) => {
  if (base.length <= MAX_USERNAME_LENGTH) return base;
  const [prefix, rest] = base.startsWith(CARGO_USERNAME_PREFIX)
    ? [CARGO_USERNAME_PREFIX, base.slice(CARGO_USERNAME_PREFIX.length)]
    : ["", base];
  const parts = rest.split("-").filter((token) => !LOW_VALUE_WHEN_LONG.has(token));
  while (`${prefix}${parts.join("-")}`.length > MAX_USERNAME_LENGTH && parts.length > 2) {
    parts.splice(parts.length - 2, 1);
  }
  const fitted = `${prefix}${parts.join("-")}`;
  return fitted.length <= MAX_USERNAME_LENGTH ? fitted : fitted.slice(0, MAX_USERNAME_LENGTH).replace(/-+[^-]*$/, "");
};

export const generateCargoUsernameBase = (cargo: Pick<Cargo, "id" | "nombre">) => {
  const normalized = normalize(cargo.nombre);
  if (cargo.id === 1 || normalized === "mbc") return "mbc";

  const tokens = compactTokens(normalized.split(/\s+/));
  const typeToken = tokens.find((token) => token === "dir" || token === "ger" || token === "jef") || "cargo";
  const concepts = tokens.filter((token) => token !== "dir" && token !== "ger" && token !== "jef");
  const base = [typeToken, ...concepts].join("-");
  return fitUsername(`${CARGO_USERNAME_PREFIX}${base}`);
};

export const generateUniqueCargoUsername = (cargo: Pick<Cargo, "id" | "nombre">, unavailable: Set<string>) => {
  const base = generateCargoUsernameBase(cargo);
  if (!unavailable.has(base)) return base;

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const suffixText = `-${suffix}`;
    const trimmedBase = base.length + suffixText.length <= MAX_USERNAME_LENGTH
      ? base
      : base.slice(0, MAX_USERNAME_LENGTH - suffixText.length).replace(/-+[^-]*$/, "");
    const candidate = `${trimmedBase}${suffixText}`;
    if (!unavailable.has(candidate)) return candidate;
  }

  throw new Error(`No se pudo generar username unico para cargo ${cargo.id}.`);
};
