import { describe, expect, it } from "vitest";
import { validatePassword } from "../src/modules/auth/password-policy.js";

describe("password policy", () => {
  it("rechaza password menor de 6 caracteres", () => {
    expect(validatePassword("abc12")).toEqual({
      valid: false,
      message: "La contraseña debe tener al menos 6 caracteres."
    });
  });

  it("rechaza password comun", () => {
    expect(validatePassword("  Qwerty123 ")).toEqual({
      valid: false,
      message: "La contraseña es demasiado común."
    });
  });

  it("permite password normal de 6 o mas caracteres", () => {
    expect(validatePassword("Kpi2026")).toEqual({ valid: true });
  });
});
