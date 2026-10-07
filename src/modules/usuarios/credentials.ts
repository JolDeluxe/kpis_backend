import bcrypt from "bcryptjs";
import { validatePassword } from "../auth/password-policy.js";
import { encryptCredential } from "./credential-encryption.js";

export const buildPasswordFields = async (password: string) => {
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) {
    const error = new Error(passwordCheck.message);
    Object.assign(error, { statusCode: 400 });
    throw error;
  }

  return {
    passwordHash: await bcrypt.hash(password, 12),
    passwordEncrypted: encryptCredential(password),
    lastPasswordChangedAt: new Date()
  };
};
