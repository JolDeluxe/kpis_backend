import { prisma } from "../../db/index.js";
import { getKnownParentId } from "../../utils/cargo-scope.js";
import { logger } from "../../utils/logger.js";

/**
 * Reconcilia la jerarquía de cargos en la base de datos de manera defensiva e idempotente.
 * Asigna parentId a los cargos existentes según las reglas lógicas:
 *   - Si es 1 (MBC) -> null
 *   - Si es gerencia/dirección (múltiplo de 100) -> 1
 *   - Si es jefatura -> su gerencia candidato (redondeo a la centena).
 *
 * Protecciones:
 *   1. Valida que el padre candidato exista en la base de datos.
 *   2. Valida que el padre candidato sea una Gerencia o Dirección (nombre contiene "GERENCIA" o "DIRECCION", o id es 1).
 *   3. Si no es válido o no existe, conserva el parentId existente en lugar de sobrescribirlo con null.
 */
export const reconcileCargosHierarchy = async (): Promise<void> => {
  logger.info("[RECONCILIATION] Iniciando reconciliacion de jerarquia y estado de cargos...");
  try {
    const cargos = await prisma.cargo.findMany();
    const cargosMap = new Map(cargos.map((c) => [c.id, c]));

    // Obtener los cargoId únicos presentes en KpiResultado
    const uniqueKpiCargoIdsResult = await prisma.kpiResultado.findMany({
      select: { cargoId: true },
      distinct: ["cargoId"]
    });
    const activeCargoIdsWithKpis = new Set(uniqueKpiCargoIdsResult.map((k) => k.cargoId));

    let updatedCount = 0;

    for (const cargo of cargos) {
      // 1. Reconciliar Jerarquía
      let finalParentId = cargo.parentId;
      if (cargo.id === 1) {
        if (cargo.parentId !== null) {
          finalParentId = null;
        }
      } else {
        // Proponer candidato matemático
        let proposedParentId: number | null = null;
        if (cargo.id % 100 === 0) {
          proposedParentId = 1;
        } else {
          proposedParentId = Math.floor(cargo.id / 100) * 100;
        }

        // Validar candidato de manera defensiva
        if (proposedParentId !== null) {
          const parentCandidate = cargosMap.get(proposedParentId);
          if (parentCandidate) {
            const nombreNormalized = parentCandidate.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            const esValido = nombreNormalized.startsWith("GERENCIA") || nombreNormalized.startsWith("DIRECCION") || parentCandidate.id === 1;
            if (esValido) {
              finalParentId = proposedParentId;
            }
          }
        }
      }

      // 2. Reconciliar Estado Activo:
      // Regla: Cargo.activo es independiente de los Usuarios asociados.
      // - Cargo 1 (MBC) siempre activo (protección estructural del root).
      // - Cualquier otro cargo: activo si y solo si existe al menos un KpiResultado para él.
      //   Un cargo sin KpiResultado queda inactivo aunque tenga usuarios asociados.
      //   Los usuarios NO se borran; solo el cargo deja de aparecer en navegación.
      let finalActivo = cargo.activo;
      if (cargo.id === 1) {
        finalActivo = true;
      } else {
        finalActivo = activeCargoIdsWithKpis.has(cargo.id);
      }

      // 3. Aplicar cambios si difieren del actual
      if (finalParentId !== cargo.parentId || finalActivo !== cargo.activo) {
        await prisma.cargo.update({
          where: { id: cargo.id },
          data: {
            parentId: finalParentId,
            activo: finalActivo
          }
        });
        updatedCount++;
        // Actualizar el mapa local y el objeto para coherencia
        cargo.parentId = finalParentId;
        cargo.activo = finalActivo;
      }
    }

    logger.info(`[RECONCILIATION] Reconciliacion completada. Cargos actualizados: ${updatedCount}`);
  } catch (error) {
    logger.error({ error }, "[RECONCILIATION] Error durante la reconciliacion de jerarquia y estado");
    throw error;
  }
};
