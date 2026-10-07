import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/authenticate.js";
import { getDashboardResumen } from "../modules/dashboard/service.js";

const router = Router();
const querySchema = z.object({
  cargoId: z.coerce.number().int(),
  anio: z.coerce.number().int(),
  periodo: z.coerce.number().int()
});

router.get("/resumen", authenticate, async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Query invalido", issues: parsed.error.flatten() });
    const resumen = await getDashboardResumen(req.user!, parsed.data.cargoId, parsed.data.anio, parsed.data.periodo);
    res.json({ resumen });
  } catch (error) {
    next(error);
  }
});

export default router;
