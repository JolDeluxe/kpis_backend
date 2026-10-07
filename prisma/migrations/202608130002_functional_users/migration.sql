ALTER TABLE "Usuario" ADD COLUMN "username" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "passwordEncrypted" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "autoProvisioned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Usuario" ADD COLUMN "lastPasswordChangedAt" DATETIME;

CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_username_key" ON "Usuario"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_cargoId_unique_not_null" ON "Usuario"("cargoId") WHERE "cargoId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorUserId" TEXT,
  "targetUserId" TEXT,
  "event" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AuditLog_event_createdAt_idx" ON "AuditLog"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_targetUserId_idx" ON "AuditLog"("targetUserId");
