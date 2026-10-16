import { PrismaClient } from "@prisma/client";
import { buildPasswordFields } from "../src/modules/usuarios/credentials.js";

const prisma = new PrismaClient();

async function main() {
  const nombre = "Edgar Carrillo";
  const username = "edgar"; // El sistema normaliza a minúsculas
  const passwordPlana = "Antillon";
  const email = "edgar@mbc.local";
  const role = "CONSULTA";
  const cargoId = null;

  console.log(`Verificando o creando usuario ${nombre} (${username})...`);

  const passwordFields = await buildPasswordFields(passwordPlana);

  const usuario = await prisma.usuario.upsert({
    where: { username },
    update: {
      nombre,
      role,
      cargoId,
      activo: true,
      autoProvisioned: false,
      ...passwordFields
    },
    create: {
      nombre,
      username,
      email,
      role,
      cargoId,
      activo: true,
      autoProvisioned: false,
      ...passwordFields
    }
  });

  console.log("¡Usuario procesado exitosamente!");
  console.log({
    id: usuario.id,
    nombre: usuario.nombre,
    username: usuario.username,
    role: usuario.role,
    cargoId: usuario.cargoId,
    activo: usuario.activo
  });
}

main()
  .catch((err) => {
    console.error("Error al crear usuario:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
