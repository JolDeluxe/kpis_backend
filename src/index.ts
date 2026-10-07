import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "./db/index.js";
import { env, isProduction } from "./env.js";
import { corsMiddleware } from "./middlewares/cors.js";
import authRoutes from "./routes/auth_rutas.js";
import cargosRoutes from "./routes/cargos_rutas.js";
import dashboardRoutes from "./routes/dashboard_rutas.js";
import importacionesRoutes from "./routes/importaciones_rutas.js";
import kpiSyncRoutes, { kpiSyncUserRoutes } from "./routes/kpi_sync_rutas.js";
import kpisRoutes from "./routes/kpis_rutas.js";
import syncRoutes from "./routes/sync_rutas.js";
import usuariosRoutes from "./routes/usuarios_rutas.js";
import { startKpiSyncScheduler, stopKpiSyncScheduler } from "./modules/kpi-sync/service.js";
import { logger } from "./utils/logger.js";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(corsMiddleware);
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => logger.info({ method: req.method, path: req.path, statusCode: res.statusCode, ms: Date.now() - startedAt }, "http"));
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "kpi-jefaturas" }));
app.use("/api/auth", authRoutes);
app.use("/api/cargos", cargosRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/kpis", kpisRoutes);
app.use("/api/importaciones", importacionesRoutes);
app.use("/api/kpi-sync", kpiSyncUserRoutes);
app.use("/api/admin/kpi-sync", kpiSyncRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/usuarios", usuariosRoutes);

const frontendDist = path.resolve(process.cwd(), "../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ service: "kpi-jefaturas-backend", status: "running", apiDocs: "/api/health" });
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  const message = isProduction && statusCode >= 500 ? "Error interno" : error instanceof Error ? error.message : "Error interno";
  if (statusCode >= 500) logger.error({ error }, message);
  res.status(statusCode).json({ message });
});

let server: ReturnType<typeof app.listen> | null = null;

export const startServer = async () => {
  if (server) return server;

  // Reconciliar jerarquía de cargos antes de arrancar el servidor
  try {
    const { reconcileCargosHierarchy } = await import("./modules/cargos/reconciliation.js");
    await reconcileCargosHierarchy();
  } catch (err) {
    logger.error({ err }, "Error reconciliando jerarquia al arrancar");
  }

  server = app.listen(env.PORT, "0.0.0.0", () => {
    logger.info(`KPI Jefaturas listo en http://localhost:${env.PORT} (${env.NODE_ENV})`);
    if (!isProduction) logger.info("Frontend dev esperado en http://localhost:5173 con proxy /api");
    startKpiSyncScheduler();
  });
  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}

const shutdown = async () => {
  if (!server) {
    stopKpiSyncScheduler();
    await prisma.$disconnect();
    process.exit(0);
  }
  server.close(async () => {
    stopKpiSyncScheduler();
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
