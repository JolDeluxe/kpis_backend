import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/index.js";
import type { Role } from "../../utils/cargo-scope.js";
import { auditPersistent } from "../../utils/audit-log.js";
import { isSystemAdmin } from "../../utils/system-admin.js";
import { buildPasswordFields } from "./credentials.js";
import { decryptCredential } from "./credential-encryption.js";
import { generateHumanPassword } from "./password-generator.js";

const userSelect = {
  id: true,
  nombre: true,
  username: true,
  role: true,
  cargoId: true,
  activo: true,
  autoProvisioned: true,
  passwordEncrypted: true,
  lastPasswordChangedAt: true,
  cargo: true,
  createdAt: true,
  updatedAt: true
};

const serializeUsuario = (usuario: Prisma.UsuarioGetPayload<{ select: typeof userSelect }>) => ({
  id: usuario.id,
  nombre: usuario.nombre,
  username: usuario.username,
  role: usuario.role,
  cargoId: usuario.cargoId,
  cargo: usuario.cargo,
  activo: usuario.activo,
  autoProvisioned: usuario.autoProvisioned,
  passwordAvailable: Boolean(usuario.passwordEncrypted),
  lastPasswordChangedAt: usuario.lastPasswordChangedAt,
  createdAt: usuario.createdAt,
  updatedAt: usuario.updatedAt
});

const normalizeUsername = (username: string) => username.toLowerCase().trim();
const orderUsersForCredentials = (a: { username: string | null; cargoId: number | null }, b: { username: string | null; cargoId: number | null }) => {
  if (a.username === "admin") return -1;
  if (b.username === "admin") return 1;
  if (a.cargoId !== null && b.cargoId !== null) return a.cargoId - b.cargoId;
  if (a.cargoId !== null) return -1;
  if (b.cargoId !== null) return 1;
  return String(a.username || "").localeCompare(String(b.username || ""));
};
const displayPuesto = (usuario: { role: string; cargoId: number | null; nombre: string; cargo?: { nombre: string } | null }) => (
  usuario.role === "ADMIN" && usuario.cargoId === null ? "Administrador del sistema" : usuario.cargo?.nombre || usuario.nombre
);
const decryptPasswordOrUnavailable = (passwordEncrypted?: string | null) => (
  passwordEncrypted ? decryptCredential(passwordEncrypted) : "NO DISPONIBLE"
);
const csvValue = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
};
const toCredentialRecord = (usuario: Prisma.UsuarioGetPayload<{ select: typeof userSelect }>) => ({
  id: usuario.id,
  usuario: usuario.username || "",
  puesto: displayPuesto(usuario),
  cargo: usuario.cargoId,
  rol: usuario.role,
  estado: usuario.activo ? "ACTIVO" : "INACTIVO",
  password: decryptPasswordOrUnavailable(usuario.passwordEncrypted)
});

const legacyEmailForManualUser = (username: string) => `${normalizeUsername(username).replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID()}@legacy.local`;

const assertSystemAdminSlotAvailable = async (targetUserId?: string) => {
  const existing = await prisma.usuario.findFirst({ where: { role: "ADMIN", cargoId: null }, select: { id: true } });
  if (existing && existing.id !== targetUserId) {
    const error = new Error("Ya existe una cuenta administrativa maxima.");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }
};

const handleKnownPrismaError = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const next = new Error("Username o cargo ya asignado a otra cuenta.");
    Object.assign(next, { statusCode: 409 });
    throw next;
  }
  throw error;
};

export const listUsuarios = async () => {
  const usuarios = await prisma.usuario.findMany({
    select: userSelect,
    orderBy: [{ cargoId: "asc" }, { username: "asc" }]
  });
  return usuarios.map(serializeUsuario);
};

export const getUsuario = async (id: string) => {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: userSelect });
  if (!usuario) {
    const error = new Error("Usuario no encontrado.");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }
  return serializeUsuario(usuario);
};

export const createUsuario = async (input: { nombre: string; username: string; password: string; role: Role; cargoId?: number | null }, actorUserId?: string) => {
  if (input.role === "ADMIN" && (input.cargoId ?? null) === null) await assertSystemAdminSlotAvailable();
  const passwordFields = await buildPasswordFields(input.password);
  try {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: input.nombre,
        email: legacyEmailForManualUser(input.username),
        username: normalizeUsername(input.username),
        ...passwordFields,
        role: input.role,
        cargoId: input.cargoId ?? null,
        activo: true,
        autoProvisioned: false
      },
      select: userSelect
    });
    await auditPersistent("USER_CREATED", { actorUserId, targetUserId: usuario.id, metadata: { username: usuario.username, role: usuario.role, cargoId: usuario.cargoId } });
    return serializeUsuario(usuario);
  } catch (error) {
    handleKnownPrismaError(error);
  }
};

