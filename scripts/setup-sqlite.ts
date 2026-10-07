import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import dotenv from "dotenv";

const candidateEnvPaths = [
  process.env.ENV_FILE,
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(import.meta.dirname, "../../.env")
].filter(Boolean) as string[];

for (const envPath of candidateEnvPaths) {
  dotenv.config({ path: envPath });
}
dotenv.config();

const sqlitePathFromUrl = (databaseUrl?: string) => {
  if (!databaseUrl?.startsWith("file:")) return null;
  const filePath = databaseUrl.slice("file:".length);
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), "prisma", filePath.replace(/^\.\//, ""));
};

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : sqlitePathFromUrl(process.env.DATABASE_URL) || path.resolve(process.cwd(), "prisma/dev.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

const existingKpiColumns = db.prepare("PRAGMA table_info('Kpi')").all() as Array<{ name: string; type: string }>;
const existingKpiId = existingKpiColumns.find((column) => column.name === "id");
if (existingKpiId && existingKpiId.type.toUpperCase() !== "TEXT") {
  db.close();
  throw new Error(
    `[setup-sqlite] Incompatibilidad de esquema detectada: la columna Kpi.id tiene tipo '${existingKpiId.type}' en lugar de TEXT. ` +
    `Por seguridad de producción, NO se borrarán tablas automáticamente. Respalde la base y realice la migración manual requerida.`
  );
}

db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Importacion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "filename" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "sourceVersion" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedAt" DATETIME,
  "status" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT
);

CREATE TABLE IF NOT EXISTS "Cargo" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "parentId" INTEGER,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Cargo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Cargo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Usuario" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "username" TEXT,
  "passwordHash" TEXT NOT NULL,
  "passwordEncrypted" TEXT,
  "role" TEXT NOT NULL,
  "cargoId" INTEGER,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "autoProvisioned" BOOLEAN NOT NULL DEFAULT false,
  "lastPasswordChangedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Usuario_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RefreshSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "lastUsedAt" DATETIME,
  "revokedAt" DATETIME,
  "userAgent" TEXT,
  "ip" TEXT,
  CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "KpiSyncState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'IDLE',
  "lastCheckedAt" DATETIME,
  "lastDetectedAt" DATETIME,
  "lastDetectedETag" TEXT,
  "lastImportedAt" DATETIME,
  "lastImportedETag" TEXT,
  "lastImportacionId" TEXT,
  "lastFilename" TEXT,
  "lastSha256" TEXT,
  "lastRowCount" INTEGER,
  "lastError" TEXT,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorUserId" TEXT,
  "targetUserId" TEXT,
  "event" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Kpi" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "KpiResultado" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "importacionId" TEXT NOT NULL,
  "anio" INTEGER NOT NULL,
  "periodo" INTEGER NOT NULL,
  "cargoId" INTEGER NOT NULL,
  "orden" INTEGER NOT NULL,
  "kpiId" TEXT NOT NULL,
  "valorRaw" TEXT,
  "resultadoRaw" TEXT,
  "objetivoRaw" TEXT,
  "valorRealRaw" TEXT,
  "calificacionRaw" TEXT,
  "tendenciaRaw" TEXT,
  "parametrosRaw" TEXT,
  "sumaValorRaw" TEXT,
  "sumaCalificacionRaw" TEXT,
  "calificacionGeneralRaw" TEXT,
  "valorNumero" REAL,
  "resultadoNumero" REAL,
  "objetivoNumero" REAL,
  "valorRealNumero" REAL,
  "calificacionNumero" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "KpiResultado_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "Importacion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "KpiResultado_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "KpiResultado_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshSession_userId_idx" ON "RefreshSession"("userId");
CREATE INDEX IF NOT EXISTS "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");
CREATE INDEX IF NOT EXISTS "AuditLog_event_createdAt_idx" ON "AuditLog"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_targetUserId_idx" ON "AuditLog"("targetUserId");
CREATE INDEX IF NOT EXISTS "Importacion_sha256_status_idx" ON "Importacion"("sha256", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "KpiResultado_anio_periodo_cargoId_kpiId_key" ON "KpiResultado"("anio", "periodo", "cargoId", "kpiId");
CREATE INDEX IF NOT EXISTS "KpiResultado_cargoId_anio_periodo_idx" ON "KpiResultado"("cargoId", "anio", "periodo");
`);

const ensureColumn = (table: string, column: string, definition: string) => {
  const columns = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE "${table}" ADD COLUMN ${definition}`);
};

ensureColumn("Importacion", "source", "\"source\" TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("Importacion", "sourceVersion", "\"sourceVersion\" TEXT");
ensureColumn("Usuario", "username", "\"username\" TEXT");
ensureColumn("Usuario", "passwordEncrypted", "\"passwordEncrypted\" TEXT");
ensureColumn("Usuario", "autoProvisioned", "\"autoProvisioned\" BOOLEAN NOT NULL DEFAULT false");
ensureColumn("Usuario", "lastPasswordChangedAt", "\"lastPasswordChangedAt\" DATETIME");
db.exec(`CREATE INDEX IF NOT EXISTS "Importacion_source_sourceVersion_idx" ON "Importacion"("source", "sourceVersion");`);

const duplicateCargoIds = db.prepare(`
  SELECT "cargoId"
  FROM "Usuario"
  WHERE "cargoId" IS NOT NULL
  GROUP BY "cargoId"
  HAVING COUNT(*) > 1
`).all() as Array<{ cargoId: number }>;

for (const { cargoId } of duplicateCargoIds) {
  const users = db.prepare(`
    SELECT "id", "username", "passwordEncrypted", "autoProvisioned", "createdAt"
    FROM "Usuario"
    WHERE "cargoId" = ?
    ORDER BY
      CASE WHEN "username" IS NOT NULL AND "username" <> '' THEN 0 ELSE 1 END,
      CASE WHEN "passwordEncrypted" IS NOT NULL AND "passwordEncrypted" <> '' THEN 0 ELSE 1 END,
      CASE WHEN "autoProvisioned" = 1 THEN 0 ELSE 1 END,
      "createdAt" ASC
  `).all(cargoId) as Array<{ id: string }>;

  const [, ...duplicates] = users;
  for (const user of duplicates) {
    db.prepare(`UPDATE "Usuario" SET "cargoId" = NULL, "activo" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`).run(user.id);
  }
}

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_username_key" ON "Usuario"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_cargoId_unique_not_null" ON "Usuario"("cargoId") WHERE "cargoId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AuditLog_event_createdAt_idx" ON "AuditLog"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_targetUserId_idx" ON "AuditLog"("targetUserId");
`);

db.close();
console.log(`SQLite listo en ${dbPath}`);
