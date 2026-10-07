import type { NextFunction, Request, Response } from "express";
import type { Role } from "../utils/cargo-scope.js";

export const authorize = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: "Sesion requerida" });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Permisos insuficientes" });
  next();
};
