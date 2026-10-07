export type KpiFileMetadata = {
  filename: string;
  sourceVersion: string | null;
  size?: number;
  modifiedAt?: string;
};

export type KpiFilePayload = {
  metadata: KpiFileMetadata;
  buffer: Buffer;
};

export type KpiSourceProvider = {
  source: "local" | "onedrive" | "googledrive";
  isConfigured(): boolean;
  getConfigurationWarning(): string | null;
  getMetadata(): Promise<KpiFileMetadata>;
  download(metadata: KpiFileMetadata): Promise<KpiFilePayload>;
};

export type KpiSyncRunResult = {
  status: "DISABLED" | "NO_CHANGES" | "UNSTABLE" | "IMPORTED" | "SKIPPED_DUPLICATE" | "ERROR" | "SKIPPED_RUNNING";
  message?: string;
  rowCount?: number;
  cached?: boolean;
  reused?: boolean;
  cooldownMs?: number;
};
