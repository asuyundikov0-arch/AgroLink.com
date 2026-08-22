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

  if (!application || application.status !== "approved" || !appRoles.includes(application.requestedRole as AppRole)) {
    return { userId, role: null, displayName: application?.displayName ?? "", email: application?.email ?? "", department: application?.department ?? "" };
  }

  return {
    userId,
    role: application.requestedRole as AppRole,
    displayName: application.displayName,
    email: application.email,
    department: application.department,
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