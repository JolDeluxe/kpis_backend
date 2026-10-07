import fs from "node:fs/promises";
import path from "node:path";
import type { KpiFileMetadata, KpiFilePayload, KpiSourceProvider } from "../types.js";

export class LocalFileProvider implements KpiSourceProvider {
  readonly source = "local" as const;

  constructor(private readonly filePath?: string) {}

  isConfigured() {
    return Boolean(this.filePath);
  }

  getConfigurationWarning() {
    return this.filePath ? null : "KPI_SOURCE=local requiere KPI_LOCAL_FILE_PATH.";
  }

  async getMetadata(): Promise<KpiFileMetadata> {
    if (!this.filePath) throw new Error(this.getConfigurationWarning() || "Archivo local no configurado.");
    const stat = await fs.stat(this.filePath);
    return {
      filename: path.basename(this.filePath),
      sourceVersion: `${stat.size}:${Math.trunc(stat.mtimeMs)}`,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    };
  }

  async download(metadata: KpiFileMetadata): Promise<KpiFilePayload> {
    if (!this.filePath) throw new Error(this.getConfigurationWarning() || "Archivo local no configurado.");
    return { metadata, buffer: await fs.readFile(this.filePath) };
  }
}
