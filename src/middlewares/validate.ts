import type { NextFunction, Request, Response } from "express";
import type { AnyZodObject } from "zod";

export const validate = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
  const parsed = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!parsed.success) return res.status(400).json({ message: "Datos invalidos", issues: parsed.error.flatten() });
  Object.assign(req, parsed.data);
  next();
};
