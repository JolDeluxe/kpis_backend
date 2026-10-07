import bcrypt from "bcryptjs";
import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { prisma } from "../src/db/index.js";
import { decryptCredential } from "../src/modules/usuarios/credential-encryption.js";
import { buildPasswordFields } from "../src/modules/usuarios/credentials.js";

process.env.CREDENTIALS_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("base64");

const testTag = "test.credentials-flow";
const cargoIds = [930, 931, 932, 933, 934, 935];
const passwordFor = (label: string) => `${label}-Test-${randomUUID()}-842`;

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const cleanup = async () => {
  const users = await prisma.usuario.findMany({ where: { username: { startsWith: testTag } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  await prisma.refreshSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }] } });
  await prisma.usuario.deleteMany({ where: { username: { startsWith: testTag } } });
  await prisma.cargo.deleteMany({ where: { id: { in: cargoIds } } });
};

const createUser = async (input: { username: string; nombre: string; role: "ADMIN" | "DIRECCION" | "GERENTE" | "JEFE"; cargoId: number | null; password: string; activo?: boolean }) => prisma.usuario.create({
  data: {
    nombre: input.nombre,
    email: `${input.username.replace(/\./g, "-")}@legacy.local`,
    username: input.username,
    ...(await buildPasswordFields(input.password)),
    role: input.role,
    cargoId: input.cargoId,
    activo: input.activo ?? true
  }
});

const createFixture = async () => {
  await prisma.cargo.createMany({
    data: [
      { id: 930, nombre: "MBC TEST", activo: true },
      { id: 931, nombre: "DIRECCION TEST", parentId: 930, activo: true },
      { id: 932, nombre: "GERENCIA TEST", parentId: 931, activo: true },
      { id: 933, nombre: "JEFATURA TEST", parentId: 932, activo: true },
      { id: 934, nombre: "JEFATURA BULK TEST", parentId: 932, activo: true },
      { id: 935, nombre: "JEFATURA INACTIVA TEST", parentId: 932, activo: true }
    ]
  });

  const passwords = {
    admin: passwordFor("AdminFlow"),
    mbc: passwordFor("MbcFlow"),
    direccion: passwordFor("DireccionFlow"),
    gerente: passwordFor("GerenteFlow"),
    jefe: passwordFor("JefeFlow"),
    bulk: passwordFor("BulkFlow"),
    inactive: passwordFor("InactiveFlow"),
    self: passwordFor("SelfFlow")
  };

  const admin = await createUser({ username: `${testTag}.admin`, nombre: "Admin Flow", role: "ADMIN", cargoId: null, password: passwords.admin });
  const mbc = await createUser({ username: `${testTag}.mbc`, nombre: "MBC TEST", role: "DIRECCION", cargoId: 930, password: passwords.mbc });
  const direccion = await createUser({ username: `${testTag}.direccion`, nombre: "DIRECCION TEST", role: "DIRECCION", cargoId: 931, password: passwords.direccion });
  const gerente = await createUser({ username: `${testTag}.gerente`, nombre: "GERENCIA TEST", role: "GERENTE", cargoId: 932, password: passwords.gerente });
  const jefe = await createUser({ username: `${testTag}.jefe`, nombre: "JEFATURA TEST", role: "JEFE", cargoId: 933, password: passwords.jefe });
  const bulk = await createUser({ username: `${testTag}.bulk`, nombre: "JEFATURA BULK TEST", role: "JEFE", cargoId: 934, password: passwords.bulk });
  const inactive = await createUser({ username: `${testTag}.inactive`, nombre: "JEFATURA INACTIVA TEST", role: "JEFE", cargoId: 935, password: passwords.inactive, activo: false });
  const self = await createUser({ username: `${testTag}.self`, nombre: "Self Flow", role: "JEFE", cargoId: null, password: passwords.self });

  return { users: { admin, mbc, direccion, gerente, jefe, bulk, inactive, self }, passwords };
};

const login = async (username: string, password: string) => {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ username, password });
  expect(response.status).toBe(200);
  return agent;
};

const csvFilesExist = (filename: string) => [
  path.resolve(process.cwd(), filename),
  path.resolve(process.cwd(), "../data", filename),
  path.resolve(process.cwd(), "data", filename)
].some((candidate) => fs.existsSync(candidate));

