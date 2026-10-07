import { Router } from "express";
import { z } from "zod";
import { env, isProduction } from "../env.js";
import { authenticate, signAccessToken } from "../middlewares/authenticate.js";
import {
  createRefreshSession,
  changeOwnPassword,
  getMe,
  loginUser,
  revokeAllRefreshSessions,
  revokeRefreshSessionByToken,
  rotateRefreshSession
} from "../modules/auth/service.js";
import { audit } from "../utils/audit-log.js";

const router = Router();
const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) });
const ACCESS_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
  path: "/"
};

const setAuthCookies = (res: import("express").Response, input: { userId: string; sessionId: string; refreshToken: string }) => {
  res.cookie(env.COOKIE_NAME, signAccessToken(input.userId, input.sessionId), {
    ...cookieOptions,
    maxAge: ACCESS_MAX_AGE_MS
  });
  res.cookie(env.REFRESH_COOKIE_NAME, input.refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_MAX_AGE_MS
  });
};

const clearAuthCookies = (res: import("express").Response) => {
  res.clearCookie(env.COOKIE_NAME, cookieOptions);
  res.clearCookie(env.REFRESH_COOKIE_NAME, cookieOptions);
};

const loginRateLimit = (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  const key = `${req.ip}:${String(req.body?.username || "").toLowerCase().trim()}`;
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (current.count >= LOGIN_RATE_LIMIT_MAX) {
    return res.status(429).json({ message: "Demasiados intentos. Intenta de nuevo más tarde." });
  }

  current.count += 1;
  return next();
};

router.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Credenciales inválidas" });

    const user = await loginUser(parsed.data.username, parsed.data.password);
    if (!user) {
      audit("LOGIN_FAILURE", { username: parsed.data.username.toLowerCase().trim(), ip: req.ip });
      return res.status(401).json({ message: "Credenciales inválidas" });
    }
    const { session, refreshToken } = await createRefreshSession({
      userId: user.id,
      userAgent: req.get("user-agent") || undefined,
      ip: req.ip
    });

    setAuthCookies(res, { userId: user.id, sessionId: session.id, refreshToken });
    audit("LOGIN_SUCCESS", { userId: user.id, username: user.username, ip: req.ip });

    return res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "Refresh token requerido" });
    }

    const rotated = await rotateRefreshSession(refreshToken);
    if (!rotated) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "Refresh token invalido o expirado" });
    }

    setAuthCookies(res, {
      userId: rotated.user.id,
      sessionId: rotated.session.id,
      refreshToken: rotated.refreshToken
    });

    res.json({ user: rotated.user });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    await revokeRefreshSessionByToken(req.cookies?.[env.REFRESH_COOKIE_NAME]);
    clearAuthCookies(res);
    audit("LOGOUT", { userId: req.user?.id, ip: req.ip });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/logout-all", authenticate, async (req, res, next) => {
  try {
    await revokeAllRefreshSessions(req.user!.id);
    clearAuthCookies(res);
    audit("LOGOUT", { userId: req.user!.id, allSessions: true, ip: req.ip });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/change-password", authenticate, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos", issues: parsed.error.flatten() });
    const result = await changeOwnPassword(req.user!.id, parsed.data);
    clearAuthCookies(res);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await getMe(req.user!.id);
    if (!user) return res.status(401).json({ message: "Sesion invalida" });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

export default router;
