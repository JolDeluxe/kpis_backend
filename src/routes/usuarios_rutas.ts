import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/authenticate.js";
import { authorizeSystemAdmin } from "../middlewares/authorize-system-admin.js";
import {
  changeUsuarioPassword,
  createUsuario,
  deleteUsuario,
  exportUsuarioCredentialsCsv,
  getUsuario,
  listUsuarios,
  patchUsuario,
  revealAllUsuarioPasswords,
  regenerateUsuarioPassword,
  revealUsuarioPassword
} from "../modules/usuarios/service.js";

const router = Router();
const roleSchema = z.enum(["ADMIN", "DIRECCION", "GERENTE", "JEFE", "CONSULTA"]);
const usernameSchema = z.string().min(2).max(30).regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/);
const createSchema = z.object({
  nombre: z.string().min(1),
  username: usernameSchema,
  password: z.string().min(1),
  role: roleSchema,
  cargoId: z.number().int().nullable().optional()
});
const patchSchema = z.object({
  nombre: z.string().min(1).optional(),
  username: usernameSchema.optional(),
  role: roleSchema.optional(),
  cargoId: z.number().int().nullable().optional(),
  activo: z.boolean().optional()
});
const passwordSchema = z.object({ password: z.string().min(1) });

router.use(authenticate, authorizeSystemAdmin);

router.get("/", async (_req, res, next) => {
  try {
    res.json({ usuarios: await listUsuarios() });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json({ usuario: await getUsuario(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos", issues: parsed.error.flatten() });
    res.status(201).json({ usuario: await createUsuario(parsed.data, req.user!.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/reveal-all-passwords", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.json(await revealAllUsuarioPasswords(req.user!.id));
  } catch (error) {
    next(error);
  }
});

router.post("/export-credentials", async (req, res, next) => {
  try {
    const { filename, csv } = await exportUsuarioCredentialsCsv(req.user!.id);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos", issues: parsed.error.flatten() });
    res.json({ usuario: await patchUsuario(req.params.id, parsed.data, req.user!.id) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/password", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await revealUsuarioPassword(req.params.id, req.user!.id));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/password", async (req, res, next) => {
  try {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos", issues: parsed.error.flatten() });
    res.json({ usuario: await changeUsuarioPassword(req.params.id, parsed.data.password, req.user!.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/regenerate-password", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await regenerateUsuarioPassword(req.params.id, req.user!.id));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/activate", async (req, res, next) => {
  try {
    res.json({ usuario: await patchUsuario(req.params.id, { activo: true }, req.user!.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/deactivate", async (req, res, next) => {
  try {
    res.json({ usuario: await patchUsuario(req.params.id, { activo: false }, req.user!.id) });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    res.json(await deleteUsuario(req.params.id, req.user));
  } catch (error) {
    next(error);
  }
});

export default router;
