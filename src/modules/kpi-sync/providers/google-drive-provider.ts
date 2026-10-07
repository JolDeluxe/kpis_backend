import { google, type drive_v3 } from "googleapis";
import type { KpiFileMetadata, KpiFilePayload, KpiSourceProvider } from "../types.js";

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

type GoogleDriveProviderConfig = {
  fileId?: string;
  serviceAccountJsonB64?: string;
  driveClient?: Pick<drive_v3.Drive, "files">;
};

type GoogleServiceAccountJson = {
  client_email: string;
  private_key: string;
};

type GoogleDriveMetadata = {
  id?: string | null;
  name?: string | null;
  modifiedTime?: string | null;
  md5Checksum?: string | null;
  size?: string | null;
};

export class GoogleDriveProvider implements KpiSourceProvider {
  readonly source = "googledrive" as const;

  private credentials: GoogleServiceAccountJson | null | undefined;
  private credentialsWarning: string | null = null;
  private driveClient: Pick<drive_v3.Drive, "files"> | null = null;

  constructor(private readonly config: GoogleDriveProviderConfig) {
    this.driveClient = config.driveClient || null;
  }

  isConfigured() {
    return Boolean(this.config.fileId && this.getCredentials());
  }

  getConfigurationWarning() {
    if (!this.config.fileId) return "KPI_SOURCE=googledrive requiere GOOGLE_DRIVE_FILE_ID.";
    if (!this.getCredentials()) {
      return this.credentialsWarning || "KPI_SOURCE=googledrive requiere GOOGLE_SERVICE_ACCOUNT_JSON_B64 valido.";
    }
    return null;
  }

  async getMetadata(): Promise<KpiFileMetadata> {
    const warning = this.getConfigurationWarning();
    if (warning) throw new Error(warning);

    const response = await this.getDriveClient().files.get({
      fileId: this.config.fileId!,
      fields: "id,name,modifiedTime,md5Checksum,size"
    });
    const item = response.data as GoogleDriveMetadata;

    return {
      filename: item.name || "kpis-google-drive.csv",
      sourceVersion: item.md5Checksum || item.modifiedTime || item.id || null,
      size: item.size ? Number(item.size) : undefined,
      modifiedAt: item.modifiedTime || undefined
    };
  }

  async download(metadata: KpiFileMetadata): Promise<KpiFilePayload> {
    const warning = this.getConfigurationWarning();
    if (warning) throw new Error(warning);

    const response = await this.getDriveClient().files.get(
      { fileId: this.config.fileId!, alt: "media" },
      { responseType: "arraybuffer" }
    );

    return {
      metadata,
      buffer: this.toBuffer(response.data)
    };
  }

  private getCredentials() {
    if (this.credentials !== undefined) return this.credentials;
    this.credentials = null;
    this.credentialsWarning = null;

    if (!this.config.serviceAccountJsonB64) {
      this.credentialsWarning = "KPI_SOURCE=googledrive requiere GOOGLE_SERVICE_ACCOUNT_JSON_B64.";
      return null;
    }

    try {
      const decoded = Buffer.from(this.config.serviceAccountJsonB64, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as Partial<GoogleServiceAccountJson>;
      if (!parsed.client_email || !parsed.private_key) {
        this.credentialsWarning = "GOOGLE_SERVICE_ACCOUNT_JSON_B64 debe incluir client_email y private_key.";
        return null;
      }
      this.credentials = {
        client_email: parsed.client_email,
        private_key: parsed.private_key
      };
      return this.credentials;
    } catch {
      this.credentialsWarning = "GOOGLE_SERVICE_ACCOUNT_JSON_B64 no es JSON Base64 valido.";
      return null;
    }
  }

  private getDriveClient() {
    if (this.driveClient) return this.driveClient;
    const credentials = this.getCredentials();
    if (!credentials) throw new Error(this.getConfigurationWarning() || "Google Drive no configurado.");

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [DRIVE_READONLY_SCOPE]
    });
    this.driveClient = google.drive({ version: "v3", auth });
    return this.driveClient;
  }

  private toBuffer(data: unknown) {
    if (Buffer.isBuffer(data)) return data;
    if (typeof data === "string") return Buffer.from(data, "utf8");
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    throw new Error("Google Drive devolvio un contenido CSV no soportado.");
  }
}
