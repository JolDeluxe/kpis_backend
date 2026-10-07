import bcrypt from "bcryptjs";
import crypto, { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { prisma } from "../src/db/index.js";
import { buildPasswordFields } from "../src/modules/usuarios/credentials.js";

const key = crypto.randomBytes(32).toString("base64");
process.env.CREDENTIALS_ENCRYPTION_KEY ||= key;

const adminUsername = "test.system-admin";
const nonAdminUsername = "test.non-admin";
const targetUsername = "test.target-user";
const adminPassword = `Admin-Test-${randomUUID()}-742`;
const nonAdminPassword = `NoAdmin-Test-${randomUUID()}-742`;
const targetPassword = `Target-Test-${randomUUID()}-742`;

const cleanup = async () => {
  const users = await prisma.usuario.findMany({
    where: { username: { in: [adminUsername, nonAdminUsername, targetUsername] } },
    select: { id: true }
  });
  await prisma.refreshSession.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: users.map((user) => user.id) } }, { targetUserId: { in: users.map((user) => user.id) } }] } });
  await prisma.usuario.deleteMany({ where: { username: { in: [adminUsername, nonAdminUsername, targetUsername] } } });
  await prisma.cargo.deleteMany({ where: { id: { in: [910, 911] } } });
};

describe("admin users api", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.cargo.create({ data: { id: 910, nombre: "GERENCIA TEST USERS", activo: true } });
    await prisma.cargo.create({ data: { id: 911, nombre: "JEFATURA TEST USERS", parentId: 910, activo: true } });
    await prisma.usuario.create({
      data: {
        nombre: "Test System Admin",
        email: "test-system-admin@legacy.local",
        username: adminUsername,
        ...(await buildPasswordFields(adminPassword)),
        role: "ADMIN",
        cargoId: null,
        activo: true
      }
    });
    await prisma.usuario.create({
      data: {
        nombre: "Test Non Admin",
        email: "test-non-admin@legacy.local",
        username: nonAdminUsername,
        passwordHash: await bcrypt.hash(nonAdminPassword, 12),
        role: "JEFE",
        cargoId: 910,
        activo: true
      }
    });
    await prisma.usuario.create({
      data: {
        nombre: "Test Target",
        email: "test-target@legacy.local",
        username: targetUsername,
        ...(await buildPasswordFields(targetPassword)),
        role: "JEFE",
        cargoId: 911,
        activo: true
      }
    });
  });

  afterAll(cleanup);

  const login = async (username: string, password: string) => {
    const agent = request.agent(app);
    const response = await agent.post("/api/auth/login").send({ username, password });
    expect(response.status).toBe(200);
    return agent;
  };

  it("solo ADMIN con cargoId null lista usuarios y el listado no devuelve plaintext", async () => {
    const admin = await login(adminUsername, adminPassword);
    const list = await admin.get("/api/usuarios");
    expect(list.status).toBe(200);
    const target = list.body.usuarios.find((usuario: { username: string }) => usuario.username === targetUsername);
    expect(target).toBeTruthy();
    expect(target.passwordAvailable).toBe(true);
    expect(target.password).toBeUndefined();
    expect(target.passwordEncrypted).toBeUndefined();

    const nonAdmin = await login(nonAdminUsername, nonAdminPassword);
    const forbidden = await nonAdmin.get("/api/usuarios");
    expect(forbidden.status).toBe(403);
  });

  it("revela password solo a ADMIN+null, usa no-store y audita", async () => {
    const admin = await login(adminUsername, adminPassword);
    const target = await prisma.usuario.findUniqueOrThrow({ where: { username: targetUsername }, select: { id: true } });

    const reveal = await admin.get(`/api/usuarios/${target.id}/password`);
    expect(reveal.status).toBe(200);
    expect(reveal.headers["cache-control"]).toContain("no-store");
    expect(reveal.body.password).toBe(targetPassword);

    const auditCount = await prisma.auditLog.count({ where: { event: "PASSWORD_VIEWED", targetUserId: target.id } });
    expect(auditCount).toBeGreaterThan(0);
  });

  it("regenera password, revoca sesiones y bloquea password anterior", async () => {
    const targetAgent = await login(targetUsername, targetPassword);
    const admin = await login(adminUsername, adminPassword);
    const target = await prisma.usuario.findUniqueOrThrow({ where: { username: targetUsername }, select: { id: true } });

    const regenerated = await admin.post(`/api/usuarios/${target.id}/regenerate-password`);
    expect(regenerated.status).toBe(200);
    expect(regenerated.body.password).toBeTruthy();
    expect(regenerated.body.password).not.toBe(targetPassword);

    const revokedMe = await targetAgent.get("/api/auth/me");
    expect(revokedMe.status).toBe(401);

    const oldLogin = await request(app).post("/api/auth/login").send({ username: targetUsername, password: targetPassword });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/auth/login").send({ username: targetUsername, password: regenerated.body.password });
    expect(newLogin.status).toBe(200);
  }, 20000);

  it("cambia password manualmente y revoca sesiones", async () => {
    const currentPassword = (await (await login(adminUsername, adminPassword))
      .post(`/api/usuarios/${(await prisma.usuario.findUniqueOrThrow({ where: { username: targetUsername }, select: { id: true } })).id}/regenerate-password`)).body.password;
    const targetAgent = await login(targetUsername, currentPassword);
    const admin = await login(adminUsername, adminPassword);
    const target = await prisma.usuario.findUniqueOrThrow({ where: { username: targetUsername }, select: { id: true } });
    const nextPassword = `Manual-Test-${randomUUID()}-851`;

    const changed = await admin.post(`/api/usuarios/${target.id}/password`).send({ password: nextPassword });
    expect(changed.status).toBe(200);

    const revokedMe = await targetAgent.get("/api/auth/me");
    expect(revokedMe.status).toBe(401);

    const nextLogin = await request(app).post("/api/auth/login").send({ username: targetUsername, password: nextPassword });
    expect(nextLogin.status).toBe(200);
  }, 20000);
});
