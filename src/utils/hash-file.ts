import crypto from "node:crypto";
import fs from "node:fs";

export const hashFileSha256 = async (filePath: string): Promise<string> => {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex").toUpperCase();
};

export const hashBufferSha256 = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
