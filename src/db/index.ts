import "../env.js";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const enableWal = async (client: PrismaClient = prisma) => {
  try {
    await client.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
    await client.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
    await client.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
  } catch (err) {
    console.error("[db] Error configurando WAL en SQLite:", err);
  }
};
