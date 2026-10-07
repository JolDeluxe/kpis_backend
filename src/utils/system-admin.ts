import type { Role } from "./cargo-scope.js";

export type SystemAdminUser = { role: Role | string; cargoId: number | null };

export const isSystemAdmin = (user?: SystemAdminUser | null) => {
  return user?.role === "ADMIN" && user.cargoId === null;
};
