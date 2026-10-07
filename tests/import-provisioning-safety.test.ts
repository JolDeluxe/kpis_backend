import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/index.js";
import { importKpiCsv } from "../src/modules/importaciones/service.js";

const validKey = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString("base64");
process.env.CREDENTIALS_ENCRYPTION_KEY = validKey;

const cleanup = async () => {
  const users = await prisma.usuario.findMany({ where: { cargoId: 930 }, select: { id: true } });
  await prisma.refreshSession.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
  await prisma.auditLog.deleteMany({ where: { targetUserId: { in: users.map((user) => user.id) } } });
  await prisma.usuario.deleteMany({ where: { cargoId: 930 } });
  await prisma.kpiResultado.deleteMany({ where: { cargoId: 930 } });
  await prisma.cargo.deleteMany({ where: { id: 930 } });
  await prisma.importacion.deleteMany({ where: { filename: { in: ["invalid-provision.csv", "rollback-provision.csv"] } } });
};

const csvForCargo930 = (kpiId: string) => `01 Año,02 Mes,04 Id Cargo,03 Orden,05 Puesto,06 Id,07 Valor,08 KPI,09 Resultado,10 Objetivo,11 Valor Real,12 Calificacion,13 Tendencia,14 Parametros,15 Suma Valor,16 Suma Calificacion,17 Calificacion General
2026,1,930,1,JEFATURA TEST ROLLBACK,${kpiId},10,KPI TEST,100 %,90 %,100 %,10,1,Mayor al 80 %,10,10,100 %
`;

describe("import provisioning safety", () => {
  afterEach(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = validKey;
    await cleanup();
  });

  it("CSV invalido no provisiona usuarios parciales", async () => {
    const before = await prisma.usuario.count();
    await expect(importKpiCsv({ type: "buffer", buffer: Buffer.from("bad,headers\n1,2", "utf8"), filename: "invalid-provision.csv" })).rejects.toThrow();
    const after = await prisma.usuario.count();
    expect(after).toBe(before);
  });

  it("error de provisioning hace rollback de cargo, usuario y resultados", async () => {
    await cleanup();
    const beforeResultados = await prisma.kpiResultado.count();
    process.env.CREDENTIALS_ENCRYPTION_KEY = "invalid-key";

    await expect(importKpiCsv({
      type: "buffer",
      buffer: Buffer.from(csvForCargo930(`ROLLBACK-${Date.now()}`), "utf8"),
      filename: "rollback-provision.csv"
    })).rejects.toThrow(/CREDENTIALS_ENCRYPTION_KEY/);

    expect(await prisma.cargo.findUnique({ where: { id: 930 } })).toBeNull();
    expect(await prisma.usuario.count({ where: { cargoId: 930 } })).toBe(0);
    expect(await prisma.kpiResultado.count()).toBe(beforeResultados);
  });
});
