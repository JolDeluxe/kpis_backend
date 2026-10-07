import type { PrismaClient } from "@prisma/client";
import path from "node:path";
import { prisma } from "../../db/index.js";
import { parseKpiCsvContent, parseKpiCsvFile, type ParsedKpiRow } from "../../utils/csv-ingest.js";
import { getKnownParentId } from "../../utils/cargo-scope.js";
import { hashBufferSha256, hashFileSha256 } from "../../utils/hash-file.js";
import { audit, auditPersistent } from "../../utils/audit-log.js";
import { provisionMissingCargoUsers } from "../usuarios/provision-cargo-users.js";

export type ImportCsvInput =
  | { type: "file"; filePath: string; filename?: string; source?: string; sourceVersion?: string | null }
  | { type: "buffer"; buffer: Buffer; filename: string; source?: string; sourceVersion?: string | null };

const rowToResultData = (row: ParsedKpiRow, importacionId: string) => ({
  importacionId,
  anio: row.anio,
  periodo: row.periodo,
  cargoId: row.cargoId,
  orden: row.orden,
  kpiId: row.kpiId,
  valorRaw: row.valorRaw,
  resultadoRaw: row.resultadoRaw,
  objetivoRaw: row.objetivoRaw,
  valorRealRaw: row.valorRealRaw,
  calificacionRaw: row.calificacionRaw,
  tendenciaRaw: row.tendenciaRaw,
  parametrosRaw: row.parametrosRaw,
  sumaValorRaw: row.sumaValorRaw,
  sumaCalificacionRaw: row.sumaCalificacionRaw,
  calificacionGeneralRaw: row.calificacionGeneralRaw,
  valorNumero: row.valorNumero,
  resultadoNumero: row.resultadoNumero,
  objetivoNumero: row.objetivoNumero,
  valorRealNumero: row.valorRealNumero,
  calificacionNumero: row.calificacionNumero
});

const uniqueBy = <T, K>(items: T[], getKey: (item: T) => K) => {
  const map = new Map<K, T>();
  for (const item of items) map.set(getKey(item), item);
  return Array.from(map.values());
};

const getCargoDepth = (cargoId: number) => {
  let depth = 0;
  let parentId = getKnownParentId(cargoId);
  while (parentId !== null) {
    depth += 1;
    parentId = getKnownParentId(parentId);
  }
  return depth;
};

