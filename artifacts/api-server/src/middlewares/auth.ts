import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { appRoles, db, roleApplicationsTable, type AppRole } from "@workspace/db";

export { appRoles, type AppRole };

export type RoleAccess = {
  userId: string;
  role: AppRole | null;
  displayName: string;
  email: string;
  department: string;
};

function isConfiguredGeneralDirector(application: typeof roleApplicationsTable.$inferSelect) {
  const configuredEmail = process.env.INITIAL_GENERAL_DIRECTOR_EMAIL?.trim().toLowerCase();
  return application.requestedRole === "general_director"
    && Boolean(configuredEmail)
    && application.email.trim().toLowerCase() === configuredEmail;
}

async function ensureConfiguredDirectorApproved(application: typeof roleApplicationsTable.$inferSelect) {
  if (application.status !== "pending" || !isConfiguredGeneralDirector(application)) return application;
  const [updated] = await db.update(roleApplicationsTable)
    .set({
      status: "approved",
      reviewComment: "Доступ генерального директора подтверждён защищённой настройкой запуска.",
      reviewedByUserId: "system-bootstrap",
      reviewedByName: "Система",
      reviewedAt: new Date(),
    })
    .where(eq(roleApplicationsTable.id, application.id))
    .returning();
  return updated ?? application;
}

export async function getAccess(req: Request): Promise<RoleAccess> {
  const auth = getAuth(req);
  const userId = auth.userId ?? "";
  if (!userId) {
    return { userId: "", role: null, displayName: "", email: "", department: "" };
  }

  const [application] = await db
    .select()
    .from(roleApplicationsTable)
    .where(eq(roleApplicationsTable.userId, userId))
    .orderBy(desc(roleApplicationsTable.requestedAt))
    .limit(1);
  const effectiveApplication = application ? await ensureConfiguredDirectorApproved(application) : undefined;

  if (!effectiveApplication || effectiveApplication.status !== "approved" || !appRoles.includes(effectiveApplication.requestedRole as AppRole)) {
    return { userId, role: null, displayName: effectiveApplication?.displayName ?? "", email: effectiveApplication?.email ?? "", department: effectiveApplication?.department ?? "" };
  }

  return {
    userId,
    role: effectiveApplication.requestedRole as AppRole,
    displayName: effectiveApplication.displayName,
    email: effectiveApplication.email,
    department: effectiveApplication.department,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Требуется вход в систему" });
    return;
  }
  next();
}

export async function requireApprovedRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  const access = await getAccess(req);
  if (!access.userId) {
    res.status(401).json({ error: "Требуется вход в систему" });
    return;
  }
  if (!access.role) {
    res.status(403).json({ error: "Роль ещё не согласована руководителем" });
    return;
  }
  res.locals.access = access;
  next();
}