import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/authenticate.js";
import { listAvailablePeriods, listAvailableYears, listKpis } from "../modules/kpis/service.js";

const router = Router();
const querySchema = z.object({
  cargoId: z.coerce.number().int(),
  anio: z.coerce.number().int(),
  periodo: z.coerce.number().int()
});

router.get("/", authenticate, async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Query invalido", issues: parsed.error.flatten() });
    const rows = await listKpis(req.user!, parsed.data.cargoId, parsed.data.anio, parsed.data.periodo);
    res.json({ rows });
  } catch (error) {
    next(error);
  }
});

router.get("/periodos", authenticate, async (req, res, next) => {
  try {
    const parsed = querySchema.omit({ periodo: true }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Query invalido", issues: parsed.error.flatten() });
    const periodos = await listAvailablePeriods(req.user!, parsed.data.cargoId, parsed.data.anio);
    res.json({ periodos });
  } catch (error) {
    next(error);
  }
});

router.get("/anios", authenticate, async (req, res, next) => {
  try {
    const parsed = z.object({ cargoId: z.coerce.number().int() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Query invalido", issues: parsed.error.flatten() });
    const anios = await listAvailableYears(req.user!, parsed.data.cargoId);
    res.json({ anios });
  } catch (error) {
    next(error);
  }
});

export default router;
