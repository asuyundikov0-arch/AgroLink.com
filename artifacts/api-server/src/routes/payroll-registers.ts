import { and, asc, desc, eq, ne, inArray } from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  CreatePayrollRegisterBody,
  CreatePayrollRegisterResponse,
  ListPayrollRegistersResponse,
  SendPayrollRegisterBody,
  SendPayrollRegisterParams,
  SendPayrollRegisterResponse,
  UpdatePayrollRegisterBody,
  UpdatePayrollRegisterParams,
  UpdatePayrollRegisterResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  db,
  payrollRegisterItemsTable,
  payrollRegistersTable,
} from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";

const router: IRouter = Router();
const readerRoles = new Set(["dispatcher", "economist", "general_director"]);
const editorRoles = new Set(["dispatcher", "general_director"]);
const maxRegisterAmount = 999999999999.99;
const allowed: RequestHandler = (_req, res, next) => {
  const role = (res.locals.access as RoleAccess).role;
  if (!role || !readerRoles.has(role)) {
    res.status(403).json({ error: "Зарплатный реестр доступен диспетчеру, экономисту и генеральному директору." });
    return;
  }
  next();
};
router.use("/economic/payroll-registers", requireApprovedRole, allowed);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LineInput = { employeeName: string; workType: string; details: string; amountKzt: number };
const actor = (access: RoleAccess) => `${access.displayName} · ${access.role}`;
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const totalFor = (entries: LineInput[]) =>
  cents(entries.reduce((sum, entry) => sum + Math.round(cents(entry.amountKzt) * 100), 0) / 100);
const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "23505";
const lineValues = (entries: LineInput[], registerId: number) => entries.map((entry) => ({
  registerId,
  employeeName: entry.employeeName.trim(),
  workType: entry.workType.trim(),
  details: entry.details.trim(),
  amountKzt: cents(entry.amountKzt).toFixed(2),
}));

function normalizeRegister(register: typeof payrollRegistersTable.$inferSelect, items: (typeof payrollRegisterItemsTable.$inferSelect)[]) {
  return {
    id: register.id,
    workDate: register.workDate,
    unit: register.unit,
    status: register.status as "draft" | "sent_to_economist",
    totalAmount: Number(register.totalAmount),
    version: register.version,
    createdByName: register.createdByName,
    submittedByName: register.submittedByName,
    createdAt: register.createdAt.toISOString(),
    submittedAt: register.submittedAt?.toISOString() ?? null,
    entries: items.map((item) => ({
      id: item.id,
      employeeName: item.employeeName,
      workType: item.workType,
      details: item.details,
      amountKzt: Number(item.amountKzt),
    })),
  };
}

async function loadRegister(id: number) {
  const [register] = await db.select().from(payrollRegistersTable).where(eq(payrollRegistersTable.id, id));
  if (!register) return null;
  const items = await db.select().from(payrollRegisterItemsTable)
    .where(eq(payrollRegisterItemsTable.registerId, id))
    .orderBy(asc(payrollRegisterItemsTable.id));
  return normalizeRegister(register, items);
}

async function loadRegisters(role: string) {
  const rows = await db.select().from(payrollRegistersTable)
    .where(role === "economist" ? eq(payrollRegistersTable.status, "sent_to_economist") : undefined)
    .orderBy(desc(payrollRegistersTable.workDate), desc(payrollRegistersTable.id));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const items = await db.select().from(payrollRegisterItemsTable)
    .where(inArray(payrollRegisterItemsTable.registerId, ids))
    .orderBy(asc(payrollRegisterItemsTable.id));
  const itemsByRegister = new Map<number, typeof items>();
  for (const item of items) {
    const group = itemsByRegister.get(item.registerId) ?? [];
    group.push(item);
    itemsByRegister.set(item.registerId, group);
  }
  return rows.map((row) => normalizeRegister(row, itemsByRegister.get(row.id) ?? []));
}

function writeAllowed(access: RoleAccess, res: Parameters<RequestHandler>[1]) {
  if (access.role && editorRoles.has(access.role)) return true;
  res.status(403).json({ error: "Создавать, изменять и отправлять реестр может диспетчер." });
  return false;
}

router.get("/economic/payroll-registers", async (_req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    res.setHeader("Cache-Control", "no-store");
    res.json(ListPayrollRegistersResponse.parse(await loadRegisters(access.role ?? "")));
  } catch (error) {
    next(error);
  }
});

router.post("/economic/payroll-registers", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (!writeAllowed(access, res)) return;
    const parsed = CreatePayrollRegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    if (!validDate(input.workDate)) {
      res.status(400).json({ error: "Укажите корректную дату рабочего дня." });
      return;
    }
    const unit = input.unit.trim();
    if (!unit) {
      res.status(400).json({ error: "Выберите подразделение." });
      return;
    }
    const entries = input.entries as LineInput[];
    const totalAmount = totalFor(entries);
    if (totalAmount > maxRegisterAmount) {
      res.status(400).json({ error: "Общая сумма реестра превышает допустимый предел." });
      return;
    }
    const result = await db.transaction(async (tx: Tx) => {
      const [existing] = await tx.select({ id: payrollRegistersTable.id }).from(payrollRegistersTable)
        .where(and(eq(payrollRegistersTable.workDate, input.workDate), eq(payrollRegistersTable.unit, unit)));
      if (existing) return { error: "Реестр за эту дату и подразделение уже существует.", status: 409 as const };
      const [register] = await tx.insert(payrollRegistersTable).values({
        workDate: input.workDate,
        unit,
        status: "draft",
        totalAmount: totalAmount.toFixed(2),
        createdByUserId: access.userId,
        createdByName: actor(access),
      }).returning();
      await tx.insert(payrollRegisterItemsTable).values(lineValues(entries, register.id));
      await tx.insert(activityTable).values({
        action: "Создан черновик зарплатного реестра",
        templateName: `${unit} · ${input.workDate} · ${totalAmount.toLocaleString("ru-RU")} ₸`,
        userName: actor(access),
      });
      return { id: register.id };
    });
    if ("error" in result) {
      res.status(result.status ?? 500).json({ error: result.error });
      return;
    }
    const register = await loadRegister(result.id);
    if (!register) {
      res.status(404).json({ error: "Реестр сохранён, но не найден." });
      return;
    }
    res.status(201).json(CreatePayrollRegisterResponse.parse(register));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Реестр за эту дату и подразделение уже существует." });
      return;
    }
    next(error);
  }
});