export const patchUsuario = async (
  id: string,
  input: Partial<{ nombre: string; username: string; role: Role; cargoId: number | null; activo: boolean }>,
  actorUserId?: string
) => {
  const before = await prisma.usuario.findUnique({ where: { id }, select: { username: true, role: true, cargoId: true, activo: true } });
  if (!before) {
    const error = new Error("Usuario no encontrado.");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }
  if (actorUserId === id && input.activo === false) {
    const error = new Error("No puedes desactivar tu propia cuenta.");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }
  const nextRole = input.role || before.role;
  const nextCargoId = "cargoId" in input ? input.cargoId ?? null : before.cargoId;
  if (nextRole === "ADMIN" && nextCargoId === null) await assertSystemAdminSlotAvailable(id);

  try {
    const usuario = await prisma.usuario.update({
      where: { id },
      data: {
        nombre: input.nombre,
        username: input.username ? normalizeUsername(input.username) : undefined,
        role: input.role,
        cargoId: input.cargoId,
        activo: input.activo
      },
      select: userSelect
    });

    if (input.username && before.username !== usuario.username) {
      await auditPersistent("USERNAME_CHANGED", { actorUserId, targetUserId: id, metadata: { from: before.username, to: usuario.username } });
    }
    if (before.activo && usuario.activo === false) {
      await prisma.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await auditPersistent("USER_DEACTIVATED", { actorUserId, targetUserId: id });
    }
    if (!before.activo && usuario.activo === true) await auditPersistent("USER_ACTIVATED", { actorUserId, targetUserId: id });
    if (before.role !== usuario.role) await auditPersistent("ROLE_CHANGED", { actorUserId, targetUserId: id, metadata: { from: before.role, to: usuario.role } });
    if (before.cargoId !== usuario.cargoId) await auditPersistent("CARGO_CHANGED", { actorUserId, targetUserId: id, metadata: { from: before.cargoId, to: usuario.cargoId } });

    return serializeUsuario(usuario);
  } catch (error) {
    handleKnownPrismaError(error);
  }
};

export const revealUsuarioPassword = async (id: string, actorUserId?: string) => {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { id: true, username: true, passwordEncrypted: true } });
  if (!usuario) {
    const error = new Error("Usuario no encontrado.");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }
  if (!usuario.passwordEncrypted) {
    const error = new Error("La contrasena de este usuario no esta disponible para revelar.");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }
  const password = decryptCredential(usuario.passwordEncrypted);
  await auditPersistent("PASSWORD_VIEWED", { actorUserId, targetUserId: id, metadata: { username: usuario.username } });
  return { password };
};

export const revealAllUsuarioPasswords = async (actorUserId: string) => {
  const usuarios = (await prisma.usuario.findMany({ select: userSelect })).sort(orderUsersForCredentials);
  await auditPersistent("PASSWORDS_BULK_VIEWED", { actorUserId, metadata: { cantidadUsuarios: usuarios.length, timestamp: new Date().toISOString() } });
  return { usuarios: usuarios.map(toCredentialRecord) };
};

export const exportUsuarioCredentialsCsv = async (actorUserId: string) => {
  const usuarios = (await prisma.usuario.findMany({ select: userSelect })).sort(orderUsersForCredentials);
  const rows = [
    ["USUARIO", "CONTRASEÑA", "PUESTO", "CARGO", "ROL", "ESTADO"],
    ...usuarios.map((usuario) => {
      const record = toCredentialRecord(usuario);
      return [record.usuario, record.password, record.puesto, record.cargo ?? "", record.rol, record.estado];
    })
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(",")).join("\r\n")}\r\n`;
  await auditPersistent("PASSWORDS_EXPORTED", { actorUserId, metadata: { cantidadUsuarios: usuarios.length, timestamp: new Date().toISOString() } });
  const date = new Date().toISOString().slice(0, 10);
  return { filename: `usuarios-kpi-mbc-${date}.csv`, csv };
};

export const changeUsuarioPassword = async (id: string, password: string, actorUserId?: string) => {
  const passwordFields = await buildPasswordFields(password);
  const usuario = await prisma.usuario.update({ where: { id }, data: passwordFields, select: userSelect });
  await prisma.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await auditPersistent("PASSWORD_CHANGED", { actorUserId, targetUserId: id, metadata: { username: usuario.username } });
  return serializeUsuario(usuario);
};

export const regenerateUsuarioPassword = async (id: string, actorUserId?: string) => {
  const password = generateHumanPassword();
  const usuario = await changeUsuarioPassword(id, password, actorUserId);
  await auditPersistent("PASSWORD_REGENERATED", { actorUserId, targetUserId: id, metadata: { username: usuario.username } });
  return { usuario, password };
};

export const deleteUsuario = async (id: string, actorUser?: Express.User) => {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { id: true, username: true, cargoId: true, role: true, activo: true } });
  if (!usuario) {
    const error = new Error("Usuario no encontrado.");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }
  if (actorUser?.id === id || isSystemAdmin(usuario)) {
    const error = new Error("No se puede eliminar esta cuenta administrativa.");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }
  if (usuario.cargoId !== null) {
    await auditPersistent("USER_DELETE_BLOCKED", { actorUserId: actorUser?.id, targetUserId: id, metadata: { username: usuario.username, cargoId: usuario.cargoId } });
    const error = new Error("Las cuentas vinculadas a cargos activos deben desactivarse, no eliminarse.");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  await prisma.refreshSession.deleteMany({ where: { userId: id } });
  await prisma.usuario.delete({ where: { id } });
  await auditPersistent("USER_DELETED", { actorUserId: actorUser?.id, targetUserId: id, metadata: { username: usuario.username } });
  return { ok: true };
};
