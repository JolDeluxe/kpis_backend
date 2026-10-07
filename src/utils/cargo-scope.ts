import type { Cargo } from "@prisma/client";

export type CargoNode = Pick<Cargo, "id" | "parentId" | "activo">;
export type Role = "ADMIN" | "DIRECCION" | "GERENTE" | "JEFE" | "CONSULTA";
export type ScopeUser = { role: Role; cargoId: number | null };

const ROLES: Role[] = ["ADMIN", "DIRECCION", "GERENTE", "JEFE", "CONSULTA"];

export const isRole = (value: string): value is Role => ROLES.includes(value as Role);

export const getKnownParentId = (cargoId: number): number | null => {
  if (cargoId === 1) return null;
  if (cargoId % 100 === 0) return 1;
  return Math.floor(cargoId / 100) * 100;
};

export const getDescendantCargoIds = (cargoId: number, cargos: CargoNode[]): number[] => {
  const result = new Set<number>([cargoId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const cargo of cargos) {
      if (cargo.parentId !== null && result.has(cargo.parentId) && !result.has(cargo.id)) {
        result.add(cargo.id);
        changed = true;
      }
    }
  }

  return Array.from(result).sort((a, b) => a - b);
};

export const getVisibleCargoIds = (user: ScopeUser, cargos: CargoNode[]): number[] => {
  if (user.role === "ADMIN" || user.cargoId === 1 || user.cargoId === 100) {
    return cargos.filter((cargo) => cargo.activo).map((cargo) => cargo.id).sort((a, b) => a - b);
  }
  if (!user.cargoId) return [];
  if (user.role === "JEFE" || user.role === "CONSULTA") return [user.cargoId];
  return getDescendantCargoIds(user.cargoId, cargos.filter((cargo) => cargo.activo));
};

export const canAccessCargo = (user: ScopeUser, cargoId: number, cargos: CargoNode[]) => {
  return getVisibleCargoIds(user, cargos).includes(cargoId);
};
