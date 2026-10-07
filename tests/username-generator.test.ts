import { describe, expect, it } from "vitest";
import { generateCargoUsernameBase, generateUniqueCargoUsername } from "../src/modules/usuarios/username-generator.js";

const expected = [
  [1, "MBC", "mbc"],
  [100, "DIRECCION MBC", "mbc.dir-mbc"],
  [101, "JEFATURA DE COMPRAS", "mbc.jef-compras"],
  [102, "JEFATURA DE CALIDAD", "mbc.jef-calidad"],
  [103, "JEFATURA DE PPCP", "mbc.jef-ppcp"],
  [104, "JEFATURA DE LOGISTICA", "mbc.jef-logistica"],
  [200, "GERENCIA ADMINISTRATIVA", "mbc.ger-administrativa"],
  [201, "JEFATURA DE CONTABILIDAD", "mbc.jef-contabilidad"],
  [300, "GERENCIA OPERATIVA", "mbc.ger-operativa"],
  [301, "JEFATURA DE PRODUCCION BOTAS I", "mbc.jef-botas-1"],
  [302, "JEFATURA DE PRODUCCION BOTAS II", "mbc.jef-botas-2"],
  [303, "JEFATURA DE PRODUCCION ACCESORIOS", "mbc.jef-accesorios"],
  [304, "JEFATURA DE DESARROLLO BOTAS", "mbc.jef-desarrollo-botas"],
  [305, "JEFATURA DE DESARROLLO ACCESORIOS", "mbc.jef-desarrollo-accesorios"],
  [306, "JEFATURA DE INGENIERIA DE PROCESOS", "mbc.jef-ing-procesos"],
  [307, "JEFATURA DE INGENIERIA DE COSTOS Y SISTEMA", "mbc.jef-ing-costos"],
  [308, "JEFATURA DE MANTENIMIENTO", "mbc.jef-mantenimiento"],
  [309, "JEFATURA DE MAQUILAS", "mbc.jef-maquilas"],
  [400, "GERENCIA DE CAPITAL HUMANO", "mbc.ger-capital-humano"],
  [401, "JEFATURA DE CAPITAL HUMANO", "mbc.jef-capital-humano"],
  [402, "JEFATURA DE GESTION DE CALIDAD", "mbc.jef-gestion-calidad"],
  [500, "GERENCIA DISEÑO", "mbc.ger-diseno"],
  [501, "JEFATURA DISEÑO", "mbc.jef-diseno"],
  [600, "GERENCIA MARKETING", "mbc.ger-marketing"],
  [601, "JEFATURA MARKETING", "mbc.jef-marketing"]
] as const;

describe("username generator", () => {
  it("genera los usernames aprobados para cargos actuales y futuros", () => {
    for (const [id, nombre, username] of expected) {
      expect(generateCargoUsernameBase({ id, nombre })).toBe(username);
    }
  });

  it("usa sufijo incremental solo como respaldo", () => {
    expect(generateUniqueCargoUsername({ id: 700, nombre: "JEFATURA DE COMPRAS" }, new Set(["mbc.jef-compras"]))).toBe("mbc.jef-compras-2");
  });

  it("reduce nombres largos sin usar cargoId", () => {
    const username = generateCargoUsernameBase({ id: 801, nombre: "JEFATURA COMPRAS INTERNAS DEL ALMACEN EXTERNO DE BOTAS" });
    expect(username).toBe("mbc.jef-compras-botas");
    expect(username).not.toContain("801");
    expect(username.length).toBeLessThanOrEqual(30);
  });
});
