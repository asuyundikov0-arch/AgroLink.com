import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { CreateTokPayrollEntryBody, UpdateTokPayrollEntryBody, ListTokPayrollEntriesResponse, CreateTokPayrollEntryResponse, UpdateTokPayrollEntryResponse } from "@workspace/api-zod";
import { activityTable, db, employeesTable, payrollRegisterItemsTable, tokPayrollEntriesTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { lockPayrollSources } from "../lib/payroll-source-guard";
import { calculateTokPay } from "../lib/tok-payroll";

const router: IRouter = Router();
router.use("/agro/tok-payroll", requireApprovedRole, (_req, res, next) => {
  if (!["grain_manager", "general_director"].includes((res.locals.access as RoleAccess).role ?? "")) {
    res.status(403).json({ error: "Расчёт зарплаты тока доступен заведующему током и генеральному директору." }); return;
  }
  next();
});
type Row = typeof tokPayrollEntriesTable.$inferSelect;
const json = (row: Row, locked = false) => ({
  ...row, quantity: Number(row.quantity), rateKzt: Number(row.rateKzt), amountKzt: Number(row.amountKzt),
  createdAt: row.createdAt.toISOString(), locked,
});

router.get("/agro/tok-payroll/entries", async (_req, res, next) => {
  try {
    const rows = await db.select({ entry: tokPayrollEntriesTable, locked: sql<boolean>`${payrollRegisterItemsTable.id} is not null` })
      .from(tokPayrollEntriesTable).leftJoin(payrollRegisterItemsTable, and(
        eq(payrollRegisterItemsTable.sourceType, "tok_work"),
        eq(payrollRegisterItemsTable.sourceId, tokPayrollEntriesTable.id),
      )).orderBy(desc(tokPayrollEntriesTable.workDate), desc(tokPayrollEntriesTable.id));
    res.setHeader("Cache-Control", "no-store");
    res.json(ListTokPayrollEntriesResponse.parse(rows.map(row => json(row.entry, row.locked))));
  } catch (error) { next(error); }
});

for (const method of ["post", "patch"] as const) {
  router[method](method === "post" ? "/agro/tok-payroll/entries" : "/agro/tok-payroll/entries/:id", async (req, res, next) => {
    try {
      const parsed = method === "post" ? CreateTokPayrollEntryBody.safeParse(req.body) : UpdateTokPayrollEntryBody.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: "Проверьте сотрудника, дату, вид работы, количество и расценку." }); return; }
      const input = parsed.data;
      const id = Number((req.params as { id?: string }).id);
      const version = "version" in input ? input.version : null;
      const requestId = "requestId" in input ? input.requestId : null;
      if (!Number.isSafeInteger(input.employeeId) || !input.unit.trim() || input.workType.trim().length < 2
        || !/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)
        || Number.isNaN(new Date(`${input.workDate}T00:00:00Z`).getTime())
        || new Date(`${input.workDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.workDate
        || (method === "patch" && (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(version)))
        || (requestId !== null && !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(requestId))) {
        res.status(400).json({ error: "Проверьте дату, сотрудника, версию и обязательные поля." }); return;
      }
      let amountKzt: string;
      try { amountKzt = calculateTokPay(input.payBasis, input.quantity, input.rateKzt); }
      catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
      const access = res.locals.access as RoleAccess;
      const actor = `${access.displayName} · ${access.role}`;
      const result = await db.transaction(async tx => {
        await lockPayrollSources(tx);
        const [employee] = await tx.select().from(employeesTable).where(eq(employeesTable.id, input.employeeId));
        if (!employee?.isActive) return { error: "Выберите действующего сотрудника из справочника.", status: 400 };
        const values = {
          workDate: input.workDate, unit: input.unit.trim(), employeeId: employee.id, employeeName: employee.fullName,
          workType: input.workType.trim(), payBasis: input.payBasis, quantity: input.quantity.toFixed(3),
          rateKzt: input.rateKzt.toFixed(2), amountKzt, notes: (input.notes ?? "").trim(),
        };
        let row: Row;
        if (method === "post") {
          const [existing] = await tx.select().from(tokPayrollEntriesTable).where(eq(tokPayrollEntriesTable.requestId, requestId!));
          if (existing) {
            if (existing.createdByUserId !== access.userId || Object.entries(values).some(([key, value]) => existing[key as keyof Row] !== value)) {
              return { error: "Этот запрос уже использован. Обновите список начислений.", status: 409 };
            }
            const [saved] = await tx.select({ id: payrollRegisterItemsTable.id }).from(payrollRegisterItemsTable)
              .where(and(eq(payrollRegisterItemsTable.sourceType, "tok_work"), eq(payrollRegisterItemsTable.sourceId, existing.id)));
            return { row: existing, locked: Boolean(saved) };
          }
          [row] = await tx.insert(tokPayrollEntriesTable).values({
            ...values, requestId: requestId!, createdByUserId: access.userId, createdByName: actor,
          }).returning();
        } else {
          const [current] = await tx.select().from(tokPayrollEntriesTable).where(eq(tokPayrollEntriesTable.id, id)).for("update");
          if (!current) return { error: "Начисление не найдено.", status: 404 };
          const [saved] = await tx.select({ id: payrollRegisterItemsTable.id }).from(payrollRegisterItemsTable)
            .where(and(eq(payrollRegisterItemsTable.sourceType, "tok_work"), eq(payrollRegisterItemsTable.sourceId, id)));
          if (saved) return { error: "Начисление уже отправлено в кадры. Изменять его нельзя.", status: 409 };
          if (current.version !== version) return { error: "Начисление изменилось. Обновите список.", status: 409 };
          [row] = await tx.update(tokPayrollEntriesTable).set({ ...values, version: current.version + 1 })
            .where(eq(tokPayrollEntriesTable.id, id)).returning();
        }
        await tx.insert(activityTable).values({ action: method === "post" ? "Создано начисление сотруднику тока" : "Изменено начисление сотруднику тока",
          templateName: `${values.unit} · ${values.workDate} · ${values.workType} · ${amountKzt} ₸`, userName: actor });
        return { row, locked: false };
      });
      if ("error" in result) { res.status(result.status ?? 500).json({ error: result.error }); return; }
      res.status(method === "post" ? 201 : 200).json((method === "post" ? CreateTokPayrollEntryResponse : UpdateTokPayrollEntryResponse).parse(json(result.row, result.locked)));
    } catch (error) { next(error); }
  });
}
export default router;
