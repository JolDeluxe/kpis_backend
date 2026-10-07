import { logger } from "./logger.js";
import { prisma } from "../db/index.js";

export type AuditEvent =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_SELF_CHANGED"
  | "PASSWORD_VIEWED"
  | "PASSWORDS_BULK_VIEWED"
  | "PASSWORDS_EXPORTED"
  | "PASSWORD_REGENERATED"
  | "USER_CREATED"
  | "USER_AUTO_CREATED"
  | "USER_UPDATED"
  | "USER_ACTIVATED"
  | "USER_DISABLED"
  | "USER_DEACTIVATED"
  | "USER_DELETE_BLOCKED"
  | "USER_DELETED"
  | "USERNAME_CHANGED"
  | "ROLE_CHANGED"
  | "CARGO_CHANGED"
  | "ACCESS_DENIED"
  | "CSV_IMPORT_SUCCESS"
  | "CSV_IMPORT_FAILURE"
  | "SYNC_AUTH_FAILURE";

export const audit = (event: AuditEvent, details: Record<string, unknown> = {}) => {
  logger.info({ auditEvent: event, ...details }, "audit");
};

export const auditPersistent = async (
  event: AuditEvent,
  input: { actorUserId?: string | null; targetUserId?: string | null; metadata?: Record<string, unknown> } = {}
) => {
  audit(event, { actorUserId: input.actorUserId, targetUserId: input.targetUserId, ...(input.metadata || {}) });
  await prisma.auditLog.create({
    data: {
      event,
      actorUserId: input.actorUserId || null,
      targetUserId: input.targetUserId || null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null
    }
  });
};
