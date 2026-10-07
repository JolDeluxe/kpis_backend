import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/index.js";
import { env } from "../src/env.js";
import { prisma } from "../src/db/index.js";
import * as kpiSyncService from "../src/modules/kpi-sync/service.js";

const testPassword = randomUUID();
const cargo901Username = "test.auth-cargo901";
const cargo900Username = "test.auth-cargo900";
const cargo901Email = "test-auth-cargo901@legacy.local";
const cargo900Email = "test-auth-cargo900@legacy.local";

describe("endpoints protegidos", () => {
  beforeAll(async () => {
    await prisma.cargo.upsert({ where: { id: 900 }, update: { nombre: "GERENCIA TEST AUTH", parentId: null, activo: true }, create: { id: 900, nombre: "GERENCIA TEST AUTH", parentId: null, activo: true } });
    await prisma.cargo.upsert({ where: { id: 901 }, update: { nombre: "JEFATURA TEST AUTH", parentId: 900, activo: true }, create: { id: 901, nombre: "JEFATURA TEST AUTH", parentId: 900, activo: true } });

    const passwordHash = await bcrypt.hash(testPassword, 12);
    await prisma.usuario.upsert({
      where: { username: cargo901Username },
      update: { passwordHash, role: "JEFE", cargoId: 901, activo: true },
      create: { nombre: "Auth Test Cargo 901", email: cargo901Email, username: cargo901Username, passwordHash, role: "JEFE", cargoId: 901, activo: true }
    });
    await prisma.usuario.upsert({
      where: { username: cargo900Username },
      update: { passwordHash, role: "GERENTE", cargoId: 900, activo: true },
      create: { nombre: "Auth Test Cargo 900", email: cargo900Email, username: cargo900Username, passwordHash, role: "GERENTE", cargoId: 900, activo: true }
    });
  });

  afterAll(async () => {
    const users = await prisma.usuario.findMany({ where: { username: { in: [cargo901Username, cargo900Username] } }, select: { id: true } });
    await prisma.refreshSession.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
    await prisma.usuario.deleteMany({ where: { username: { in: [cargo901Username, cargo900Username] } } });
    await prisma.cargo.deleteMany({ where: { id: { in: [900, 901] } } });
  });

  it("GET /api/auth/me sin sesion regresa 401", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("login emite access/refresh HttpOnly, refresh rota token y logout revoca", async () => {
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/login")
      .send({ username: cargo901Username, password: testPassword });

    expect(login.status).toBe(200);
    expect(login.body.user.username).toBe(cargo901Username);
    const loginCookies = login.headers["set-cookie"] as unknown as string[];
    const originalRefreshCookie = loginCookies.find((cookie) => cookie.startsWith(`${env.REFRESH_COOKIE_NAME}=`));
    expect(loginCookies.some((cookie) => cookie.startsWith(`${env.COOKIE_NAME}=`) && cookie.includes("HttpOnly"))).toBe(true);
    expect(loginCookies.some((cookie) => cookie.startsWith(`${env.REFRESH_COOKIE_NAME}=`) && cookie.includes("HttpOnly"))).toBe(true);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(cargo901Username);

    const refresh = await agent.post("/api/auth/refresh");
    expect(refresh.status).toBe(200);
    const refreshCookies = refresh.headers["set-cookie"] as unknown as string[];
    expect(refreshCookies.some((cookie) => cookie.startsWith(`${env.COOKIE_NAME}=`))).toBe(true);
    expect(refreshCookies.some((cookie) => cookie.startsWith(`${env.REFRESH_COOKIE_NAME}=`))).toBe(true);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", originalRefreshCookie || "");
    expect(replay.status).toBe(401);

    const logout = await agent.post("/api/auth/logout");
    expect(logout.status).toBe(200);

    const afterLogout = await agent.get("/api/auth/me");
    expect(afterLogout.status).toBe(401);
  });

  it("login incorrecto usa mensaje generico", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "noexiste", password: "cualquiercosa" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Credenciales inválidas");
  });

  it("cargo fuera de scope regresa 403", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: cargo900Username, password: testPassword });

    const response = await agent.get("/api/kpis").query({ cargoId: 300, anio: 2026, periodo: 1 });

    expect(response.status).toBe(403);
  });

  it("sync key incorrecta es rechazada", async () => {
    const response = await request(app)
      .post("/api/sync/kpis")
      .set("X-Sync-Key", "incorrecta");

    expect(response.status).toBe(401);
  });

  it("POST /api/kpi-sync/run sin sesion regresa 401", async () => {
    const response = await request(app).post("/api/kpi-sync/run");
    expect(response.status).toBe(401);
  });

  it("usuario autenticado con acceso KPI puede solicitar sync manual sin secretos", async () => {
    const spy = vi.spyOn(kpiSyncService, "runKpiSyncManual").mockResolvedValue({
      status: "NO_CHANGES",
      message: "Sin cambios"
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: cargo901Username, password: testPassword });

    const response = await agent.post("/api/kpi-sync/run");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ status: "NO_CHANGES", message: "Sin cambios" }));
    expect(JSON.stringify(response.body)).not.toContain("GOOGLE");
    expect(JSON.stringify(response.body)).not.toContain("SERVICE_ACCOUNT");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("endpoint admin de sync sigue protegido para usuarios no admin", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: cargo901Username, password: testPassword });

    const response = await agent.post("/api/admin/kpi-sync/run");

    expect(response.status).toBe(403);
  });
});
