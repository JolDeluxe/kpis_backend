import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../../db/index.js";
import { isRole } from "../../utils/cargo-scope.js";
import { auditPersistent } from "../../utils/audit-log.js";
import { buildPasswordFields } from "../usuarios/credentials.js";

const REFRESH_SESSION_DAYS = 30;

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export const hashRefreshToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const generateRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const serializeUser = (user: {
  id: string;
  nombre: string;
  email: string;
  username: string | null;
  role: string;
  cargoId: number | null;
  cargo?: unknown;
}) => {
  if (!isRole(user.role)) return null;
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    username: user.username,
    role: user.role,
    cargoId: user.cargoId,
    cargo: user.cargo
  };
};

export const loginUser = async (username: string, password: string) => {
  const user = await prisma.usuario.findUnique({ where: { username: username.toLowerCase().trim() }, include: { cargo: true } });
  if (!user || !user.activo) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return serializeUser(user);
};

export const createRefreshSession = async (input: { userId: string; userAgent?: string; ip?: string }) => {
  const refreshToken = generateRefreshToken();
  const session = await prisma.refreshSession.create({
    data: {
      userId: input.userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: addDays(new Date(), REFRESH_SESSION_DAYS),
      userAgent: input.userAgent,
      ip: input.ip
    }
  });

  return { session, refreshToken };
};

export const rotateRefreshSession = async (refreshToken: string) => {
  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();
  const currentSession = await prisma.refreshSession.findUnique({
    where: { tokenHash },
    include: { user: { include: { cargo: true } } }
  });

  if (!currentSession || currentSession.revokedAt || currentSession.expiresAt <= now || !currentSession.user.activo) {
    return null;
  }

  const user = serializeUser(currentSession.user);
  if (!user) return null;

  const nextRefreshToken = generateRefreshToken();
  const session = await prisma.refreshSession.update({
    where: { id: currentSession.id },
    data: {
      tokenHash: hashRefreshToken(nextRefreshToken),
      lastUsedAt: now,
      expiresAt: addDays(now, REFRESH_SESSION_DAYS)
    }
  });

  return { user, session, refreshToken: nextRefreshToken };
};

export const revokeRefreshSessionByToken = async (refreshToken?: string) => {
  if (!refreshToken) return;
  await prisma.refreshSession.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

export const revokeAllRefreshSessions = async (userId: string) => {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

export const changeOwnPassword = async (userId: string, input: { currentPassword: string; newPassword: string }) => {
  const user = await prisma.usuario.findUnique({ where: { id: userId }, select: { id: true, username: true, passwordHash: true, activo: true } });
  if (!user || !user.activo) {
    const error = new Error("Sesion invalida.");
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) {
    const error = new Error("La contrasena actual no es correcta.");
    Object.assign(error, { statusCode: 400 });
    throw error;
  }

  await prisma.usuario.update({ where: { id: userId }, data: await buildPasswordFields(input.newPassword) });
  await prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await auditPersistent("PASSWORD_SELF_CHANGED", { actorUserId: userId, targetUserId: userId, metadata: { username: user.username } });
  return { ok: true, reauthRequired: true };
};

export const getMe = async (id: string) => {
  const user = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, nombre: true, email: true, username: true, role: true, cargoId: true, cargo: true, activo: true }
  });
  if (!user || !user.activo) return null;
  return user;
};
