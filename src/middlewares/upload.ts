import multer from "multer";

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.includes("csv") || file.originalname.toLowerCase().endsWith(".csv")) cb(null, true);
    else cb(new Error("Solo se permiten archivos CSV"));
  }
});
