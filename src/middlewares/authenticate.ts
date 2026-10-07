import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/index.js";
import { env } from "../env.js";
import { isRole } from "../utils/cargo-scope.js";

type AccessTokenPayload = { id: string; sid: string; typ: "access" };

export const signAccessToken = (id: string, sessionId: string) => jwt.sign({ id, sid: sessionId, typ: "access" }, env.JWT_SECRET, { expiresIn: "8h" });

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return res.status(401).json({ message: "Sesion requerida" });

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    if (payload.typ !== "access" || !payload.sid) return res.status(401).json({ message: "Sesion invalida" });

    const session = await prisma.refreshSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.id,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: { select: { id: true, nombre: true, email: true, username: true, role: true, cargoId: true, activo: true } }
      }
    });

    const usuario = session?.user;
    if (!usuario || !usuario.activo || !isRole(usuario.role)) return res.status(401).json({ message: "Sesion invalida" });
    req.user = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      username: usuario.username,
      role: usuario.role,
      cargoId: usuario.cargoId,
      sessionId: session.id
    };
    next();
  } catch {
    return res.status(401).json({ message: "Sesion invalida o expirada" });
  }
};
