import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleDriveProvider } from "../src/modules/kpi-sync/providers/google-drive-provider.js";
import type { KpiSourceProvider } from "../src/modules/kpi-sync/types.js";

const makeProvider = (metadataVersion: string, options: { delay?: number; failMetadata?: boolean } = {}): KpiSourceProvider => ({
  source: "onedrive",
  isConfigured: () => true,
  getConfigurationWarning: () => null,
  getMetadata: vi.fn(async () => {
    if (options.failMetadata) throw new Error("Graph 500");
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay));
    return { filename: "kpis.csv", sourceVersion: metadataVersion };
  }),
  download: vi.fn(async (metadata) => ({ metadata, buffer: Buffer.from("csv") }))
});

const fakeGoogleCredentialsB64 = Buffer.from(JSON.stringify({
  client_email: "kpi-test@example.iam.gserviceaccount.com",
  private_key: "fake-test-key"
})).toString("base64");

const makeGoogleProvider = (options: {
  version?: string;
  content?: string;
  failMetadata?: boolean;
  failContent?: boolean;
  delay?: number;
} = {}) => {
  const filesGet = vi.fn(async (params: { alt?: string }) => {
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay));
    if (params.alt === "media") {
      if (options.failContent) throw new Error("Google Drive content 500");
      return { data: Buffer.from(options.content || "csv-google") };
    }
    if (options.failMetadata) throw new Error("Google Drive metadata 500");
    return {
      data: {
        id: "drive-file-1",
        name: "kpis-google.csv",
        modifiedTime: "2026-08-14T12:00:00.000Z",
        md5Checksum: options.version || "md5-v1",
        size: "123"
      }
    };
  });

  return {
    provider: new GoogleDriveProvider({
      fileId: "drive-file-1",
      serviceAccountJsonB64: fakeGoogleCredentialsB64,
      driveClient: { files: { get: filesGet } } as never
    }),
    filesGet
  };
};

const loadService = async (
  state: { lastImportedETag?: string | null } | null,
  importImpl = vi.fn(),
  envOverrides: Record<string, unknown> = {}
) => {
  vi.resetModules();
  const updates: unknown[] = [];
  vi.doMock("../src/env.js", () => ({
    env: {
      KPI_SOURCE: "onedrive",
      KPI_LOCAL_FILE_PATH: undefined,
      KPI_SYNC_INTERVAL_MS: 1800000,
      KPI_SYNC_STABILITY_DELAY_MS: 0,
      KPI_SYNC_STARTUP: true,
      GOOGLE_DRIVE_FILE_ID: undefined,
      GOOGLE_SERVICE_ACCOUNT_JSON_B64: undefined,
      ...envOverrides
    },
    isProduction: false
  }));
  vi.doMock("../src/db/index.js", () => ({
    prisma: {
      kpiSyncState: {
        findUnique: vi.fn(async () => state),
        upsert: vi.fn(async ({ update, create }) => {
          updates.push(update);
          return { id: "kpi-sync", ...create, ...update };
        })
      }
    }
  }));
  vi.doMock("../src/modules/importaciones/service.js", () => ({
    importKpiCsv: importImpl
  }));
  const service = await import("../src/modules/kpi-sync/service.js");
  return { service, updates, importImpl };
};

