import "./setup-sqlite.js";

if (process.env.BOOTSTRAP_SEED === "true") {
  await import("../prisma/seed.js");
}

const { startServer } = await import("../src/index.js");
startServer();