router.patch("/economic/payroll-registers/:id", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (!writeAllowed(access, res)) return;
    const params = UpdatePayrollRegisterParams.safeParse(req.params);
    const parsed = UpdatePayrollRegisterBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    if (!Number.isSafeInteger(input.version) || !validDate(input.workDate)) {
      res.status(400).json({ error: "Проверьте версию черновика и дату рабочего дня." });
      return;
    }
    const unit = input.unit.trim();
    if (!unit) {
      res.status(400).json({ error: "Выберите подразделение." });
      return;
    }
    const entries = input.entries as LineInput[];
    const totalAmount = totalFor(entries);
    if (totalAmount > maxRegisterAmount) {
      res.status(400).json({ error: "Общая сумма реестра превышает допустимый предел." });
      return;
    }
    const result = await db.transaction(async (tx: Tx) => {
      const [current] = await tx.select().from(payrollRegistersTable)
        .where(eq(payrollRegistersTable.id, params.data.id)).for("update");
      if (!current) return { error: "Реестр не найден.", status: 404 as const };
      if (current.status !== "draft") return { error: "Отправленный реестр изменить нельзя.", status: 409 as const };
      if (current.version !== input.version) return { error: "Черновик изменился. Обновите список и повторите.", status: 409 as const };
      const [duplicate] = await tx.select({ id: payrollRegistersTable.id }).from(payrollRegistersTable)
        .where(and(
          eq(payrollRegistersTable.workDate, input.workDate),
          eq(payrollRegistersTable.unit, unit),
          ne(payrollRegistersTable.id, current.id),
        ));
      if (duplicate) return { error: "Для этой даты и подразделения уже есть другой реестр.", status: 409 as const };
      await tx.delete(payrollRegisterItemsTable).where(eq(payrollRegisterItemsTable.registerId, current.id));
      await tx.insert(payrollRegisterItemsTable).values(lineValues(entries, current.id));
      await tx.update(payrollRegistersTable).set({
        workDate: input.workDate,
        unit,
        totalAmount: totalAmount.toFixed(2),
        version: current.version + 1,
        updatedAt: new Date(),
      }).where(eq(payrollRegistersTable.id, current.id));
      await tx.insert(activityTable).values({
        action: "Изменён черновик зарплатного реестра",
        templateName: `${unit} · ${input.workDate} · ${totalAmount.toLocaleString("ru-RU")} ₸`,
        userName: actor(access),
      });
      return { id: current.id };
    });
    if ("error" in result) {
      res.status(result.status ?? 500).json({ error: result.error });
      return;
    }
    const register = await loadRegister(result.id);
    if (!register) {
      res.status(404).json({ error: "Реестр изменён, но не найден." });
      return;
    }
    res.json(UpdatePayrollRegisterResponse.parse(register));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Для этой даты и подразделения уже есть другой реестр." });
      return;
    }
    next(error);
  }
});

router.post("/economic/payroll-registers/:id/send", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (!writeAllowed(access, res)) return;
    const params = SendPayrollRegisterParams.safeParse(req.params);
    const parsed = SendPayrollRegisterBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!Number.isSafeInteger(parsed.data.version)) {
      res.status(400).json({ error: "Некорректная версия реестра." });
      return;
    }
    const result = await db.transaction(async (tx: Tx) => {
      const [current] = await tx.select().from(payrollRegistersTable)
        .where(eq(payrollRegistersTable.id, params.data.id)).for("update");
      if (!current) return { error: "Реестр не найден.", status: 404 as const };
      if (current.status !== "draft") return { error: "Реестр уже отправлен экономисту.", status: 409 as const };
      if (current.version !== parsed.data.version) return { error: "Реестр изменился. Обновите список перед отправкой.", status: 409 as const };
      const [firstItem] = await tx.select({ id: payrollRegisterItemsTable.id })
        .from(payrollRegisterItemsTable)
        .where(eq(payrollRegisterItemsTable.registerId, current.id))
        .limit(1);
      if (!firstItem) return { error: "Добавьте начисления перед отправкой.", status: 409 as const };
      const submittedAt = new Date();
      await tx.update(payrollRegistersTable).set({
        status: "sent_to_economist",
        submittedByName: actor(access),
        submittedAt,
        version: current.version + 1,
        updatedAt: submittedAt,
      }).where(eq(payrollRegistersTable.id, current.id));
      await tx.insert(activityTable).values({
        action: "Зарплатный реестр отправлен экономисту",
        templateName: `${current.unit} · ${current.workDate} · ${Number(current.totalAmount).toLocaleString("ru-RU")} ₸`,
        userName: actor(access),
      });
      return { id: current.id };
    });
    if ("error" in result) {
      res.status(result.status ?? 500).json({ error: result.error });
      return;
    }
    const register = await loadRegister(result.id);
    if (!register) {
      res.status(404).json({ error: "Реестр отправлен, но не найден." });
      return;
    }
    res.json(SendPayrollRegisterResponse.parse(register));
  } catch (error) {
    next(error);
  }
});

export default router;
