import cors from "cors";
import { frontendOriginsPermitidos, isProduction } from "../env.js";

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Si no hay cabecera Origin (peticiones server-to-server, curl, PM2, postman, llamadas internas), permitir
    if (!origin) return callback(null, true);

    if (frontendOriginsPermitidos.includes(origin) || frontendOriginsPermitidos.includes("*")) {
      return callback(null, true);
    }

    if (!isProduction) {
      return callback(null, true);
    }

    // En producción denegar origen no permitido sin lanzar excepción
    return callback(null, false);
  },
  credentials: true
});

