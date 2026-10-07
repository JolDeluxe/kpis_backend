import { describe, expect, it } from "vitest";
import { canAccessCargo, getVisibleCargoIds, type CargoNode } from "../src/utils/cargo-scope.js";

const cargos: CargoNode[] = [
  { id: 1, parentId: null, activo: true },
  { id: 100, parentId: 1, activo: true },
  { id: 200, parentId: 1, activo: true },
  { id: 201, parentId: 200, activo: true },
  { id: 300, parentId: 1, activo: true },
  { id: 301, parentId: 300, activo: true },
  { id: 302, parentId: 300, activo: true }
];

describe("scope por cargo", () => {
  it("cargo 200 puede consultar 200 y 201, pero no 300", () => {
    const user = { role: "GERENTE" as const, cargoId: 200 };
    expect(getVisibleCargoIds(user, cargos)).toEqual([200, 201]);
    expect(canAccessCargo(user, 200, cargos)).toBe(true);
    expect(canAccessCargo(user, 201, cargos)).toBe(true);
    expect(canAccessCargo(user, 300, cargos)).toBe(false);
  });

  it("cargo 201 solo puede consultar 201", () => {
    const user = { role: "JEFE" as const, cargoId: 201 };
    expect(getVisibleCargoIds(user, cargos)).toEqual([201]);
    expect(canAccessCargo(user, 200, cargos)).toBe(false);
    expect(canAccessCargo(user, 300, cargos)).toBe(false);
  });

  it("admin puede consultar todos", () => {
    const user = { role: "ADMIN" as const, cargoId: null };
    expect(getVisibleCargoIds(user, cargos)).toEqual([1, 100, 200, 201, 300, 301, 302]);
  });

  it("MBC 1 puede consultar el nivel global y todos los descendientes", () => {
    const user = { role: "DIRECCION" as const, cargoId: 1 };
    expect(getVisibleCargoIds(user, cargos)).toEqual([1, 100, 200, 201, 300, 301, 302]);
    expect(canAccessCargo(user, 1, cargos)).toBe(true);
    expect(canAccessCargo(user, 201, cargos)).toBe(true);
    expect(canAccessCargo(user, 302, cargos)).toBe(true);
  });

  it("gerente 200 no puede consultar MBC", () => {
    const user = { role: "GERENTE" as const, cargoId: 200 };
    expect(canAccessCargo(user, 1, cargos)).toBe(false);
  });

  it("jefe 201 no puede consultar MBC", () => {
    const user = { role: "JEFE" as const, cargoId: 201 };
    expect(canAccessCargo(user, 1, cargos)).toBe(false);
  });

  it("direccion 100 puede consultar todos los cargos", () => {
    const user = { role: "DIRECCION" as const, cargoId: 100 };
    expect(canAccessCargo(user, 201, cargos)).toBe(true);
    expect(canAccessCargo(user, 300, cargos)).toBe(true);
    expect(canAccessCargo(user, 302, cargos)).toBe(true);
  });
});
