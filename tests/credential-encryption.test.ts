import crypto from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential } from "../src/modules/usuarios/credential-encryption.js";
import { generateHumanPassword } from "../src/modules/usuarios/password-generator.js";
import { validatePassword } from "../src/modules/auth/password-policy.js";

describe("credential encryption and password generator", () => {
  it("cifra y descifra sin guardar plaintext", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const password = "Clave-Prueba-Segura-482";
    const encrypted = encryptCredential(password);
    expect(encrypted).not.toContain(password);
    expect(decryptCredential(encrypted)).toBe(password);
  });

  it("falla controlado con key incorrecta", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const encrypted = encryptCredential("Clave-Prueba-Segura-583");
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    expect(() => decryptCredential(encrypted)).toThrow();
  });

  it("genera passwords funcionales con formato CuadraMBC y pasan politica", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const password = generateHumanPassword();
    expect(password).toMatch(/^CuadraMBC\d{6}!$/);
    expect(validatePassword(password).valid).toBe(true);
  });

  it("usa crypto y no Math.random para generar passwords", () => {
    const source = fs.readFileSync(new URL("../src/modules/usuarios/password-generator.ts", import.meta.url), "utf8");
    expect(source).toContain("crypto.randomInt");
    expect(source).not.toContain("Math.random");
  });

  it("genera valores diferentes en multiples intentos", () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generateHumanPassword()));
    expect(passwords.size).toBeGreaterThan(1);
  });
});
