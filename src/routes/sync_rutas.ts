import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../env.js";
import { csvUpload } from "../middlewares/upload.js";
import { importKpiCsv } from "../modules/importaciones/service.js";
import { audit } from "../utils/audit-log.js";

const router = Router();

const safeEqual = (a: string, b: string) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
};

router.post("/kpis", csvUpload.single("file"), async (req, res, next) => {
  try {
    const key = req.header("X-Sync-Key") || "";
    if (!safeEqual(key, env.SYNC_API_KEY)) {
      audit("SYNC_AUTH_FAILURE", { ip: req.ip });
      return res.status(401).json({ message: "Sync key invalida" });
    }
    if (!req.file) return res.status(400).json({ message: "Archivo CSV requerido en campo file" });
    const result = await importKpiCsv({ type: "buffer", buffer: req.file.buffer, filename: req.file.originalname });
    res.status(result.duplicated ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
