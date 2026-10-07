import { prisma } from "../../db/index.js";
import { assertCargoScope } from "../cargos/service.js";
import type { ScopeUser } from "../../utils/cargo-scope.js";
import { filterAvailablePeriods, isPeriodAvailable } from "../../utils/period-availability.js";

export const getDashboardResumen = async (user: ScopeUser, cargoId: number, anio: number, periodo: number) => {
  await assertCargoScope(user, cargoId);
  const periodos = await prisma.kpiResultado.findMany({
    where: { cargoId, anio },
    distinct: ["periodo"],
    select: { periodo: true },
    orderBy: { periodo: "asc" }
  });
  const periodosRaw = periodos.map((row) => row.periodo);
  const periodosDisponibles = filterAvailablePeriods(periodosRaw);
  const canShowRequestedPeriod = isPeriodAvailable(periodosRaw, periodo);
  const first = canShowRequestedPeriod
    ? await prisma.kpiResultado.findFirst({
      where: { cargoId, anio, periodo },
      include: { cargo: true },
      orderBy: [{ orden: "asc" }, { kpiId: "asc" }]
    })
    : null;
  const cargo = first?.cargo ?? await prisma.cargo.findUnique({ where: { id: cargoId } });

  return {
    cargo,
    anio,
    periodo,
    sumaValorRaw: first?.sumaValorRaw ?? null,
    sumaCalificacionRaw: first?.sumaCalificacionRaw ?? null,
    calificacionGeneralRaw: first?.calificacionGeneralRaw ?? null,
    periodosDisponibles
  };
};
