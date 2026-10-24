import { createHash } from "node:crypto";
import { and, asc, desc, eq, ne, inArray, isNull } from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  CreatePayrollRegisterBody,
  CreatePayrollRegisterResponse,
  ListPayrollAccrualsResponse,
  ListPayrollRegistersResponse,
  SendDailyPayrollRegisterBody,
  SendDailyPayrollRegisterResponse,
  SendPayrollRegisterBody,
  SendPayrollRegisterParams,
  SendPayrollRegisterResponse,
  UpdatePayrollRegisterBody,
  UpdatePayrollRegisterParams,
  UpdatePayrollRegisterResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  agroFieldsTable,
  db,
  employeesTable,
  fieldOperationProgressTable,
  fieldOperationsTable,
  fieldSeasonsTable,
  grainCropsTable,
  grainLocationsTable,
  grainMovementsTable,
  payrollRegisterItemsTable,
  payrollRegistersTable,
} from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";

const router: IRouter = Router();
const readerRoles = new Set(["dispatcher", "economist", "general_director"]);
const editorRoles = new Set(["dispatcher", "general_director"]);
const accrualReaderRoles = new Set(["dispatcher", "general_director"]);
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
router.use("/economic/payroll-accruals", requireApprovedRole, (req, res, next) => {
  const access = res.locals.access as RoleAccess;
  if (!access.role || !accrualReaderRoles.has(access.role)) {
    res.status(403).json({ error: "Автоматические начисления доступны диспетчеру и генеральному директору." });
    return;
  }
  next();
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LineInput = { employeeName: string; workType: string; details: string; amountKzt: number };
type PayrollSourceType = "grain_trip" | "field_progress" | "field_operation";
type AutomaticEntry = {
  sourceType: PayrollSourceType;
  sourceId: number;
  employeeId: number;
  employeeName: string;
  workType: string;
  details: string;
  amountKzt: number;
};
type UnassignedSource = {
  sourceType: PayrollSourceType;
  sourceId: number;
  employeeName: string;
  workType: string;
  details: string;
};
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
  employeeId: null,
  employeeName: entry.employeeName.trim(),
  workType: entry.workType.trim(),
  details: entry.details.trim(),
  amountKzt: cents(entry.amountKzt).toFixed(2),
  sourceType: "manual",
  sourceId: null,
}));

const employeeNameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
const payrollOperationLabels: Record<string, string> = {
  receipt: "Доставка зерна с поля",
  transfer: "Перевозка между складами",
  drying: "Доставка на зерносушилку",
  cleaning: "Доставка на зерноочистку",
};

