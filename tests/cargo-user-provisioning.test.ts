import crypto from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { prisma } from "../src/db/index.js";
import { provisionMissingCargoUsers } from "../src/modules/usuarios/provision-cargo-users.js";
import { decryptCredential } from "../src/modules/usuarios/credential-encryption.js";

process.env.CREDENTIALS_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("base64");

const cargoIds = [500, 501, 600, 601, 920, 921, 922];

const cleanup = async () => {
  const users = await prisma.usuario.findMany({ where: { cargoId: { in: cargoIds } }, select: { id: true } });
  await prisma.refreshSession.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
  await prisma.auditLog.deleteMany({ where: { targetUserId: { in: users.map((user) => user.id) } } });
  await prisma.usuario.deleteMany({ where: { cargoId: { in: cargoIds } } });
  await prisma.cargo.deleteMany({ where: { id: { in: cargoIds } } });
};

describe("cargo user provisioning", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("crea cuentas funcionales para cargos futuros y es idempotente", async () => {
    await prisma.cargo.createMany({
      data: [
        { id: 500, nombre: "GERENCIA DISEÑO", activo: true },
        { id: 501, nombre: "JEFATURA DISEÑO", parentId: 500, activo: true },
        { id: 600, nombre: "GERENCIA MARKETING", activo: true },
        { id: 601, nombre: "JEFATURA MARKETING", parentId: 600, activo: true }
      ]
    });
    const cargos = await prisma.cargo.findMany({ where: { id: { in: [500, 501, 600, 601] } }, orderBy: { id: "asc" } });

    const first = await provisionMissingCargoUsers(prisma, cargos, { audit: false });
    const second = await provisionMissingCargoUsers(prisma, cargos, { audit: false });
    const users = await prisma.usuario.findMany({ where: { cargoId: { in: [500, 501, 600, 601] } }, orderBy: { cargoId: "asc" } });

    expect(first).toHaveLength(4);
    expect(second).toHaveLength(0);
    expect(users.map((user) => [user.cargoId, user.username])).toEqual([
      [500, "mbc.ger-diseno"],
      [501, "mbc.jef-diseno"],
      [600, "mbc.ger-marketing"],
      [601, "mbc.jef-marketing"]
    ]);
    expect(users.every((user) => user.passwordEncrypted && !user.passwordEncrypted.includes(user.username || ""))).toBe(true);
    const passwords = users.map((user) => decryptCredential(user.passwordEncrypted!));
    expect(passwords.every((password) => /^CuadraMBC\d{6}!$/.test(password))).toBe(true);
    expect(new Set(passwords).size).toBe(passwords.length);
  }, 15000);

  it("no reactiva desactivados ni sobrescribe username manual", async () => {
    await prisma.cargo.create({ data: { id: 920, nombre: "JEFATURA DE CALIDAD BOTAS", activo: true } });
    const cargo = await prisma.cargo.findUniqueOrThrow({ where: { id: 920 } });
    await provisionMissingCargoUsers(prisma, [cargo], { audit: false });
    const user = await prisma.usuario.findFirstOrThrow({ where: { cargoId: 920 } });
    await prisma.usuario.update({ where: { id: user.id }, data: { username: "mbc.calidad-manual", activo: false } });

    await provisionMissingCargoUsers(prisma, [cargo], { audit: false });
    const after = await prisma.usuario.findUniqueOrThrow({ where: { id: user.id } });

    expect(after.username).toBe("mbc.calidad-manual");
    expect(after.activo).toBe(false);
  });

  it("convierte cuentas legacy de cargo sin username a funcionales", async () => {
    await prisma.cargo.create({ data: { id: 922, nombre: "JEFATURA LEGACY TEST", activo: true } });
    await prisma.usuario.create({
      data: {
        nombre: "Legacy sin username",
        email: "legacy-cargo-922@test.local",
        passwordHash: "hash",
        role: "JEFE",
        cargoId: 922,
        activo: true,
        autoProvisioned: false
      }
    });
    const cargo = await prisma.cargo.findUniqueOrThrow({ where: { id: 922 } });

    const updated = await provisionMissingCargoUsers(prisma, [cargo], { audit: false });
    const user = await prisma.usuario.findFirstOrThrow({ where: { cargoId: 922 } });

    expect(updated).toHaveLength(1);
    expect(user.username).toBe("mbc.jef-legacy-test");
    expect(user.autoProvisioned).toBe(true);
    expect(user.passwordEncrypted).toBeTruthy();
  });

  it("impide dos cuentas funcionales para el mismo cargo", async () => {
    await prisma.cargo.create({ data: { id: 921, nombre: "JEFATURA DUPLICADA TEST", activo: true } });
    await prisma.usuario.create({
      data: {
        nombre: "Cuenta 1",
        email: "cuenta-1@legacy.local",
        username: "test.cuenta-1",
        passwordHash: "hash",
        role: "JEFE",
        cargoId: 921
      }
    });

    await expect(prisma.usuario.create({
      data: {
        nombre: "Cuenta 2",
        email: "cuenta-2@legacy.local",
        username: "test.cuenta-2",
        passwordHash: "hash",
        role: "JEFE",
        cargoId: 921
      }
    })).rejects.toThrow();
  });
});
