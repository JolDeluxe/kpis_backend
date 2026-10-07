import type { KpiSyncState } from "@prisma/client";
import { prisma } from "../../db/index.js";
import { env } from "../../env.js";
import { importKpiCsv, type ImportCsvInput } from "../importaciones/service.js";
import { logger } from "../../utils/logger.js";
import { LocalFileProvider } from "./providers/local-file-provider.js";
import { GoogleDriveProvider } from "./providers/google-drive-provider.js";
import { OneDriveProvider } from "./providers/onedrive-provider.js";
import type { KpiFileMetadata, KpiSourceProvider, KpiSyncRunResult } from "./types.js";

const SYNC_STATE_ID = "kpi-sync";
const MANUAL_SYNC_COOLDOWN_MS = 30_000;

let syncRunning = false;
let manualSyncPromise: Promise<KpiSyncRunResult> | null = null;
let lastManualSyncResult: { completedAt: number; result: KpiSyncRunResult } | null = null;
let scheduler: NodeJS.Timeout | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createConfiguredProvider = (): KpiSourceProvider | null => {
  if (env.KPI_SOURCE === "local") {
    return new LocalFileProvider(env.KPI_LOCAL_FILE_PATH || process.env.WATCH_PATH);
  }
  if (env.KPI_SOURCE === "onedrive") {
    return new OneDriveProvider({
      tenantId: env.MS_TENANT_ID,
      clientId: env.MS_CLIENT_ID,
      clientSecret: env.MS_CLIENT_SECRET,
      driveId: env.ONEDRIVE_DRIVE_ID,
      itemId: env.ONEDRIVE_ITEM_ID,
      userId: env.ONEDRIVE_USER_ID,
      filePath: env.ONEDRIVE_FILE_PATH
    });
  }
  if (env.KPI_SOURCE === "googledrive") {
    return new GoogleDriveProvider({
      fileId: env.GOOGLE_DRIVE_FILE_ID,
      serviceAccountJsonB64: env.GOOGLE_SERVICE_ACCOUNT_JSON_B64
    });
  }
  return null;
};

const upsertState = async (data: Partial<KpiSyncState>) => {
  const source = data.source || env.KPI_SOURCE;
  return prisma.kpiSyncState.upsert({
    where: { id: SYNC_STATE_ID },
    update: data,
    create: {
      id: SYNC_STATE_ID,
      source,
      enabled: data.enabled ?? false,
      status: data.status || "IDLE",
      lastCheckedAt: data.lastCheckedAt,
      lastDetectedAt: data.lastDetectedAt,
      lastDetectedETag: data.lastDetectedETag,
      lastImportedAt: data.lastImportedAt,
      lastImportedETag: data.lastImportedETag,
      lastImportacionId: data.lastImportacionId,
      lastFilename: data.lastFilename,
      lastSha256: data.lastSha256,
      lastRowCount: data.lastRowCount,
      lastError: data.lastError
    }
  });
};

const importFromMetadata = async (provider: KpiSourceProvider, metadata: KpiFileMetadata) => {
  const payload = await provider.download(metadata);
  const input: ImportCsvInput = {
    type: "buffer",
    buffer: payload.buffer,
    filename: payload.metadata.filename,
    source: provider.source,
    sourceVersion: payload.metadata.sourceVersion
  };
  return importKpiCsv(input);
};

