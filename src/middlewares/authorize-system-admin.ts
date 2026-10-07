import type { NextFunction, Request, Response } from "express";
import { isSystemAdmin } from "../utils/system-admin.js";

export const authorizeSystemAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!isSystemAdmin(req.user)) return res.status(403).json({ message: "Permisos insuficientes" });
  next();
};
