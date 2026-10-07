# KPI Jefaturas - Backend & Sync Agent

Backend API en Express (Node.js) con base de datos SQLite persistente y agente de sincronización de KPIs integrado para ejecución en servidor Windows con PM2.

## Requisitos
- Node.js >= 20
- npm >= 10

## Configuración
1. Copiar `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Inicializar base de datos SQLite y Prisma:
   ```bash
   npm run prisma:migrate
   ```

## Scripts disponibles
- `npm run dev`: Inicia el servidor de desarrollo en el puerto configurado (3005).
- `npm run dev:sync`: Inicia el agente de sincronización en modo observación.
- `npm run build`: Genera el cliente Prisma y compila TypeScript a `dist/`.
- `npm run start`: Inicia el servidor compilado en producción.
- `npm run db:backup`: Genera un respaldo atómico de la base SQLite con verificación de integridad.
- `npm test`: Ejecuta la suite de pruebas automatizadas.

## Despliegue en Producción (PM2 en Windows Server)
```powershell
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
```