describe.sequential("credential admin flows", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    await cleanup();
    fixture = await createFixture();
  }, 30000);

  afterEach(cleanup, 30000);

  it("solo ADMIN con cargoId null puede revelar todas las credenciales", async () => {
    const admin = await login(fixture.users.admin.username!, fixture.passwords.admin);
    const revealed = await admin.post("/api/usuarios/reveal-all-passwords");
    expect(revealed.status).toBe(200);
    expect(revealed.headers["cache-control"]).toContain("no-store");
    expect(revealed.headers.pragma).toContain("no-cache");
    expect(revealed.body.usuarios.find((user: { usuario: string }) => user.usuario === fixture.users.bulk.username).password).toBe(fixture.passwords.bulk);

    for (const key of ["mbc", "direccion", "gerente", "jefe"] as const) {
      const agent = await login(fixture.users[key].username!, fixture.passwords[key]);
      const forbidden = await agent.post("/api/usuarios/reveal-all-passwords");
      expect(forbidden.status).toBe(403);
    }

    const auditCount = await prisma.auditLog.count({ where: { event: "PASSWORDS_BULK_VIEWED", actorUserId: fixture.users.admin.id } });
    expect(auditCount).toBeGreaterThan(0);
  });

  it("listado normal sigue sin plaintext ni passwordEncrypted", async () => {
    const admin = await login(fixture.users.admin.username!, fixture.passwords.admin);
    const list = await admin.get("/api/usuarios");
    expect(list.status).toBe(200);
    const bulk = list.body.usuarios.find((user: { username: string }) => user.username === fixture.users.bulk.username);
    expect(bulk.password).toBeUndefined();
    expect(bulk.passwordEncrypted).toBeUndefined();
    expect(bulk.passwordAvailable).toBe(true);
  });

  it("exporta CSV protegido, incluye activos e inactivos y no expone ciphertext", async () => {
    const admin = await login(fixture.users.admin.username!, fixture.passwords.admin);
    const exported = await admin.post("/api/usuarios/export-credentials");
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.headers["content-disposition"]).toContain("attachment");
    expect(exported.headers["cache-control"]).toContain("no-store");
    expect(exported.text).toContain("USUARIO,CONTRASEÑA,PUESTO,CARGO,ROL,ESTADO");
    expect(exported.text).toContain(`${fixture.users.bulk.username},${fixture.passwords.bulk},JEFATURA BULK TEST,934,JEFE,ACTIVO`);
    expect(exported.text).toContain(`${fixture.users.inactive.username},${fixture.passwords.inactive},JEFATURA INACTIVA TEST,935,JEFE,INACTIVO`);
    expect(exported.text).not.toContain("passwordEncrypted");
    expect(exported.text).not.toContain("v1:");
    const filename = /filename="([^"]+)"/.exec(exported.headers["content-disposition"])?.[1] || "";
    expect(filename).toBeTruthy();
    expect(csvFilesExist(filename)).toBe(false);

    const nonAdmin = await login(fixture.users.jefe.username!, fixture.passwords.jefe);
    const forbidden = await nonAdmin.post("/api/usuarios/export-credentials");
    expect(forbidden.status).toBe(403);

    const auditCount = await prisma.auditLog.count({ where: { event: "PASSWORDS_EXPORTED", actorUserId: fixture.users.admin.id } });
    expect(auditCount).toBeGreaterThan(0);
  });

  it("usuario cambia su propia contraseña y actualiza passwordHash/passwordEncrypted", async () => {
    const admin = await login(fixture.users.admin.username!, fixture.passwords.admin);
    const self = await login(fixture.users.self.username!, fixture.passwords.self);
    const nextPassword = passwordFor("SelfNext");

    const changed = await self.post("/api/auth/change-password").send({ currentPassword: fixture.passwords.self, newPassword: nextPassword, userId: fixture.users.bulk.id });
    expect(changed.status).toBe(200);
    expect(changed.body.reauthRequired).toBe(true);

    const oldLogin = await request(app).post("/api/auth/login").send({ username: fixture.users.self.username, password: fixture.passwords.self });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send({ username: fixture.users.self.username, password: nextPassword });
    expect(newLogin.status).toBe(200);

    const dbSelf = await prisma.usuario.findUniqueOrThrow({ where: { id: fixture.users.self.id }, select: { passwordHash: true, passwordEncrypted: true } });
    expect(await bcrypt.compare(nextPassword, dbSelf.passwordHash)).toBe(true);
    expect(decryptCredential(dbSelf.passwordEncrypted!)).toBe(nextPassword);

    const revealed = await admin.get(`/api/usuarios/${fixture.users.self.id}/password`);
    expect(revealed.status).toBe(200);
    expect(revealed.body.password).toBe(nextPassword);

    const bulkOldLogin = await request(app).post("/api/auth/login").send({ username: fixture.users.bulk.username, password: fixture.passwords.bulk });
    expect(bulkOldLogin.status).toBe(200);
  }, 25000);

  it("contraseña actual incorrecta falla", async () => {
    const self = await login(fixture.users.self.username!, fixture.passwords.self);
    const changed = await self.post("/api/auth/change-password").send({ currentPassword: "incorrecta", newPassword: passwordFor("BadCurrent") });
    expect(changed.status).toBe(400);
    expect(changed.body.message).toBe("La contrasena actual no es correcta.");
  });

  it("admin tambien puede cambiar su propia contraseña", async () => {
    const admin = await login(fixture.users.admin.username!, fixture.passwords.admin);
    const nextPassword = passwordFor("AdminNext");
    const changed = await admin.post("/api/auth/change-password").send({ currentPassword: fixture.passwords.admin, newPassword: nextPassword });
    expect(changed.status).toBe(200);

    const dbAdmin = await prisma.usuario.findUniqueOrThrow({ where: { id: fixture.users.admin.id }, select: { passwordEncrypted: true } });
    expect(decryptCredential(dbAdmin.passwordEncrypted!)).toBe(nextPassword);
  });
});