describe("kpi sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("no importa cuando el eTag no cambio", async () => {
    const importCsv = vi.fn();
    const { service } = await loadService({ lastImportedETag: "v1" }, importCsv);
    const result = await service.runKpiSyncNow(makeProvider("v1"));
    expect(result.status).toBe("NO_CHANGES");
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("importa cuando hay eTag nuevo y CSV valido", async () => {
    const importCsv = vi.fn(async () => ({
      duplicated: false,
      rowCount: 10,
      importacion: { id: "imp1", sha256: "hash", rowCount: 10 }
    }));
    const { service, updates } = await loadService({ lastImportedETag: "v1" }, importCsv);
    const result = await service.runKpiSyncNow(makeProvider("v2"));
    expect(result.status).toBe("IMPORTED");
    expect(importCsv).toHaveBeenCalledWith(expect.objectContaining({ source: "onedrive", sourceVersion: "v2" }));
    expect(updates).toContainEqual(expect.objectContaining({ status: "IMPORTED", lastImportedETag: "v2" }));
  });

  it("si el CSV nuevo es invalido conserva el ultimo eTag importado", async () => {
    const importCsv = vi.fn(async () => {
      throw new Error("CSV invalido");
    });
    const { service, updates } = await loadService({ lastImportedETag: "v1" }, importCsv);
    const result = await service.runKpiSyncNow(makeProvider("v2"));
    expect(result.status).toBe("ERROR");
    expect(updates).not.toContainEqual(expect.objectContaining({ lastImportedETag: "v2" }));
    expect(updates).toContainEqual(expect.objectContaining({ status: "ERROR", lastError: "CSV invalido" }));
  });

  it("si Graph falla no tira la app ni importa", async () => {
    const importCsv = vi.fn();
    const { service } = await loadService({ lastImportedETag: "v1" }, importCsv);
    const result = await service.runKpiSyncNow(makeProvider("v2", { failMetadata: true }));
    expect(result.status).toBe("ERROR");
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("evita sincronizaciones simultaneas", async () => {
    const importCsv = vi.fn(async () => ({
      duplicated: false,
      rowCount: 1,
      importacion: { id: "imp1", sha256: "hash", rowCount: 1 }
    }));
    const { service } = await loadService({ lastImportedETag: "v1" }, importCsv);
    const first = service.runKpiSyncNow(makeProvider("v2", { delay: 50 }));
    const second = await service.runKpiSyncNow(makeProvider("v2"));
    expect(second.status).toBe("SKIPPED_RUNNING");
    await first;
  });

  it("configura Google Drive con credenciales Base64 y lee metadata util", async () => {
    const { provider, filesGet } = makeGoogleProvider({ version: "md5-v2" });
    expect(provider.isConfigured()).toBe(true);
    expect(provider.getConfigurationWarning()).toBeNull();

    const metadata = await provider.getMetadata();
    expect(metadata).toEqual({
      filename: "kpis-google.csv",
      sourceVersion: "md5-v2",
      size: 123,
      modifiedAt: "2026-08-14T12:00:00.000Z"
    });
    expect(filesGet).toHaveBeenCalledWith({
      fileId: "drive-file-1",
      fields: "id,name,modifiedTime,md5Checksum,size"
    });
  });

  it("Google Drive sin cambios no descarga ni importa", async () => {
    const importCsv = vi.fn();
    const { service } = await loadService({ lastImportedETag: "md5-v1" }, importCsv, { KPI_SOURCE: "googledrive" });
    const { provider, filesGet } = makeGoogleProvider({ version: "md5-v1" });

    const result = await service.runKpiSyncNow(provider);

    expect(result.status).toBe("NO_CHANGES");
    expect(importCsv).not.toHaveBeenCalled();
    expect(filesGet).toHaveBeenCalledTimes(1);
  });

  it("Google Drive cambiado descarga en memoria e importa el CSV", async () => {
    const importCsv = vi.fn(async () => ({
      duplicated: false,
      rowCount: 20,
      importacion: { id: "imp-google", sha256: "hash-google", rowCount: 20 }
    }));
    const { service, updates } = await loadService({ lastImportedETag: "md5-v1" }, importCsv, { KPI_SOURCE: "googledrive" });
    const { provider, filesGet } = makeGoogleProvider({ version: "md5-v2", content: "csv actualizado" });

    const result = await service.runKpiSyncNow(provider);

    expect(result.status).toBe("IMPORTED");
    expect(importCsv).toHaveBeenCalledWith(expect.objectContaining({
      type: "buffer",
      buffer: Buffer.from("csv actualizado"),
      filename: "kpis-google.csv",
      source: "googledrive",
      sourceVersion: "md5-v2"
    }));
    expect(updates).toContainEqual(expect.objectContaining({ status: "IMPORTED", lastImportedETag: "md5-v2" }));
    expect(filesGet).toHaveBeenCalledWith({ fileId: "drive-file-1", alt: "media" }, { responseType: "arraybuffer" });
  });

  it("Google Drive con CSV invalido conserva el dataset anterior", async () => {
    const importCsv = vi.fn(async () => {
      throw new Error("CSV invalido");
    });
    const { service, updates } = await loadService({ lastImportedETag: "md5-v1" }, importCsv, { KPI_SOURCE: "googledrive" });
    const { provider } = makeGoogleProvider({ version: "md5-v2" });

    const result = await service.runKpiSyncNow(provider);

    expect(result.status).toBe("ERROR");
    expect(updates).not.toContainEqual(expect.objectContaining({ lastImportedETag: "md5-v2" }));
    expect(updates).toContainEqual(expect.objectContaining({ status: "ERROR", lastError: "CSV invalido" }));
  });

  it("si Google Drive falla la app sigue viva y no importa", async () => {
    const importCsv = vi.fn();
    const { service } = await loadService({ lastImportedETag: "md5-v1" }, importCsv, { KPI_SOURCE: "googledrive" });
    const { provider } = makeGoogleProvider({ version: "md5-v2", failMetadata: true });

    const result = await service.runKpiSyncNow(provider);

    expect(result.status).toBe("ERROR");
    expect(result.message).toBe("Google Drive metadata 500");
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("Google Drive con credenciales incompletas deshabilita sync sin tirar la app", async () => {
    const importCsv = vi.fn();
    const { service } = await loadService(null, importCsv, { KPI_SOURCE: "googledrive" });
    const provider = new GoogleDriveProvider({ fileId: "drive-file-1" });

    const result = await service.runKpiSyncNow(provider);

    expect(result.status).toBe("DISABLED");
    expect(result.message).toContain("GOOGLE_SERVICE_ACCOUNT_JSON_B64");
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("Google Drive evita sincronizaciones simultaneas", async () => {
    const importCsv = vi.fn(async () => ({
      duplicated: false,
      rowCount: 1,
      importacion: { id: "imp-google", sha256: "hash-google", rowCount: 1 }
    }));
    const { service } = await loadService({ lastImportedETag: "md5-v1" }, importCsv, { KPI_SOURCE: "googledrive" });
    const firstProvider = makeGoogleProvider({ version: "md5-v2", delay: 50 }).provider;
    const secondProvider = makeGoogleProvider({ version: "md5-v2" }).provider;

    const first = service.runKpiSyncNow(firstProvider);
    const second = await service.runKpiSyncNow(secondProvider);

    expect(second.status).toBe("SKIPPED_RUNNING");
    await first;
  });

  it("sync manual reutiliza resultado reciente durante cooldown", async () => {
    const importCsv = vi.fn(async () => ({
      duplicated: false,
      rowCount: 4,
      importacion: { id: "imp1", sha256: "hash", rowCount: 4 }
    }));
    const { service } = await loadService({ lastImportedETag: "v1" }, importCsv);
    const firstProvider = makeProvider("v2");
    const secondProvider = makeProvider("v3");

    const first = await service.runKpiSyncManual(firstProvider, { nowMs: 1000 });
    const second = await service.runKpiSyncManual(secondProvider, { nowMs: 2000 });

    expect(first.status).toBe("IMPORTED");
    expect(second.status).toBe("IMPORTED");
    expect(second.cached).toBe(true);
    expect(second.cooldownMs).toBe(29000);
    expect(firstProvider.getMetadata).toHaveBeenCalledTimes(1);
    expect(secondProvider.getMetadata).not.toHaveBeenCalled();
    expect(importCsv).toHaveBeenCalledTimes(1);
  });

  it("sync manual concurrente reutiliza la misma promesa y no duplica importacion", async () => {
    const importCsv = vi.fn(async () => ({
      duplicated: false,
      rowCount: 2,
      importacion: { id: "imp1", sha256: "hash", rowCount: 2 }
    }));
    const { service } = await loadService({ lastImportedETag: "v1" }, importCsv);
    const firstProvider = makeProvider("v2", { delay: 50 });
    const secondProvider = makeProvider("v3");

    const first = service.runKpiSyncManual(firstProvider, { nowMs: 1000 });
    const second = service.runKpiSyncManual(secondProvider, { nowMs: 1001 });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.status).toBe("IMPORTED");
    expect(secondResult.status).toBe("IMPORTED");
    expect(secondResult.reused).toBe(true);
    expect(firstProvider.getMetadata).toHaveBeenCalledTimes(1);
    expect(secondProvider.getMetadata).not.toHaveBeenCalled();
    expect(importCsv).toHaveBeenCalledTimes(1);
  });

  it("KPI_SOURCE=local sigue creando provider local", async () => {
    const { service } = await loadService(null, vi.fn(), {
      KPI_SOURCE: "local",
      KPI_LOCAL_FILE_PATH: "C:/tmp/kpis.csv"
    });

    const provider = service.createConfiguredProvider();

    expect(provider?.source).toBe("local");
    expect(provider?.isConfigured()).toBe(true);
  });
});
