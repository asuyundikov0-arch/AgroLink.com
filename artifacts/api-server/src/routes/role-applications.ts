import { clerkClient, getAuth } from "@clerk/express";
import { and, count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateRoleRequestBody,
  CreateRoleRequestResponse,
  DeleteUserParams,
  GetMyRoleRequestResponse,
  ListUsersResponse,
  ListRoleRequestsResponse,
  ReviewRoleRequestBody,
  ReviewRoleRequestParams,
  ReviewRoleRequestResponse,
} from "@workspace/api-zod";
import {
  appRoles,
  db,
  roleApplicationsTable,
  type AppRole,
  type RoleApplicationStatus,
} from "@workspace/db";
import {
  getAccess,
  isConfiguredInitialDirectorEmail,
  requireApprovedRole,
  requireAuth,
  type AppRole as AccessRole,
  type RoleAccess,
} from "../middlewares/auth";

const router: IRouter = Router();

function serializeApplication(application: typeof roleApplicationsTable.$inferSelect) {
  return {
    id: application.id,
    userId: application.userId,
    email: application.email,
    displayName: application.displayName,
    department: application.department,
    requestedRole: appRoles.includes(application.requestedRole as AppRole)
      ? application.requestedRole as AppRole
      : "agronomist" as const,
    status: ["pending", "approved", "rejected"].includes(application.status)
      ? application.status as RoleApplicationStatus
      : "pending" as const,
    reviewComment: application.reviewComment,
    reviewedByName: application.reviewedByName,
    requestedAt: application.requestedAt.toISOString(),
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
  };
}

function canReview(requestedRole: AppRole, reviewerRole: AccessRole): boolean {
  if (reviewerRole === "general_director") return true;
  if (reviewerRole === "farm_director") {
    return ["agronomist", "chief_agronomist", "economist"].includes(requestedRole);
  }
  if (reviewerRole === "chief_agronomist") return requestedRole === "agronomist";
  return reviewerRole === "chief_engineer" && requestedRole === "engineer";
}

async function clerkProfile(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    || user.username
    || "Сотрудник";
  const primaryEmail = user.primaryEmailAddress;
  const email = primaryEmail?.emailAddress ?? "";
  if (!email) throw new Error("У зарегистрированного пользователя не указан e-mail");
  return { displayName, email, emailVerified: primaryEmail?.verification?.status === "verified" };
}

router.get("/role-requests/me", requireAuth, async (req, res, next): Promise<void> => {
  try {
    const access = await getAccess(req);
    const [application] = await db
      .select()
      .from(roleApplicationsTable)
      .where(eq(roleApplicationsTable.userId, access.userId))
      .orderBy(desc(roleApplicationsTable.requestedAt))
      .limit(1);
    res.json(GetMyRoleRequestResponse.parse(application ? serializeApplication(application) : null));
  } catch (error) {
    next(error);
  }
});

router.post("/role-requests", requireAuth, async (req, res, next): Promise<void> => {
  try {
    const body = CreateRoleRequestBody.parse(req.body);
    const userId = getAuth(req).userId ?? "";
    const [existingBeforeAccessSync] = await db
      .select()
      .from(roleApplicationsTable)
      .where(eq(roleApplicationsTable.userId, userId))
      .limit(1);
    const approvedDirectorsBeforeAccessSync = await db
      .select({ id: roleApplicationsTable.id })
      .from(roleApplicationsTable)
      .where(and(
        eq(roleApplicationsTable.requestedRole, "general_director"),
        eq(roleApplicationsTable.status, "approved"),
      ))
      .limit(1);
    const access = await getAccess(req);
    const [existing] = await db
      .select()
      .from(roleApplicationsTable)
      .where(eq(roleApplicationsTable.userId, access.userId))
      .limit(1);
    const profile = await clerkProfile(access.userId);
    const initialDirector = body.requestedRole === "general_director"
      && approvedDirectorsBeforeAccessSync.length === 0
      && profile.emailVerified
      && isConfiguredInitialDirectorEmail(profile.email);

    if (
      existingBeforeAccessSync?.status === "pending"
      && existing?.status === "approved"
      && initialDirector
      && existing.requestedRole === "general_director"
    ) {
      res.status(200).json(CreateRoleRequestResponse.parse(serializeApplication(existing)));
      return;
    }
    if (existing?.status === "pending") {
      res.status(409).json({ error: "Заявка уже ожидает согласования" });
      return;
    }
    if (existing?.status === "approved") {
      res.status(409).json({ error: "Роль уже согласована. Изменить её может только руководитель." });
      return;
    }

    if (
      body.requestedRole === "general_director"
      && approvedDirectorsBeforeAccessSync.length === 0
      && !initialDirector
    ) {
      res.status(403).json({
        error: "Первого генерального директора должен назначить администратор в защищённой настройке запуска.",
      });
      return;
    }
    const values = {
      userId: access.userId,
      email: profile.email,
      displayName: profile.displayName,
      department: body.department,
      requestedRole: body.requestedRole,
      status: initialDirector ? "approved" : "pending",
      reviewComment: initialDirector
        ? "Первый генеральный директор назначен для запуска процесса согласования."
        : "",
      reviewedByUserId: initialDirector ? "system-bootstrap" : "",
      reviewedByName: initialDirector ? "Система" : "",
      reviewedAt: initialDirector ? new Date() : null,
    };

    const [application] = existing
      ? await db.update(roleApplicationsTable).set({
          ...values,
          requestedAt: new Date(),
        }).where(eq(roleApplicationsTable.id, existing.id)).returning()
      : await db.insert(roleApplicationsTable).values(values).returning();

    res.status(existing ? 200 : 201).json(CreateRoleRequestResponse.parse(serializeApplication(application)));
  } catch (error) {
    next(error);
  }
});

