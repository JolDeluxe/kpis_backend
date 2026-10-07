import { PrismaClient } from "@prisma/client";
import { decryptCredential } from "../src/modules/usuarios/credential-encryption.js";

const prisma = new PrismaClient();

async function main() {
  const usuarios = await prisma.usuario.findMany({
    where: { activo: true },
    include: { cargo: true },
    orderBy: { cargoId: "asc" }
  });

  console.log("\n" + "=".repeat(95));
  console.log(" USUARIOS Y CREDENCIALES EN PRODUCCION");
  console.log("=".repeat(95));
  console.log(
    "PUESTO".padEnd(45) +
    " | " +
    "USUARIO".padEnd(25) +
    " | " +
    "PASSWORD"
  );
  console.log("-".repeat(95));

  for (const u of usuarios) {
    let password = "(No guardada)";
    if (u.passwordEncrypted) {
      try {
        password = decryptCredential(u.passwordEncrypted);
      } catch (e) {
        password = "(Error de llave)";
      }
    }

    const puesto = (u.cargo?.nombre || "ADMINISTRADOR DEL SISTEMA").padEnd(45);
    const username = (u.username || "N/A").padEnd(25);
    console.log(`${puesto} | ${username} | ${password}`);
  }

  console.log("=".repeat(95) + "\n");
}

main()
  .catch((e) => {
    console.error("Error al obtener credenciales:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
