import chokidar from "chokidar";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

const candidateEnvPaths = [
  process.env.ENV_FILE,
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(import.meta.dirname, "../../.env"),
  path.resolve(import.meta.dirname, "../../../.env")
].filter(Boolean) as string[];

for (const envPath of candidateEnvPaths) {
  dotenv.config({ path: envPath });
}
dotenv.config();

const port = process.env.PORT || "3005";
const WATCH_PATH = process.env.WATCH_PATH || path.resolve(process.cwd(), "../048 KPIs Jefaturas 260807 122334.csv");
const API_URL = (process.env.API_URL || `http://localhost:${port}`).replace(/\/$/, "");
const SYNC_API_KEY = process.env.SYNC_API_KEY;
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 60000);
const stateFile = path.resolve(process.cwd(), ".sync-state.json");

if (!SYNC_API_KEY) {
  throw new Error("SYNC_API_KEY es requerida para ejecutar sync-agent.");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sha256 = async (filePath: string) => {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
};

const readState = async (): Promise<{ lastHash?: string }> => {
  try {
    return JSON.parse(await fs.readFile(stateFile, "utf8")) as { lastHash?: string };
  } catch {
    return {};
  }
};

const writeState = async (state: { lastHash?: string }) => {
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
};

const waitUntilStable = async (filePath: string) => {
  let previous = -1;
  for (let i = 0; i < 10; i += 1) {
    const stat = await fs.stat(filePath);
    if (stat.size === previous) return;
    previous = stat.size;
    await sleep(750);
  }
};

const uploadWithRetry = async (filePath: string, attempt = 0): Promise<void> => {
  const content = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/csv" }), path.basename(filePath));

  const response = await fetch(`${API_URL}/api/sync/kpis`, {
    method: "POST",
    headers: { "X-Sync-Key": SYNC_API_KEY },
    body: form
  });

  if (!response.ok) {
    if (attempt >= 5) throw new Error(`Sync fallo con HTTP ${response.status}: ${await response.text()}`);
    const delay = Math.min(30000, 1000 * 2 ** attempt);
    console.warn(`[sync-agent] HTTP ${response.status}. Reintentando en ${delay}ms.`);
    await sleep(delay);
    return uploadWithRetry(filePath, attempt + 1);
  }
};

const processFile = async (filePath: string) => {
  try {
    try {
      await fs.access(filePath);
    } catch {
      console.warn(`[sync-agent] Archivo no accesible actualmente: ${filePath}. Se reintentará en el siguiente intervalo.`);
      return;
    }

    await waitUntilStable(filePath);
    const currentHash = await sha256(filePath);
    const state = await readState();
    if (state.lastHash === currentHash) {
      console.log(`[sync-agent] Sin cambios: ${path.basename(filePath)} (${currentHash.slice(0, 8)}...)`);
      return;
    }
    await uploadWithRetry(filePath);
    await writeState({ lastHash: currentHash });
    console.log(`[sync-agent] CSV sincronizado con exito: ${path.basename(filePath)} ${currentHash}`);
  } catch (error) {
    console.error("[sync-agent] Error procesando archivo:", error);
  }
};

console.log(`[sync-agent] Vigilando ${WATCH_PATH}`);
const watcher = chokidar.watch(WATCH_PATH, { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 250 } });
watcher.on("add", processFile);
watcher.on("change", processFile);
setInterval(() => processFile(WATCH_PATH), CHECK_INTERVAL_MS);
