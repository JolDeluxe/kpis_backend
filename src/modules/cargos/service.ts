import { prisma } from "../../db/index.js";
import { getVisibleCargoIds, type ScopeUser } from "../../utils/cargo-scope.js";
import { audit } from "../../utils/audit-log.js";

export const listVisibleCargos = async (user: ScopeUser) => {
  const cargos = await prisma.cargo.findMany({ where: { activo: true }, orderBy: { id: "asc" } });
  const visibleIds = getVisibleCargoIds(user, cargos);
  return cargos.filter((cargo) => visibleIds.includes(cargo.id));
};

export const assertCargoScope = async (user: ScopeUser, cargoId: number) => {
  const cargos = await prisma.cargo.findMany({ where: { activo: true }, select: { id: true, parentId: true, activo: true } });
  const visibleIds = getVisibleCargoIds(user, cargos);
  if (!visibleIds.includes(cargoId)) {
    audit("ACCESS_DENIED", { userId: "id" in user ? user.id : undefined, requestedCargoId: cargoId, userCargoId: user.cargoId, role: user.role });
    const error = new Error("Cargo fuera de scope");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
};
