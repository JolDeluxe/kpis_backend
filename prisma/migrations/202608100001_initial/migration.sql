CREATE TABLE "Importacion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "filename" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedAt" DATETIME,
  "status" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT
);

CREATE TABLE "Cargo" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "parentId" INTEGER,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Cargo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Cargo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Usuario" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "cargoId" INTEGER,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Usuario_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Kpi" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "KpiResultado" (
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
  "valorNumero" DOUBLE PRECISION,
  "resultadoNumero" DOUBLE PRECISION,
  "objetivoNumero" DOUBLE PRECISION,
  "valorRealNumero" DOUBLE PRECISION,
  "calificacionNumero" DOUBLE PRECISION,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "KpiResultado_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "Importacion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "KpiResultado_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "KpiResultado_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
CREATE INDEX "Importacion_sha256_status_idx" ON "Importacion"("sha256", "status");
CREATE UNIQUE INDEX "KpiResultado_anio_periodo_cargoId_kpiId_key" ON "KpiResultado"("anio", "periodo", "cargoId", "kpiId");
CREATE INDEX "KpiResultado_cargoId_anio_periodo_idx" ON "KpiResultado"("cargoId", "anio", "periodo");