async function calculateAutomaticAccruals(tx: Tx) {
  const [movements, crops, locations, employees, fieldRows, progressRows] = await Promise.all([
    tx.select().from(grainMovementsTable).where(and(
      eq(grainMovementsTable.approvalStatus, "approved"),
      isNull(grainMovementsTable.voidedAt),
    )),
    tx.select().from(grainCropsTable),
    tx.select().from(grainLocationsTable),
    tx.select().from(employeesTable),
    tx.select({
      operation: fieldOperationsTable,
      season: fieldSeasonsTable,
      field: agroFieldsTable,
    }).from(fieldOperationsTable)
      .innerJoin(fieldSeasonsTable, eq(fieldOperationsTable.seasonId, fieldSeasonsTable.id))
      .innerJoin(agroFieldsTable, eq(fieldSeasonsTable.fieldId, agroFieldsTable.id))
      .where(isNull(fieldOperationsTable.voidedAt)),
    tx.select().from(fieldOperationProgressTable).orderBy(asc(fieldOperationProgressTable.reportDate), asc(fieldOperationProgressTable.id)),
  ]);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const employeesByName = new Map<string, typeof employees>();
  for (const employee of employees) {
    const key = employeeNameKey(employee.fullName);
    const matches = employeesByName.get(key) ?? [];
    matches.push(employee);
    employeesByName.set(key, matches);
  }
  const cropById = new Map(crops.map((crop) => [crop.id, crop.name]));
  const locationById = new Map(locations.map((location) => [location.id, location.name]));
  const progressByOperation = new Map<number, typeof progressRows>();
  for (const progress of progressRows) {
    const rows = progressByOperation.get(progress.operationId) ?? [];
    rows.push(progress);
    progressByOperation.set(progress.operationId, rows);
  }
  const groups = new Map<string, {
    workDate: string;
    unit: string;
    entries: AutomaticEntry[];
    unassignedSources: UnassignedSource[];
  }>();
  const groupFor = (workDate: string, unit: string) => {
    const key = `${workDate}\u0000${unit}`;
    let group = groups.get(key);
    if (!group) {
      group = { workDate, unit, entries: [], unassignedSources: [] };
      groups.set(key, group);
    }
    return group;
  };
  const employeeFor = (id: number | null, name: string) => {
    if (id !== null) return employeeById.get(id) ?? null;
    const matches = employeesByName.get(employeeNameKey(name)) ?? [];
    return matches.length === 1 ? matches[0] : null;
  };
  const addSource = (source: {
    workDate: string;
    unit: string;
    sourceType: PayrollSourceType;
    sourceId: number;
    employeeId: number | null;
    employeeName: string;
    workType: string;
    details: string;
    amountKzt: number;
  }) => {
    const group = groupFor(source.workDate, source.unit);
    const employee = employeeFor(source.employeeId, source.employeeName);
    if (!employee) {
      group.unassignedSources.push({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        employeeName: source.employeeName,
        workType: source.workType,
        details: source.details,
      });
      return;
    }
    group.entries.push({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      employeeId: employee.id,
      employeeName: employee.fullName,
      workType: source.workType,
      details: source.details,
      amountKzt: cents(source.amountKzt),
    });
  };

  for (const movement of movements) {
    if (!["receipt", "transfer", "drying", "cleaning"].includes(movement.operation)) continue;
    if (movement.transportRate === null) continue;
    const crop = cropById.get(movement.cropId) ?? "зерно";
    const from = movement.fromLocationId === null ? "" : locationById.get(movement.fromLocationId) ?? "";
    const to = movement.toLocationId === null ? "" : locationById.get(movement.toLocationId) ?? "";
    const route = [from, to].filter(Boolean).join(" → ");
    const details = [
      movement.truckNumber ? `КамАЗ ${movement.truckNumber}` : "",
      crop,
      movement.fieldName ? `Поле ${movement.fieldName}` : "",
      route,
    ].filter(Boolean).join(" · ").slice(0, 500);
    addSource({
      workDate: movement.occurredOn,
      unit: movement.unit,
      sourceType: "grain_trip",
      sourceId: movement.id,
      employeeId: movement.driverEmployeeId,
      employeeName: movement.driverName,
      workType: payrollOperationLabels[movement.operation] ?? "Перевозка зерна",
      details,
      amountKzt: Number(movement.transportRate),
    });
  }

  for (const row of fieldRows) {
    const operation = row.operation;
    if (operation.actualRatePerHa === null) continue;
    const rate = Number(operation.actualRatePerHa);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const workType = `Полевые работы · ${operation.actualOperationName || operation.name}`;
    const reports = progressByOperation.get(operation.id) ?? [];
    const detailsFor = (areaAres: number, equipment: string) => [
      `Поле №${row.field.number}`,
      row.season.cropName,
      `${(areaAres / 100).toLocaleString("ru-RU")} га`,
      equipment ? `Техника ${equipment}` : "",
    ].filter(Boolean).join(" · ").slice(0, 500);
    if (reports.length > 0) {
      let previousCumulativeAres = 0;
      for (const report of reports) {
        const dailyAreaAres = report.cumulativeAreaAres - previousCumulativeAres;
        previousCumulativeAres = report.cumulativeAreaAres;
        if (dailyAreaAres <= 0) continue;
        addSource({
          workDate: report.reportDate,
          unit: row.field.unit,
          sourceType: "field_progress",
          sourceId: report.id,
          employeeId: report.actualMechanicEmployeeId ?? operation.actualMechanicEmployeeId,
          employeeName: report.actualMechanic || operation.actualMechanic,
          workType,
          details: detailsFor(dailyAreaAres, report.actualEquipment || operation.actualEquipment),
          amountKzt: cents((dailyAreaAres / 100) * rate),
        });
      }
    } else if (operation.actualEnd && operation.actualAreaAres > 0) {
      addSource({
        workDate: operation.actualEnd,
        unit: row.field.unit,
        sourceType: "field_operation",
        sourceId: operation.id,
        employeeId: operation.actualMechanicEmployeeId,
        employeeName: operation.actualMechanic,
        workType,
        details: detailsFor(operation.actualAreaAres, operation.actualEquipment),
        amountKzt: cents((operation.actualAreaAres / 100) * rate),
      });
    }
  }

  const [sentRegisters, savedItems] = await Promise.all([
    tx.select({ id: payrollRegistersTable.id, workDate: payrollRegistersTable.workDate, unit: payrollRegistersTable.unit })
      .from(payrollRegistersTable)
      .where(eq(payrollRegistersTable.status, "sent_to_economist")),
    tx.select({
      registerId: payrollRegisterItemsTable.registerId,
      sourceType: payrollRegisterItemsTable.sourceType,
      sourceId: payrollRegisterItemsTable.sourceId,
    }).from(payrollRegisterItemsTable),
  ]);
  const sentKeys = new Set(sentRegisters.map((register) => `${register.workDate}\u0000${register.unit}`));
  const existingSources = new Set(savedItems
    .filter((item) => item.sourceId !== null)
    .map((item) => `${item.sourceType}\u0000${item.sourceId}`));
  return [...groups.values()]
    .filter((group) => !sentKeys.has(`${group.workDate}\u0000${group.unit}`))
    .map((group) => {
      const entries = group.entries
        .filter((entry) => !existingSources.has(`${entry.sourceType}\u0000${entry.sourceId}`))
        .sort((a, b) => a.sourceType.localeCompare(b.sourceType) || a.sourceId - b.sourceId);
      const unassignedSources = group.unassignedSources
        .filter((source) => !existingSources.has(`${source.sourceType}\u0000${source.sourceId}`))
        .sort((a, b) => a.sourceType.localeCompare(b.sourceType) || a.sourceId - b.sourceId);
      const totalCents = entries.reduce((sum, entry) => sum + Math.round(entry.amountKzt * 100), 0);
      const snapshot = {
        workDate: group.workDate,
        unit: group.unit,
        entries,
        unassignedSources,
      };
      return {
        ...group,
        entries,
        unassignedSources,
        unassignedCount: unassignedSources.length,
        totalAmount: cents(totalCents / 100),
        sourceHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
      };
    })
    .filter((group) => group.entries.length > 0 || group.unassignedSources.length > 0)
    .sort((a, b) => b.workDate.localeCompare(a.workDate) || a.unit.localeCompare(b.unit));
}

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
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      workType: item.workType,
      details: item.details,
      amountKzt: Number(item.amountKzt),
      sourceType: item.sourceType,
      sourceId: item.sourceId,
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

