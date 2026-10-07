const COMMON_PASSWORDS = new Set([
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "abcdef",
  "abcdefg",
  "qwerty",
  "qwerty123",
  "password",
  "password1",
  "contraseña",
  "admin",
  "admin123",
  "usuario",
  "usuario123",
  "letmein",
  "welcome",
  "abc123",
  "111111",
  "000000"
]);

export const validatePassword = (password: string) => {
  if (password.length < 6) {
    return { valid: false, message: "La contraseña debe tener al menos 6 caracteres." };
  }

  if (password.length > 128) {
    return { valid: false, message: "La contraseña es demasiado larga." };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase().trim())) {
    return { valid: false, message: "La contraseña es demasiado común." };
  }

  return { valid: true };
};
