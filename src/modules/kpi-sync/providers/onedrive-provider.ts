import type { KpiFileMetadata, KpiFilePayload, KpiSourceProvider } from "../types.js";

type OneDriveProviderConfig = {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  driveId?: string;
  itemId?: string;
  userId?: string;
  filePath?: string;
};

type GraphDriveItem = {
  id: string;
  name: string;
  eTag?: string;
  cTag?: string;
  size?: number;
  lastModifiedDateTime?: string;
};

export class OneDriveProvider implements KpiSourceProvider {
  readonly source = "onedrive" as const;

  constructor(private readonly config: OneDriveProviderConfig) {}

  isConfigured() {
    return Boolean(
      this.config.tenantId
      && this.config.clientId
      && this.config.clientSecret
      && (
        (this.config.driveId && this.config.itemId)
        || (this.config.userId && this.config.filePath)
      )
    );
  }

  getConfigurationWarning() {
    if (!this.config.tenantId || !this.config.clientId || !this.config.clientSecret) {
      return "KPI_SOURCE=onedrive requiere MS_TENANT_ID, MS_CLIENT_ID y MS_CLIENT_SECRET.";
    }
    if (!((this.config.driveId && this.config.itemId) || (this.config.userId && this.config.filePath))) {
      return "KPI_SOURCE=onedrive requiere ONEDRIVE_DRIVE_ID + ONEDRIVE_ITEM_ID o ONEDRIVE_USER_ID + ONEDRIVE_FILE_PATH.";
    }
    return null;
  }

  async getMetadata(): Promise<KpiFileMetadata> {
    const item = await this.fetchDriveItem();
    return {
      filename: item.name,
      sourceVersion: item.eTag || item.cTag || item.lastModifiedDateTime || item.id,
      size: item.size,
      modifiedAt: item.lastModifiedDateTime
    };
  }

  async download(metadata: KpiFileMetadata): Promise<KpiFilePayload> {
    const response = await this.graphFetch(this.contentUrl());
    if (!response.ok) throw new Error(`Microsoft Graph content HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return {
      metadata,
      buffer: Buffer.from(arrayBuffer)
    };
  }

  private async fetchDriveItem() {
    const response = await this.graphFetch(`${this.itemUrl()}?$select=id,name,eTag,cTag,size,lastModifiedDateTime`);
    if (!response.ok) throw new Error(`Microsoft Graph metadata HTTP ${response.status}`);
    return await response.json() as GraphDriveItem;
  }

  private async graphFetch(url: string) {
    return fetch(url, { headers: { Authorization: `Bearer ${await this.getAccessToken()}` } });
  }

  private async getAccessToken() {
    const warning = this.getConfigurationWarning();
    if (warning) throw new Error(warning);

    const body = new URLSearchParams({
      client_id: this.config.clientId!,
      client_secret: this.config.clientSecret!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    });

    const response = await fetch(`https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!response.ok) throw new Error(`Microsoft identity HTTP ${response.status}`);
    const json = await response.json() as { access_token?: string };
    if (!json.access_token) throw new Error("Microsoft identity no devolvio access_token.");
    return json.access_token;
  }

  private itemUrl() {
    if (this.config.driveId && this.config.itemId) {
      return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(this.config.itemId)}`;
    }
    const normalizedPath = `/${(this.config.filePath || "").replace(/^\/+/, "")}`;
    return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.userId!)}/drive/root:${encodeURI(normalizedPath)}`;
  }

  private contentUrl() {
    if (this.config.driveId && this.config.itemId) {
      return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(this.config.itemId)}/content`;
    }
    const normalizedPath = `/${(this.config.filePath || "").replace(/^\/+/, "")}`;
    return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.userId!)}/drive/root:${encodeURI(normalizedPath)}:/content`;
  }
}