export const importKpiCsv = async (input: ImportCsvInput, client: PrismaClient = prisma) => {
  const filename = input.type === "file" ? input.filename || path.basename(input.filePath) : input.filename;
  const source = input.source || "manual";
  const sourceVersion = input.sourceVersion || null;
  const sha256 = input.type === "file" ? await hashFileSha256(input.filePath) : hashBufferSha256(input.buffer);

  const previous = await client.importacion.findFirst({ where: { sha256, status: "SUCCESS" } });
  if (previous) {
    const skipped = await client.importacion.create({
      data: { filename, sha256, source, sourceVersion, status: "SKIPPED_DUPLICATE", rowCount: 0, importedAt: new Date(), errorMessage: `Archivo ya importado en ${previous.id}` }
    });
    return { importacion: skipped, duplicated: true, rowCount: 0 };
  }

  const importacion = await client.importacion.create({ data: { filename, sha256, source, sourceVersion, status: "PROCESSING" } });

  try {
    const rows = input.type === "file" ? await parseKpiCsvFile(input.filePath) : parseKpiCsvContent(input.buffer.toString("utf8"));
    let autoCreatedUsers: Array<{ id: string; username: string | null; cargoId: number | null; role: string }> = [];

    await client.$transaction(async (tx) => {
      const cargos = uniqueBy(rows, (row) => row.cargoId).sort((a, b) => {
        const depthDiff = getCargoDepth(a.cargoId) - getCargoDepth(b.cargoId);
        return depthDiff || a.cargoId - b.cargoId;
      });

      // Primero insertar/actualizar todos los cargos en la transacción
      for (const cargo of cargos) {
        await tx.cargo.upsert({
          where: { id: cargo.cargoId },
          update: { nombre: cargo.cargoNombre, activo: true },
          create: { id: cargo.cargoId, nombre: cargo.cargoNombre, activo: true }
        });
      }

      // Después de que todos existan, calcular y asignar parentId de forma segura
      const dbCargos = await tx.cargo.findMany();
      const cargosMap = new Map(dbCargos.map((c) => [c.id, c]));

      for (const cargo of cargos) {
        if (cargo.cargoId === 1) {
          await tx.cargo.update({
            where: { id: cargo.cargoId },
            data: { parentId: null }
          });
          continue;
        }

        const proposedParent = getKnownParentId(cargo.cargoId);
        let finalParentId: number | null = null; // Para importaciones nuevas, por defecto no tiene padre si no se puede validar

        if (proposedParent !== null) {
          const parentCandidate = cargosMap.get(proposedParent);
          if (parentCandidate) {
            const nombreNormalized = parentCandidate.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            const esValido = nombreNormalized.startsWith("GERENCIA") || nombreNormalized.startsWith("DIRECCION") || parentCandidate.id === 1;
            if (esValido) {
              finalParentId = proposedParent;
            }
          }
        }

        // Si no se puede inferir/validar el nuevo parentId y ya tiene uno en base de datos, conservar el existente
        const existingCargoInDb = cargosMap.get(cargo.cargoId);
        if (finalParentId === null && existingCargoInDb && existingCargoInDb.parentId !== null) {
          finalParentId = existingCargoInDb.parentId;
        }

        await tx.cargo.update({
          where: { id: cargo.cargoId },
          data: { parentId: finalParentId }
        });
      }

      autoCreatedUsers = await provisionMissingCargoUsers(
        tx,
        cargos.map((cargo) => {
          const dbCargo = cargosMap.get(cargo.cargoId);
          return {
            id: cargo.cargoId,
            nombre: cargo.cargoNombre,
            parentId: dbCargo?.parentId ?? null,
            activo: true
          };
        }),
        { audit: false }
      );

      for (const kpi of uniqueBy(rows, (row) => row.kpiId)) {
        await tx.kpi.upsert({
          where: { id: kpi.kpiId },
          update: { nombre: kpi.kpiNombre, activo: true },
          create: { id: kpi.kpiId, nombre: kpi.kpiNombre, activo: true }
        });
      }

      await tx.kpiResultado.deleteMany();

      for (const row of rows) {
        const data = rowToResultData(row, importacion.id);
        await tx.kpiResultado.create({ data });
      }

      // Desactivar cargos funcionales ausentes en la importación (excluyendo el cargo estructural especial 1 / MBC)
      const presentCargoIds = cargos.map((c) => c.cargoId);
      await tx.cargo.updateMany({
        where: {
          id: {
            notIn: presentCargoIds,
            not: 1 // MBC
          }
        },
        data: {
          activo: false
        }
      });

      await tx.importacion.update({
        where: { id: importacion.id },
        data: { status: "SUCCESS", importedAt: new Date(), rowCount: rows.length }
      });
    });

    const complete = await client.importacion.findUniqueOrThrow({ where: { id: importacion.id } });
    for (const user of autoCreatedUsers) {
      await auditPersistent("USER_AUTO_CREATED", {
        targetUserId: user.id,
        metadata: { username: user.username, cargoId: user.cargoId, role: user.role, importacionId: complete.id }
      });
    }
    audit("CSV_IMPORT_SUCCESS", { importacionId: complete.id, filename, rowCount: rows.length, duplicated: false });
    return { importacion: complete, duplicated: false, rowCount: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido importando CSV";
    await client.importacion.update({ where: { id: importacion.id }, data: { status: "FAILED", importedAt: new Date(), errorMessage: message } });
    audit("CSV_IMPORT_FAILURE", { importacionId: importacion.id, filename });
    throw error;
  }
};

export const listImportaciones = () => prisma.importacion.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

export const getImportStatus = async () => {
  const latest = await prisma.importacion.findFirst({ orderBy: { createdAt: "desc" } });
  const successCount = await prisma.importacion.count({ where: { status: "SUCCESS" } });
  return { latest, successCount };
};
