import path from "node:path";
import { prisma } from "../src/db/index.js";
import { importKpiCsv } from "../src/modules/importaciones/service.js";

const defaultCsv = path.resolve(process.cwd(), "../048 KPIs Jefaturas 260807 122334.csv");
const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultCsv;

try {
  const result = await importKpiCsv({ type: "file", filePath: csvPath });
  console.log(JSON.stringify({
    importacionId: result.importacion.id,
    status: result.importacion.status,
    duplicated: result.duplicated,
    rowCount: result.importacion.rowCount,
    sha256: result.importacion.sha256
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
