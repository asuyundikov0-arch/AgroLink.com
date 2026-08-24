import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { appRoles, db, roleApplicationsTable, type AppRole } from "@workspace/db";

export { appRoles, type AppRole };

export type RoleAccess = {
  userId: string;
  role: AppRole | null;
  displayName: string;
  email: string;
  department: string;
};

export function getConfiguredInitialDirectorEmail(): string | null {
  const email = process.env.INITIAL_GENERAL_DIRECTOR_EMAIL?.trim().toLowerCase();
  return email || null;
}

export function isConfiguredInitialDirectorEmail(email: string): boolean {
  return getConfiguredInitialDirectorEmail() === email.trim().toLowerCase();
}

async function hasConfiguredInitialDirectorEmail(userId: string): Promise<boolean> {
  if (!getConfiguredInitialDirectorEmail()) return false;
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.primaryEmailAddress;
  return primaryEmail?.verification?.status === "verified"
    && isConfiguredInitialDirectorEmail(primaryEmail.emailAddress);
}

export async function getAccess(req: Request): Promise<RoleAccess> {
  const auth = getAuth(req);
  const userId = auth.userId ?? "";
  if (!userId) {
    return { userId: "", role: null, displayName: "", email: "", department: "" };
  }

  let [application] = await db
    .select()
    .from(roleApplicationsTable)
    .where(eq(roleApplicationsTable.userId, userId))
    .orderBy(desc(roleApplicationsTable.requestedAt))
    .limit(1);

  if (
    application
    && application.status === "pending"
    && application.requestedRole === "general_director"
  ) {
    const approvedDirectors = await db
      .select({ id: roleApplicationsTable.id })
      .from(roleApplicationsTable)
      .where(and(
        eq(roleApplicationsTable.requestedRole, "general_director"),
        eq(roleApplicationsTable.status, "approved"),
      ))
      .limit(1);

    if (approvedDirectors.length === 0 && await hasConfiguredInitialDirectorEmail(userId)) {
      const [approvedApplication] = await db
        .update(roleApplicationsTable)
        .set({
          status: "approved",
          reviewComment: "Генеральный директор назначен через защищённую настройку запуска.",
          reviewedByUserId: "system-bootstrap",
          reviewedByName: "Система",
          reviewedAt: new Date(),
        })
        .where(and(
          eq(roleApplicationsTable.id, application.id),
          eq(roleApplicationsTable.status, "pending"),
        ))
        .returning();
      if (approvedApplication) {
        application = approvedApplication;
      } else {
        const [currentApplication] = await db
          .select()
          .from(roleApplicationsTable)
          .where(eq(roleApplicationsTable.id, application.id))
          .limit(1);
        application = currentApplication ?? application;
      }
    }
  }

  if (!application || application.status !== "approved" || !appRoles.includes(application.requestedRole as AppRole)) {
    return { userId, role: null, displayName: application?.displayName ?? "", email: application?.email ?? "", department: application?.department ?? "" };
  }

  const requestedContext = req.header("x-role-context");
  const effectiveRole = application.requestedRole as AppRole;
  const role = effectiveRole === "general_director"
    && requestedContext
    && appRoles.includes(requestedContext as AppRole)
    ? requestedContext as AppRole
    : effectiveRole;
  return {
    userId,
    role,
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
