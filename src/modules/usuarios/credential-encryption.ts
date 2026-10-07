import crypto from "node:crypto";
import { env } from "../../env.js";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

const getEncryptionKey = () => {
  const raw = (process.env.CREDENTIALS_ENCRYPTION_KEY || env.CREDENTIALS_ENCRYPTION_KEY)?.trim();
  if (!raw) {
    const error = new Error("CREDENTIALS_ENCRYPTION_KEY requerida para gestionar credenciales recuperables.");
    Object.assign(error, { statusCode: 500 });
    throw error;
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    const error = new Error("CREDENTIALS_ENCRYPTION_KEY debe ser base64 de 32 bytes.");
    Object.assign(error, { statusCode: 500 });
    throw error;
  }
  return key;
};

export const encryptCredential = (plaintext: string) => {
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
};

export const decryptCredential = (payload: string) => {
  const [version, nonceRaw, tagRaw, ciphertextRaw] = payload.split(":");
  if (version !== VERSION || !nonceRaw || !tagRaw || !ciphertextRaw) {
    const error = new Error("Formato de credencial cifrada no soportado.");
    Object.assign(error, { statusCode: 500 });
    throw error;
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(nonceRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64")), decipher.final()]).toString("utf8");
};
