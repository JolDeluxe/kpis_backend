import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { csvUpload } from "../middlewares/upload.js";
import { getImportStatus, importKpiCsv, listImportaciones } from "../modules/importaciones/service.js";

const router = Router();

router.get("/", authenticate, authorize("ADMIN", "DIRECCION"), async (_req, res, next) => {
  try {
    res.json({ importaciones: await listImportaciones() });
  } catch (error) {
    next(error);
  }
});

router.get("/status", authenticate, async (_req, res, next) => {
  try {
    res.json(await getImportStatus());
  } catch (error) {
    next(error);
  }
});

router.post("/csv", authenticate, authorize("ADMIN", "DIRECCION"), csvUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Archivo CSV requerido en campo file" });
    const result = await importKpiCsv({ type: "buffer", buffer: req.file.buffer, filename: req.file.originalname });
    res.status(result.duplicated ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