router.get("/economic/payroll-accruals", async (_req, res, next): Promise<void> => {
  try {
    const days = await db.transaction((tx) => calculateAutomaticAccruals(tx), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(ListPayrollAccrualsResponse.parse(days));
  } catch (error) {
    next(error);
  }
});

router.post("/economic/payroll-registers/send-daily", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (!writeAllowed(access, res)) return;
    const parsed = SendDailyPayrollRegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    if (!validDate(input.workDate) || !input.unit.trim()) {
      res.status(400).json({ error: "Укажите корректную дату и подразделение." });
      return;
    }
    const result = await db.transaction(async (tx: Tx) => {
      const day = (await calculateAutomaticAccruals(tx))
        .find((candidate) => candidate.workDate === input.workDate && candidate.unit === input.unit.trim());
      if (!day || day.entries.length === 0) {
        return { error: "За этот день нет начислений для отправки.", status: 409 as const };
      }
      if (day.unassignedCount > 0) {
        return { error: `Сначала выберите сотрудника для всех начислений без привязки (${day.unassignedCount}).`, status: 409 as const };
      }
      if (day.sourceHash !== input.sourceHash) {
        return { error: "Исходные данные изменились. Обновите реестр и проверьте суммы перед отправкой.", status: 409 as const };
      }
      if (day.totalAmount > maxRegisterAmount) {
        return { error: "Общая сумма реестра превышает допустимый предел.", status: 400 as const };
      }
      const [existing] = await tx.select({ id: payrollRegistersTable.id, status: payrollRegistersTable.status })
        .from(payrollRegistersTable)
        .where(and(
          eq(payrollRegistersTable.workDate, day.workDate),
          eq(payrollRegistersTable.unit, day.unit),
        )).for("update");
      if (existing) {
        return { error: "Реестр за эту дату и подразделение уже существует.", status: 409 as const };
      }
      const submittedAt = new Date();
      const [register] = await tx.insert(payrollRegistersTable).values({
        workDate: day.workDate,
        unit: day.unit,
        status: "sent_to_economist",
        totalAmount: day.totalAmount.toFixed(2),
        version: 1,
        createdByUserId: access.userId,
        createdByName: actor(access),
        submittedByName: actor(access),
        submittedAt,
      }).returning();
      await tx.insert(payrollRegisterItemsTable).values(day.entries.map((entry) => ({
        registerId: register.id,
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        workType: entry.workType,
        details: entry.details,
        amountKzt: entry.amountKzt.toFixed(2),
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
      })));
      await tx.insert(activityTable).values({
        action: "Автоматический зарплатный реестр отправлен экономисту",
        templateName: `${day.unit} · ${day.workDate} · ${day.totalAmount.toLocaleString("ru-RU")} ₸`,
        userName: actor(access),
      });
      return { id: register.id };
    }, { isolationLevel: "repeatable read" });
    if ("error" in result) {
      res.status(result.status ?? 500).json({ error: result.error });
      return;
    }
    const register = await loadRegister(result.id);
    if (!register) {
      res.status(404).json({ error: "Реестр отправлен, но не найден." });
      return;
    }
    res.status(201).json(SendDailyPayrollRegisterResponse.parse(register));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Реестр за эту дату и подразделение уже существует." });
      return;
    }
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
