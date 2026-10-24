import { asc, eq } from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  CreateEmployeeBody,
  CreateEmployeeResponse,
  ListEmployeesResponse,
  UpdateEmployeeBody,
  UpdateEmployeeParams,
  UpdateEmployeeResponse,
} from "@workspace/api-zod";
import { activityTable, db, employeesTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";

const router: IRouter = Router();
const employeeReaders = new Set([
  "agronomist", "chief_agronomist", "grain_manager", "weigher",
  "dispatcher", "general_director", "chief_engineer",
]);
const employeeManagers = new Set(["chief_agronomist", "chief_engineer", "dispatcher", "general_director"]);
const actor = (access: RoleAccess) => `${access.displayName} · ${access.role}`;
const roleGuard = (roles: Set<string>, error: string): RequestHandler => (_req, res, next) => {
  const role = (res.locals.access as RoleAccess).role;
  if (!role || !roles.has(role)) {
    res.status(403).json({ error });
    return;
  }
  next();
};
router.use(
  "/economic/employees",
  requireApprovedRole,
  roleGuard(employeeReaders, "Справочник сотрудников недоступен для вашей роли."),
);

function employeeJson(row: typeof employeesTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/economic/employees", async (_req, res, next): Promise<void> => {
  try {
    const rows = await db.select().from(employeesTable)
      .orderBy(asc(employeesTable.fullName), asc(employeesTable.id));
    res.setHeader("Cache-Control", "no-store");
    res.json(ListEmployeesResponse.parse(rows.map(employeeJson)));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/economic/employees",
  roleGuard(employeeManagers, "Добавлять сотрудников могут главные специалисты, диспетчер и генеральный директор."),
  async (req, res, next): Promise<void> => {
    try {
      const parsed = CreateEmployeeBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const fullName = parsed.data.fullName.trim().replace(/\s+/g, " ");
      if (fullName.length < 2) {
        res.status(400).json({ error: "Укажите ФИО сотрудника." });
        return;
      }
      const access = res.locals.access as RoleAccess;
      const [row] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(employeesTable).values({
          fullName,
          department: parsed.data.department.trim(),
          position: parsed.data.position.trim(),
          createdBy: actor(access),
          updatedBy: actor(access),
        }).returning();
        await tx.insert(activityTable).values({
          action: "Добавлен сотрудник в справочник",
          templateName: `${created.fullName} · ${created.department || "без подразделения"}`,
          userName: actor(access),
        });
        return [created];
      });
      res.status(201).json(CreateEmployeeResponse.parse(employeeJson(row)));
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/economic/employees/:id",
  roleGuard(employeeManagers, "Изменять справочник могут главные специалисты, диспетчер и генеральный директор."),
  async (req, res, next): Promise<void> => {
    try {
      const params = UpdateEmployeeParams.safeParse(req.params);
      const parsed = UpdateEmployeeBody.safeParse(req.body);
      if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
      }
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const fullName = parsed.data.fullName.trim().replace(/\s+/g, " ");
      if (fullName.length < 2) {
        res.status(400).json({ error: "Укажите ФИО сотрудника." });
        return;
      }
      const access = res.locals.access as RoleAccess;
      const result = await db.transaction(async (tx) => {
        const [row] = await tx.update(employeesTable).set({
          fullName,
          department: parsed.data.department.trim(),
          position: parsed.data.position.trim(),
          isActive: parsed.data.isActive,
          updatedBy: actor(access),
          updatedAt: new Date(),
        }).where(eq(employeesTable.id, params.data.id)).returning();
        if (!row) return null;
        await tx.insert(activityTable).values({
          action: parsed.data.isActive ? "Изменены данные сотрудника" : "Сотрудник деактивирован",
          templateName: `${row.fullName} · ${row.department || "без подразделения"}`,
          userName: actor(access),
        });
        return row;
      });
      if (!result) {
        res.status(404).json({ error: "Сотрудник не найден." });
        return;
      }
      res.json(UpdateEmployeeResponse.parse(employeeJson(result)));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