router.get("/role-requests", requireApprovedRole, async (_req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    const rows = await db
      .select()
      .from(roleApplicationsTable)
      .where(eq(roleApplicationsTable.status, "pending"))
      .orderBy(desc(roleApplicationsTable.requestedAt));
    res.json(ListRoleRequestsResponse.parse(rows.filter((row) => canReview(row.requestedRole as AppRole, access.role!)).map(serializeApplication)));
  } catch (error) {
    next(error);
  }
});

router.patch("/role-requests/:id", requireApprovedRole, async (req, res, next): Promise<void> => {
  try {
    const { id } = ReviewRoleRequestParams.parse({ id: Number(req.params.id) });
    const body = ReviewRoleRequestBody.parse(req.body);
    const access = res.locals.access as RoleAccess;
    const [application] = await db.select().from(roleApplicationsTable).where(eq(roleApplicationsTable.id, id));

    if (!application) {
      res.status(404).json({ error: "Заявка не найдена" });
      return;
    }
    if (application.status !== "pending") {
      res.status(409).json({ error: "По этой заявке уже принято решение" });
      return;
    }
    if (!canReview(application.requestedRole as AppRole, access.role!)) {
      res.status(403).json({ error: "У вас нет права согласовать эту роль" });
      return;
    }

    const [updated] = await db.update(roleApplicationsTable).set({
      status: body.decision === "approved" ? "approved" : "rejected",
      reviewComment: body.reviewComment,
      reviewedByUserId: access.userId,
      reviewedByName: access.displayName,
      reviewedAt: new Date(),
    }).where(eq(roleApplicationsTable.id, id)).returning();

    res.json(ReviewRoleRequestResponse.parse(serializeApplication(updated)));
  } catch (error) {
    next(error);
  }
});

router.get("/users", requireApprovedRole, async (_req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (access.role !== "general_director") {
      res.status(403).json({ error: "Только генеральный директор может просматривать список сотрудников" });
      return;
    }
    const rows = await db
      .select()
      .from(roleApplicationsTable)
      .where(eq(roleApplicationsTable.status, "approved"))
      .orderBy(desc(roleApplicationsTable.requestedAt));
    res.json(ListUsersResponse.parse(rows.map(serializeApplication)));
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:id", requireApprovedRole, async (req, res, next): Promise<void> => {
  try {
    const { id } = DeleteUserParams.parse({ id: Number(req.params.id) });
    const access = res.locals.access as RoleAccess;
    if (access.role !== "general_director") {
      res.status(403).json({ error: "Только генеральный директор может удалить сотрудника из списка" });
      return;
    }
    const [application] = await db.select().from(roleApplicationsTable).where(eq(roleApplicationsTable.id, id));
    if (!application || application.status !== "approved") {
      res.status(404).json({ error: "Сотрудник не найден" });
      return;
    }
    if (application.userId === access.userId) {
      res.status(400).json({ error: "Нельзя удалить собственный доступ" });
      return;
    }
    if (application.requestedRole === "general_director") {
      const [directorCount] = await db
        .select({ total: count() })
        .from(roleApplicationsTable)
        .where(and(
          eq(roleApplicationsTable.requestedRole, "general_director"),
          eq(roleApplicationsTable.status, "approved"),
        ));
      if ((directorCount?.total ?? 0) <= 1) {
        res.status(409).json({ error: "Нельзя удалить последнего действующего генерального директора" });
        return;
      }
    }
    await db.delete(roleApplicationsTable).where(eq(roleApplicationsTable.id, application.id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;