import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.js";
import { listVisibleCargos } from "../modules/cargos/service.js";

const router = Router();

router.get("/visibles", authenticate, async (req, res, next) => {
  try {
    const cargos = await listVisibleCargos(req.user!);
    res.json({ cargos });
  } catch (error) {
    next(error);
  }
});

export default router;
