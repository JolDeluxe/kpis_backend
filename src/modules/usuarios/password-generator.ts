import crypto from "node:crypto";
import { validatePassword } from "../auth/password-policy.js";

const PASSWORD_PREFIX = "CuadraMBC";
const PASSWORD_SUFFIX = "!";
const PASSWORD_DIGITS = 6;

const buildPassword = () => {
  const number = crypto.randomInt(0, 1_000_000).toString().padStart(PASSWORD_DIGITS, "0");
  return `${PASSWORD_PREFIX}${number}${PASSWORD_SUFFIX}`;
};

export const generateHumanPassword = () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const password = buildPassword();
    if (validatePassword(password).valid) return password;
  }
  throw new Error("No se pudo generar una contrasena valida.");
};

export const generateUniqueHumanPassword = (unavailable: Set<string>) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const password = generateHumanPassword();
    if (!unavailable.has(password)) {
      unavailable.add(password);
      return password;
    }
  }
  throw new Error("No se pudo generar una contrasena unica valida.");
};
