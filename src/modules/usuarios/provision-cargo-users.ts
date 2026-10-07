import type { Cargo, Prisma, PrismaClient } from "@prisma/client";
import { generateUniqueCargoUsername } from "./username-generator.js";
import { generateUniqueHumanPassword } from "./password-generator.js";
import { buildPasswordFields } from "./credentials.js";
import { auditPersistent } from "../../utils/audit-log.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

const roleForCargo = (cargo: Pick<Cargo, "id" | "nombre" | "parentId">) => {
  const normalized = cargo.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (cargo.id === 1 || normalized.startsWith("DIRECCION")) return "DIRECCION";
  if (normalized.startsWith("GERENCIA")) return "GERENTE";
  return "JEFE";
};

const legacyEmailForCargo = (cargoId: number) => `cargo-${cargoId}@legacy.local`;

export const provisionMissingCargoUsers = async (
  client: DbClient,
  cargos: Array<Pick<Cargo, "id" | "nombre" | "parentId" | "activo">>,
  options: { actorUserId?: string | null; audit?: boolean } = {}
) => {
  const activeCargos = cargos.filter((cargo) => cargo.activo);
  if (activeCargos.length === 0) return [];

  const cargoIds = activeCargos.map((cargo) => cargo.id);
  const existingCargoUsers = await client.usuario.findMany({
    where: { cargoId: { in: cargoIds } },
    select: { id: true, cargoId: true, username: true, passwordEncrypted: true }
  });
  const duplicateCargoIds = new Map<number, number>();
  for (const user of existingCargoUsers) {
    if (user.cargoId === null) continue;
    duplicateCargoIds.set(user.cargoId, (duplicateCargoIds.get(user.cargoId) || 0) + 1);
  }
  const duplicates = Array.from(duplicateCargoIds.entries()).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    const error = new Error(`Existen cargos con mas de una cuenta funcional: ${duplicates.map(([cargoId]) => cargoId).join(", ")}`);
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  const existingUsernames = await client.usuario.findMany({ select: { username: true } });
  const unavailable = new Set(existingUsernames.map((user) => user.username).filter((username): username is string => Boolean(username)));
  const unavailablePasswords = new Set<string>();
  const existingByCargoId = new Map(existingCargoUsers
    .filter((user): user is typeof user & { cargoId: number } => user.cargoId !== null)
    .map((user) => [user.cargoId, user]));
  const created = [];

  for (const cargo of activeCargos) {
    const existing = existingByCargoId.get(cargo.id);
    if (existing?.username && existing.passwordEncrypted) continue;

    const username = generateUniqueCargoUsername(cargo, unavailable);
    unavailable.add(username);
    const password = generateUniqueHumanPassword(unavailablePasswords);
    const passwordFields = await buildPasswordFields(password);
    const user = existing
      ? await client.usuario.update({
          where: { id: existing.id },
          data: {
            nombre: cargo.nombre,
            username,
            ...passwordFields,
            role: roleForCargo(cargo),
            activo: true,
            autoProvisioned: true
          },
          select: { id: true, username: true, cargoId: true, role: true }
        })
      : await client.usuario.create({
          data: {
            nombre: cargo.nombre,
            email: legacyEmailForCargo(cargo.id),
            username,
            ...passwordFields,
            role: roleForCargo(cargo),
            cargoId: cargo.id,
            activo: true,
            autoProvisioned: true
          },
          select: { id: true, username: true, cargoId: true, role: true }
        });
    if (options.audit !== false) {
      await auditPersistent("USER_AUTO_CREATED", {
        actorUserId: options.actorUserId,
        targetUserId: user.id,
        metadata: { username: user.username, cargoId: user.cargoId, role: user.role }
      });
    }
    created.push(user);
  }

  return created;
};
