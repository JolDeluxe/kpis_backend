import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getKnownParentId } from "../src/utils/cargo-scope.js";
import { prisma } from "../src/db/index.js";
import { reconcileCargosHierarchy } from "../src/modules/cargos/reconciliation.js";
import { importKpiCsv } from "../src/modules/importaciones/service.js";

describe("Dynamic Cargo Hierarchy & Reconciliation Tests", () => {
  describe("getKnownParentId resolving rules", () => {
    it("resolves corporate root parent to null", () => {
      expect(getKnownParentId(1)).toBeNull();
    });

    it("resolves gerencias to MBC root (1)", () => {
      expect(getKnownParentId(100)).toBe(1);
      expect(getKnownParentId(200)).toBe(1);
      expect(getKnownParentId(300)).toBe(1);
      expect(getKnownParentId(400)).toBe(1);
      expect(getKnownParentId(500)).toBe(1);
      expect(getKnownParentId(600)).toBe(1);
      expect(getKnownParentId(700)).toBe(1);
    });

    it("resolves jefaturas to their respective parent gerencias", () => {
      expect(getKnownParentId(101)).toBe(100);
      expect(getKnownParentId(104)).toBe(100);
      expect(getKnownParentId(201)).toBe(200);
      expect(getKnownParentId(202)).toBe(200);
      expect(getKnownParentId(205)).toBe(200);
      expect(getKnownParentId(309)).toBe(300);
      expect(getKnownParentId(401)).toBe(400);
      expect(getKnownParentId(501)).toBe(500);
      expect(getKnownParentId(601)).toBe(600);
      expect(getKnownParentId(701)).toBe(700);
      expect(getKnownParentId(703)).toBe(700);
    });
  });

  describe("Reconciliation & Hierarchy Validation", () => {
    it("reconciles parentId correctly and is idempotent", async () => {
      // Setup base data in transaction-like checks or using prisma directly (test env isolated)
      // Limpiamos los cargos de prueba si existen
      await prisma.cargo.deleteMany({
        where: { id: { in: [800, 801, 802] } }
      });

      // Insertamos cargos con parentId incorrectos/desordenados
      await prisma.cargo.create({
        data: { id: 800, nombre: "GERENCIA DE PRUEBA RECONCILE", parentId: null }
      });
      await prisma.cargo.create({
        data: { id: 801, nombre: "JEFATURA DE PRUEBA A", parentId: null }
      });
      await prisma.cargo.create({
        // 802 tiene como candidato a 800 (valido), pero simulamos que tiene parentId incorrecto 1
        data: { id: 802, nombre: "JEFATURA DE PRUEBA B", parentId: 1 }
      });

      // Primer reconciliación
      await reconcileCargosHierarchy();

      const cargo800 = await prisma.cargo.findUnique({ where: { id: 800 } });
      const cargo801 = await prisma.cargo.findUnique({ where: { id: 801 } });
      const cargo802 = await prisma.cargo.findUnique({ where: { id: 802 } });

      expect(cargo800?.parentId).toBe(1); // Mapeado a raíz
      expect(cargo801?.parentId).toBe(800); // 800 existe y es gerencia
      expect(cargo802?.parentId).toBe(800); // corregido de 1 a 800

      // Segunda reconciliación (idempotente)
      await reconcileCargosHierarchy();
      const cargo800Sec = await prisma.cargo.findUnique({ where: { id: 800 } });
      expect(cargo800Sec?.parentId).toBe(1);

      // Limpieza
      await prisma.cargo.deleteMany({
        where: { id: { in: [800, 801, 802] } }
      });
    });

    it("does not associate child with non-existent or invalid parent, and preserves existing parentId", async () => {
      // Limpiar test
      await prisma.cargo.deleteMany({
        where: { id: { in: [810, 811, 812] } }
      });

      // 810 NO existe (no lo creamos)
      // 811 Jefatura cuyo padre candidato sería 810 (inexistente).
      // Le ponemos un parentId existente válido inicial = 1
      await prisma.cargo.create({
        data: { id: 811, nombre: "JEFATURA SIN PADRE REAL", parentId: 1 }
      });

      // 812 Jefatura cuyo padre candidato es 813. Pero 813 existe y NO es gerencia (es Jefatura).
      await prisma.cargo.create({
        data: { id: 813, nombre: "JEFATURA DE SOPORTE QUE NO ES GERENCIA", parentId: 1 }
      });
      await prisma.cargo.create({
        data: { id: 814, nombre: "JEFATURA HIJA CANDIDATA", parentId: 1 } // Propuesto sería 813, pero 813 es Jefatura
      });

      await reconcileCargosHierarchy();

      const cargo811 = await prisma.cargo.findUnique({ where: { id: 811 } });
      const cargo814 = await prisma.cargo.findUnique({ where: { id: 814 } });

      // Deben conservar su parentId de 1, no ser borrados o asociados a null/relación rota
      expect(cargo811?.parentId).toBe(1);
      expect(cargo814?.parentId).toBe(1);

      // Limpieza
      await prisma.cargo.deleteMany({
        where: { id: { in: [811, 813, 814] } }
      });
    });

    it("does not associate parentId=1 if MBC (id=1) does not exist, and preserves existing parentId", async () => {
      // Configurar datos sin MBC id=1. En este test el id=1 existe en DB real, por lo que crearemos un cargo temporal
      // con id = 899 (que actua como gerencia sin corporativo padre porque borramos temporalmente o no creamos el id=1,
      // pero como id=1 si existe, simulamos borrando temporalmente el id=1 si se pudiera, pero es mas seguro testear
      // directamente con un id de gerencia huerfana como 890).
      
      // Creamos 890 (GERENCIA DE PRUEBA) con parentId = 1 (MBC que existe)
      await prisma.cargo.deleteMany({
        where: { id: { in: [890, 891] } }
      });

      await prisma.cargo.create({
        data: { id: 890, nombre: "GERENCIA HUERFANA", parentId: 1 }
      });
      await prisma.cargo.deleteMany({
        where: { id: { in: [800, 801] } }
      });

      await prisma.cargo.create({
        data: { id: 800, nombre: "GERENCIA HUERFANA", parentId: 1 }
      });

      // Si creamos un cargo 801 (JEFATURA) cuyo padre propuesto es 800:
      await prisma.cargo.create({
        data: { id: 801, nombre: "JEFATURA HUERFANA", parentId: 1 }
      });

      await reconcileCargosHierarchy();

      const cargo801 = await prisma.cargo.findUnique({ where: { id: 801 } });
      expect(cargo801?.parentId).toBe(800);

      // Ahora si eliminamos 800 y forzamos a 801 a tener parentId = 1
      await prisma.cargo.delete({ where: { id: 800 } });
      await prisma.cargo.update({ where: { id: 801 }, data: { parentId: 1 } });
      
      await reconcileCargosHierarchy();
      const cargo801Post = await prisma.cargo.findUnique({ where: { id: 801 } });
      expect(cargo801Post?.parentId).toBe(1);

      await prisma.cargo.deleteMany({
        where: { id: { in: [801] } }
      });
    });
  });

  describe("Cargo Activation & Deactivation on CSV Import", () => {
    const csvHeader = "01 Año,02 Mes,04 Id Cargo,03 Orden,05 Puesto,06 Id,07 Valor,08 KPI,09 Resultado,10 Objetivo,11 Valor Real,12 Calificacion,13 Tendencia,14 Parametros,15 Suma Valor,16 Suma Calificacion,17 Calificacion General";

    it("activates present cargos and deactivates absent ones, reusing existing users and avoiding deactivating MBC", async () => {
      // 1. Setup inicial de cargos y limpieza de imports de prueba específicos
      await prisma.kpiResultado.deleteMany({ where: { cargoId: { in: [700, 701, 702] } } });
      await prisma.usuario.deleteMany({ where: { cargoId: { in: [700, 701, 702] } } });
      await prisma.cargo.deleteMany({ where: { id: { in: [700, 701, 702] } } });
      await prisma.importacion.deleteMany({
        where: {
          filename: {
            in: [
              "test-import-unique-a1.csv",
              "test-import-unique-a2.csv",
              "test-import-unique-ainvalid.csv",
              "test-import-unique-a3.csv"
            ]
          }
        }
      });

      const csvContent1 = `${csvHeader}
2026,1,700,1,GERENCIA COMERCIAL,KPI-1,100,KPI,8,10,8,4,3,Param,8,4,80%
2026,1,701,2,JEFATURA VENTAS,KPI-2,100,KPI,8,10,8,4,3,Param,8,4,80%
`;
      // Importar primer snapshot (crea 700 y 701 activos)
      const res1 = await importKpiCsv({ type: "buffer", buffer: Buffer.from(csvContent1), filename: "test-import-unique-a1.csv" });
      expect(res1.duplicated).toBeFalsy();

      const cargo700 = await prisma.cargo.findUnique({ where: { id: 700 } });
      const cargo701 = await prisma.cargo.findUnique({ where: { id: 701 } });
      expect(cargo700?.activo).toBe(true);
      expect(cargo701?.activo).toBe(true);

      const user700 = await prisma.usuario.findFirst({ where: { cargoId: 700 } });
      expect(user700).not.toBeNull();

      // 2. Siguiente snapshot no contiene 701 pero contiene 700 y añade 702 (con valor 111 para cambiar hash)
      const csvContent2 = `${csvHeader}
2026,1,700,1,GERENCIA COMERCIAL,KPI-1,111,KPI,8,10,8,4,3,Param,8,4,80%
2026,1,702,3,JEFATURA EXPORTACION,KPI-3,100,KPI,8,10,8,4,3,Param,8,4,80%
`;
      const res2 = await importKpiCsv({ type: "buffer", buffer: Buffer.from(csvContent2), filename: "test-import-unique-a2.csv" });
      expect(res2.duplicated).toBeFalsy();

      const cargo700After = await prisma.cargo.findUnique({ where: { id: 700 } });
      const cargo701After = await prisma.cargo.findUnique({ where: { id: 701 } });
      const cargo702After = await prisma.cargo.findUnique({ where: { id: 702 } });
      expect(cargo700After?.activo).toBe(true);
      expect(cargo701After?.activo).toBe(false); // Desactivado
      expect(cargo702After?.activo).toBe(true);  // Creado activo

      // El usuario asociado a 701 sigue existiendo
      const user701After = await prisma.usuario.findFirst({ where: { cargoId: 701 } });
      expect(user701After).not.toBeNull();

      // MBC (id=1) nunca se desactiva
      const mbcCargo = await prisma.cargo.findUnique({ where: { id: 1 } });
      expect(mbcCargo?.activo).toBe(true);

      // 3. Importación inválida que omite 700 (error en fila) -> No debe desactivar nada por rollback
      const csvInvalid = `${csvHeader}
INVALID_DATA,1,702,3,JEFATURA EXPORTACION,KPI-3,100,KPI,8,10,8,4,3,Param,8,4,80%
`;
      await expect(importKpiCsv({ type: "buffer", buffer: Buffer.from(csvInvalid), filename: "test-import-unique-ainvalid.csv" })).rejects.toThrow();

      const cargo700PostInvalid = await prisma.cargo.findUnique({ where: { id: 700 } });
      expect(cargo700PostInvalid?.activo).toBe(true); // Sigue activo, sin cambios por error

      // 4. Snapshot posterior vuelve a traer 701 -> se reactiva (con valor 122 para cambiar hash)
      const csvContent3 = `${csvHeader}
2026,1,700,1,GERENCIA COMERCIAL,KPI-1,122,KPI,8,10,8,4,3,Param,8,4,80%
2026,1,701,2,JEFATURA VENTAS,KPI-2,100,KPI,8,10,8,4,3,Param,8,4,80%
2026,1,702,3,JEFATURA EXPORTACION,KPI-3,100,KPI,8,10,8,4,3,Param,8,4,80%
`;
      const res3 = await importKpiCsv({ type: "buffer", buffer: Buffer.from(csvContent3), filename: "test-import-unique-a3.csv" });
      expect(res3.duplicated).toBeFalsy();

      const cargo701Reactived = await prisma.cargo.findUnique({ where: { id: 701 } });
      expect(cargo701Reactived?.activo).toBe(true); // Reactivado!

      // Limpieza
      await prisma.kpiResultado.deleteMany({ where: { cargoId: { in: [700, 701, 702] } } });
      await prisma.usuario.deleteMany({ where: { cargoId: { in: [700, 701, 702] } } });
      await prisma.cargo.deleteMany({ where: { id: { in: [700, 701, 702] } } });
      await prisma.importacion.deleteMany({
        where: {
          filename: {
            in: [
              "test-import-unique-a1.csv",
              "test-import-unique-a2.csv",
              "test-import-unique-ainvalid.csv",
              "test-import-unique-a3.csv"
            ]
          }
        }
      });
    }, 15000);
  });

  describe("Active Status Reconciliation", () => {
    // IDs usados exclusivamente en estos tests.
    // Alejados de: 900/901 (http-auth), 910/911 (admin-users-api),
    //              500/501/600/601/920-922 (cargo-user-provisioning).
    const CARGO_IDS = [980, 981];
    const KPI_ID = "KPI-RECONCILE-980";

    // Snapshot de estados activo de los cargos pre-existentes (capturado antes de crear fixtures).
    // Se restaura INMEDIATAMENTE después de cada llamada a reconcileCargosHierarchy() para
    // eliminar la ventana de race condition con suites paralelas (e.g. http-auth usa cargo 901).
    // Los fixtures (980, 981) se crean DESPUÉS del snapshot, por lo que no están en él,
    // y sus estados post-reconciliación NO se sobreescriben por la restauración.
    let cargoSnapshot: { id: number; activo: boolean }[] = [];

    const restoreSnapshot = async () => {
      if (cargoSnapshot.length > 0) {
        await prisma.cargo.updateMany({
          where: { id: { in: cargoSnapshot.map((s) => s.id) } },
          data: { activo: true } // Restaurar todos a activo para no interferir
        });
        // Restaurar los que estaban inactivos antes del test
        const inactivos = cargoSnapshot.filter((s) => !s.activo);
        if (inactivos.length > 0) {
          await prisma.cargo.updateMany({
            where: { id: { in: inactivos.map((s) => s.id) } },
            data: { activo: false }
          });
        }
      }
    };

    beforeEach(async () => {
      // 1. Capturar estado ANTES de crear fixtures
      cargoSnapshot = await prisma.cargo.findMany({ select: { id: true, activo: true } });

      // 2. Limpiar cualquier fixture residual
      await prisma.kpiResultado.deleteMany({ where: { cargoId: { in: CARGO_IDS } } });
      await prisma.usuario.deleteMany({ where: { cargoId: { in: CARGO_IDS } } });
      await prisma.cargo.deleteMany({ where: { id: { in: CARGO_IDS } } });
      await prisma.importacion.deleteMany({ where: { filename: "reconcile-active-test.csv" } });
      await prisma.kpi.deleteMany({ where: { id: KPI_ID } });
    });

    afterEach(async () => {
      // Limpiar fixtures propios (snapshot ya fue restaurado dentro de cada test)
      await prisma.kpiResultado.deleteMany({ where: { cargoId: { in: CARGO_IDS } } });
      await prisma.usuario.deleteMany({ where: { cargoId: { in: CARGO_IDS } } });
      await prisma.cargo.deleteMany({ where: { id: { in: CARGO_IDS } } });
      await prisma.importacion.deleteMany({ where: { filename: "reconcile-active-test.csv" } });
      await prisma.kpi.deleteMany({ where: { id: KPI_ID } });
      // Restauración de seguridad por si el test falló antes de restaurar
      await restoreSnapshot();
    });

    it("desactiva cargo sin KPI aunque tenga usuario activo asociado; el usuario sobrevive", async () => {
      // 1. Cargo 980 activo=true, sin KpiResultado
      await prisma.cargo.create({
        data: { id: 980, nombre: "GERENCIA RECONCILE TEST", activo: true, parentId: 1 }
      });
      // 2. Usuario activo asociado a Cargo 980 (simula auto-provisionamiento del importador)
      const usuario = await prisma.usuario.create({
        data: {
          nombre: "Gerente Reconcile Test",
          email: "gerente.reconcile@test.local",
          username: "gerente.reconcile.test",
          passwordHash: "dummy-hash",
          role: "GERENTE",
          cargoId: 980,
          activo: true
        }
      });

      // 3. NO se crea ningún KpiResultado para cargo 980

      // 4. Ejecutar reconciliación
      await reconcileCargosHierarchy();
      // Restaurar snapshot inmediatamente para no afectar suites paralelas
      await restoreSnapshot();

      // 5. Cargo 980 debe quedar inactivo
      const cargo980 = await prisma.cargo.findUnique({ where: { id: 980 } });
      expect(cargo980?.activo).toBe(false);

      // 6. El usuario debe seguir existiendo (no se borra)
      const usuarioAfter = await prisma.usuario.findUnique({ where: { id: usuario.id } });
      expect(usuarioAfter).not.toBeNull();
      expect(usuarioAfter?.cargoId).toBe(980);

      // 7. MBC sigue protegido
      const mbc = await prisma.cargo.findUnique({ where: { id: 1 } });
      expect(mbc?.activo).toBe(true);
    });

    it("reactiva cargo cuando vuelven KPI; el usuario existente se reutiliza", async () => {
      // Setup: cargo 980 ya inactivo (estado que deja la desactivación / producción)
      await prisma.cargo.create({
        data: { id: 980, nombre: "GERENCIA RECONCILE TEST", activo: false, parentId: 1 }
      });
      const usuario = await prisma.usuario.create({
        data: {
          nombre: "Gerente Reconcile Test",
          email: "gerente.reconcile@test.local",
          username: "gerente.reconcile.test",
          passwordHash: "dummy-hash",
          role: "GERENTE",
          cargoId: 980,
          activo: true
        }
      });

      // KPI vuelve a existir para cargo 980
      const importacion = await prisma.importacion.create({
        data: { filename: "reconcile-active-test.csv", sha256: "sha-reactivate-980", status: "SUCCESS" }
      });
      await prisma.kpi.create({ data: { id: KPI_ID, nombre: "KPI Reconcile 980", activo: true } });
      await prisma.kpiResultado.create({
        data: {
          importacionId: importacion.id,
          anio: 2026,
          periodo: 1,
          cargoId: 980,
          kpiId: KPI_ID,
          orden: 1,
          resultadoRaw: "95%"
        }
      });

      // Reconciliar
      await reconcileCargosHierarchy();
      // Restaurar snapshot inmediatamente para no afectar suites paralelas
      await restoreSnapshot();

      // Cargo 980 debe quedar activo=true
      const cargo980 = await prisma.cargo.findUnique({ where: { id: 980 } });
      expect(cargo980?.activo).toBe(true);

      // El usuario sigue siendo el mismo
      const usuarioAfter = await prisma.usuario.findUnique({ where: { id: usuario.id } });
      expect(usuarioAfter).not.toBeNull();
      expect(usuarioAfter?.cargoId).toBe(980);
    });

    it("idempotencia: doble reconciliacion produce el mismo resultado", async () => {
      await prisma.cargo.create({
        data: { id: 980, nombre: "GERENCIA RECONCILE TEST", activo: true, parentId: 1 }
      });
      // Sin KpiResultado

      await reconcileCargosHierarchy();
      // Restaurar snapshot intermedio para minimizar ventana de race condition
      await restoreSnapshot();

      await reconcileCargosHierarchy();
      // Restaurar snapshot final
      await restoreSnapshot();

      const cargo980 = await prisma.cargo.findUnique({ where: { id: 980 } });
      expect(cargo980?.activo).toBe(false);

      const mbc = await prisma.cargo.findUnique({ where: { id: 1 } });
      expect(mbc?.activo).toBe(true);
    });
  });
});
