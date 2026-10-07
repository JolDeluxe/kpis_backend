import { PrismaClient } from "@prisma/client";
import { getKnownParentId } from "../src/utils/cargo-scope.js";
import { buildPasswordFields } from "../src/modules/usuarios/credentials.js";
import { provisionMissingCargoUsers } from "../src/modules/usuarios/provision-cargo-users.js";

const prisma = new PrismaClient();

const requireSeedEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta ${name}. Define esta variable para ejecutar el seed; no hay contrasenas default.`);
  }
  return value;
};

const cargos = [
  [1, "MBC"],
  [100, "DIRECCION MBC"],
  [101, "JEFATURA DE COMPRAS"],
  [102, "JEFATURA DE CALIDAD"],
  [103, "JEFATURA DE PPCP"],
  [104, "JEFATURA DE LOGISTICA"],
  [200, "GERENCIA ADMINISTRATIVA"],
  [201, "JEFATURA DE CONTABILIDAD"],
  [300, "GERENCIA OPERATIVA"],
  [301, "JEFATURA DE PRODUCCION BOTAS I"],
  [302, "JEFATURA DE PRODUCCION BOTAS II"],
  [303, "JEFATURA DE PRODUCCION ACCESORIOS"],
  [304, "JEFATURA DE DESARROLLO BOTAS"],
  [305, "JEFATURA DE DESARROLLO ACCESORIOS"],
  [306, "JEFATURA DE INGENIERIA DE PROCESOS"],
  [307, "JEFATURA DE INGENIERIA DE COSTOS Y SISTEMA"],
  [308, "JEFATURA DE MANTENIMIENTO"],
  [309, "JEFATURA DE MAQUILAS"],
  [400, "GERENCIA DE CAPITAL HUMANO"],
  [401, "JEFATURA DE CAPITAL HUMANO"],
  [402, "JEFATURA DE GESTION DE CALIDAD"]
] as const;

const adminPassword = requireSeedEnv("SEED_ADMIN_PASSWORD");

for (const [id, nombre] of cargos) {
  await prisma.cargo.upsert({
    where: { id },
    update: { nombre, parentId: getKnownParentId(id), activo: true },
    create: { id, nombre, parentId: getKnownParentId(id), activo: true }
  });
}

const adminPasswordFields = await buildPasswordFields(adminPassword);
const existingAdmin = await prisma.usuario.findUnique({ where: { username: "admin" } });
if (!existingAdmin) {
  const legacyAdmin = await prisma.usuario.findFirst({
    where: { role: "ADMIN", cargoId: null, username: null },
    orderBy: { createdAt: "asc" }
  });
  if (legacyAdmin) {
    await prisma.usuario.update({
      where: { id: legacyAdmin.id },
      data: {
        nombre: "Administrador del Sistema",
        username: "admin",
        ...adminPasswordFields,
        activo: true,
        autoProvisioned: false
      }
    });
  } else {
    await prisma.usuario.create({
      data: {
        nombre: "Administrador del Sistema",
        email: process.env.SEED_ADMIN_EMAIL || "admin@legacy.local",
        username: "admin",
        ...adminPasswordFields,
        role: "ADMIN",
        cargoId: null,
        activo: true,
        autoProvisioned: false
      }
    });
  }
} else {
  await prisma.usuario.update({
    where: { id: existingAdmin.id },
    data: {
      nombre: "Administrador del Sistema",
      activo: true,
      autoProvisioned: false
    }
  });
}

const currentCargos = await prisma.cargo.findMany({ where: { activo: true }, orderBy: { id: "asc" } });
const created = await provisionMissingCargoUsers(prisma, currentCargos);

console.log(`Seed completo: admin listo y ${created.length} cuentas funcionales faltantes creadas.`);
await prisma.$disconnect();
