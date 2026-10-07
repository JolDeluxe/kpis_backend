import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { listVisibleCargos } from "../modules/cargos/service.js";
import { getKpiSyncStatus, runKpiSyncManual, runKpiSyncNow } from "../modules/kpi-sync/service.js";

const router = Router();
const userRouter = Router();

router.get("/status", authenticate, authorize("ADMIN"), async (_req, res, next) => {
  try {
    res.json(await getKpiSyncStatus());
  } catch (error) {
    next(error);
  }
});

router.post("/run", authenticate, authorize("ADMIN"), async (_req, res, next) => {
  try {
    const result = await runKpiSyncNow();
    res.status(result.status === "ERROR" ? 502 : 200).json(result);
  } catch (error) {
    next(error);
  }
});

userRouter.post("/run", authenticate, async (req, res, next) => {
  try {
    const cargos = await listVisibleCargos(req.user!);
    if (!cargos.length) return res.status(403).json({ message: "No tienes acceso al modulo KPI." });

    const result = await runKpiSyncManual();
    res.status(result.status === "ERROR" ? 502 : 200).json({
      status: result.status,
      message: result.message,
      rowCount: result.rowCount,
      cached: result.cached,
      reused: result.reused,
      cooldownMs: result.cooldownMs
    });
  } catch (error) {
    next(error);
  }
});

export default router;
export { userRouter as kpiSyncUserRoutes };