export const runKpiSyncNow = async (provider = createConfiguredProvider()): Promise<KpiSyncRunResult> => {
  if (syncRunning) {
    logger.warn("[KPI SYNC] sync ya en ejecucion; se omite ciclo");
    return { status: "SKIPPED_RUNNING", message: "Ya existe una sincronizacion en curso." };
  }

  syncRunning = true;
  const source = provider?.source || env.KPI_SOURCE;

  try {
    if (!provider || env.KPI_SOURCE === "disabled") {
      await upsertState({ source, enabled: false, status: "DISABLED", lastCheckedAt: new Date(), lastError: null });
      return { status: "DISABLED", message: "KPI_SOURCE=disabled." };
    }

    if (!provider.isConfigured()) {
      const warning = provider.getConfigurationWarning() || "Fuente KPI no configurada.";
      logger.warn(`[KPI SYNC] ${warning}`);
      await upsertState({ source, enabled: false, status: "DISABLED", lastCheckedAt: new Date(), lastError: warning });
      return { status: "DISABLED", message: warning };
    }

    logger.info(`[KPI SYNC] comprobando ${source}`);
    const checkedAt = new Date();
    await upsertState({ source, enabled: true, status: "CHECKING", lastCheckedAt: checkedAt, lastError: null });

    const state = await prisma.kpiSyncState.findUnique({ where: { id: SYNC_STATE_ID } });
    const metadata = await provider.getMetadata();
    await upsertState({
      source,
      enabled: true,
      status: "DETECTED",
      lastCheckedAt: checkedAt,
      lastDetectedAt: new Date(),
      lastDetectedETag: metadata.sourceVersion,
      lastFilename: metadata.filename,
      lastError: null
    });

    if (metadata.sourceVersion && state?.lastImportedETag === metadata.sourceVersion) {
      logger.info("[KPI SYNC] sin cambios");
      await upsertState({ source, enabled: true, status: "NO_CHANGES", lastCheckedAt: checkedAt, lastError: null });
      return { status: "NO_CHANGES" };
    }

    if (env.KPI_SYNC_STABILITY_DELAY_MS > 0) {
      await sleep(env.KPI_SYNC_STABILITY_DELAY_MS);
      const stableMetadata = await provider.getMetadata();
      if (metadata.sourceVersion && stableMetadata.sourceVersion !== metadata.sourceVersion) {
        logger.warn("[KPI SYNC] eTag aun cambiando; se omite hasta el siguiente ciclo");
        await upsertState({
          source,
          enabled: true,
          status: "UNSTABLE",
          lastCheckedAt: checkedAt,
          lastDetectedAt: new Date(),
          lastDetectedETag: stableMetadata.sourceVersion,
          lastFilename: stableMetadata.filename,
          lastError: null
        });
        return { status: "UNSTABLE", message: "El archivo aun no esta estable." };
      }
    }

    logger.info("[KPI SYNC] nueva version detectada");
    const result = await importFromMetadata(provider, metadata);
    await upsertState({
      source,
      enabled: true,
      status: result.duplicated ? "SKIPPED_DUPLICATE" : "IMPORTED",
      lastCheckedAt: checkedAt,
      lastImportedAt: new Date(),
      lastImportedETag: metadata.sourceVersion,
      lastImportacionId: result.importacion.id,
      lastFilename: metadata.filename,
      lastSha256: result.importacion.sha256,
      lastRowCount: result.importacion.rowCount,
      lastError: null
    });
    logger.info(`[KPI SYNC] ${result.duplicated ? "sin cambios por hash" : `importacion completada: ${result.rowCount} registros`}`);
    return { status: result.duplicated ? "SKIPPED_DUPLICATE" : "IMPORTED", rowCount: result.rowCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido en KPI sync";
    logger.error({ error }, `[KPI SYNC] ${message}`);
    await upsertState({ source, enabled: Boolean(provider?.isConfigured()), status: "ERROR", lastCheckedAt: new Date(), lastError: message });
    return { status: "ERROR", message };
  } finally {
    syncRunning = false;
  }
};

export const runKpiSyncManual = async (
  provider = createConfiguredProvider(),
  options: { nowMs?: number } = {}
): Promise<KpiSyncRunResult> => {
  const nowMs = options.nowMs ?? Date.now();

  if (manualSyncPromise) {
    const result = await manualSyncPromise;
    return { ...result, reused: true };
  }

  if (lastManualSyncResult && nowMs - lastManualSyncResult.completedAt < MANUAL_SYNC_COOLDOWN_MS) {
    return {
      ...lastManualSyncResult.result,
      cached: true,
      cooldownMs: MANUAL_SYNC_COOLDOWN_MS - (nowMs - lastManualSyncResult.completedAt)
    };
  }

  manualSyncPromise = runKpiSyncNow(provider);
  try {
    const result = await manualSyncPromise;
    lastManualSyncResult = {
      completedAt: options.nowMs ?? Date.now(),
      result
    };
    return result;
  } finally {
    manualSyncPromise = null;
  }
};

export const getKpiSyncStatus = async () => {
  const provider = createConfiguredProvider();
  const state = await prisma.kpiSyncState.findUnique({ where: { id: SYNC_STATE_ID } });
  return {
    source: env.KPI_SOURCE,
    enabled: Boolean(provider?.isConfigured() && env.KPI_SOURCE !== "disabled"),
    running: syncRunning,
    configured: Boolean(provider?.isConfigured()),
    configurationWarning: provider?.getConfigurationWarning() || null,
    intervalMs: env.KPI_SYNC_INTERVAL_MS,
    stabilityDelayMs: env.KPI_SYNC_STABILITY_DELAY_MS,
    state
  };
};

export const startKpiSyncScheduler = () => {
  if (scheduler || env.KPI_SOURCE === "disabled") return;
  const provider = createConfiguredProvider();
  if (!provider?.isConfigured()) {
    void runKpiSyncNow(provider);
    return;
  }
  if (env.KPI_SYNC_STARTUP) {
    void runKpiSyncNow(provider);
  }
  scheduler = setInterval(() => {
    void runKpiSyncNow(provider);
  }, env.KPI_SYNC_INTERVAL_MS);
};

export const stopKpiSyncScheduler = () => {
  if (!scheduler) return;
  clearInterval(scheduler);
  scheduler = null;
};
