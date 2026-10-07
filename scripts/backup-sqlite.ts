/**
 * Script de respaldo seguro de la base de datos SQLite en producción.
 * Utiliza VACUUM INTO para garantizar una copia consistente y atómica
 * sin riesgo de corrupción incluso si existen lecturas concurrentes.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
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
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath.replace(/^\.\//, ""));
};

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : sqlitePathFromUrl(process.env.DATABASE_URL) || path.resolve(process.cwd(), "data/kpi.db");

if (!fs.existsSync(dbPath)) {
  console.error(`[backup-db] Error: La base de datos no existe en ${dbPath}`);
  process.exit(1);
}

const backupDir = path.resolve(path.dirname(dbPath), "backups");
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const backupTarget = path.join(backupDir, `kpi-backup-${timestamp}.db`);

try {
  const db = new DatabaseSync(dbPath);
  db.exec(`VACUUM INTO '${backupTarget.replace(/\\/g, "/")}'`);
  db.close();

  // Validar integridad del archivo de backup generado
  const verifyDb = new DatabaseSync(backupTarget);
  const integrity = verifyDb.prepare("PRAGMA integrity_check").all();
  verifyDb.close();

  if (integrity.length === 1 && (integrity[0] as { integrity_check?: string }).integrity_check === "ok") {
    console.log(`[backup-db] Respaldo exitoso y verificado: ${backupTarget}`);
  } else {
    throw new Error(`Fallo de integridad en respaldo: ${JSON.stringify(integrity)}`);
  }

  // Política de retención: conservar los últimos 30 respaldos
  const backups = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("kpi-backup-") && f.endsWith(".db"))
    .map((f) => ({
      name: f,
      fullPath: path.join(backupDir, f),
      time: fs.statSync(path.join(backupDir, f)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  if (backups.length > 30) {
    const toRemove = backups.slice(30);
    for (const b of toRemove) {
      fs.unlinkSync(b.fullPath);
      console.log(`[backup-db] Retención: eliminado respaldo antiguo ${b.name}`);
    }
  }
} catch (error) {
  console.error("[backup-db] Error ejecutando respaldo:", error);
  process.exit(1);
}
