ALTER TABLE "Importacion" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Importacion" ADD COLUMN "sourceVersion" TEXT;

CREATE TABLE "KpiSyncState" (
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
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "Importacion_source_sourceVersion_idx" ON "Importacion"("source", "sourceVersion");
