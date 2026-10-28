import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import { activityTable, db, financialEntriesTable, type FinancialEntry } from "@workspace/db";
import {
  CreateFinancialEntryBody, CreateFinancialEntryResponse, UpdateFinancialEntryBody,
  CompleteFinancialEntryBody, VoidFinancialEntryBody, ListFinancialEntriesQueryParams,
  ListFinancialEntriesResponse,
} from "@workspace/api-zod";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { grainBusinessDate } from "../lib/grain-ledger";
import { loadPaymentRegister } from "./spare-part-requests";

const router: IRouter = Router();
export const financialAccessGuard: RequestHandler = (_req, res, next) => {
  const role = (res.locals.access as RoleAccess).role;
  if (role !== "economist" && role !== "general_director") {
    res.status(403).json({ error: "Экономический блок доступен экономисту и генеральному директору." });
    return;
  }
  next();
};
router.use("/economic/financial-entries", requireApprovedRole, financialAccessGuard);
type Fields = Omit<typeof CreateFinancialEntryBody._type, "clientRequestId">;
const actor = (access: RoleAccess) => access.displayName || access.email || access.userId;
const positiveId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const fields = (input: Fields) => ({
  book: input.book, basis: input.basis, direction: input.direction, date: input.date,
  unit: input.unit.trim(), category: input.category.trim(), counterparty: input.counterparty.trim(),
  description: input.description.trim(), amountKzt: input.amountKzt.toFixed(2),
});
function validFields(input: Fields): string | null {
  if (!input.unit.trim() || !input.category.trim()) return "Укажите хозяйство и статью.";
  if (input.book === "budget" && input.direction !== "expense") return "В производственном бюджете учитываются только затраты.";
  const parsedDate = new Date(`${input.date}T12:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.date || input.date < "2000-01-01" || input.date > "2100-12-31") return "Укажите существующую дату с 2000 по 2100 год.";
  if (input.basis === "actual" && input.date > grainBusinessDate()) return "Факт нельзя вносить будущей датой. Для будущего периода используйте план.";
  if (!Number.isFinite(input.amountKzt) || Number(input.amountKzt.toFixed(2)) !== input.amountKzt) return "У суммы должно быть не больше двух знаков после запятой.";
  return null;
}
function serialize(row: FinancialEntry) {
  return CreateFinancialEntryResponse.parse({
    id: row.id, book: row.book, basis: row.basis, direction: row.direction, date: row.date,
    unit: row.unit, category: row.category, counterparty: row.counterparty, description: row.description,
    amountKzt: Number(row.amountKzt), status: row.status, version: row.version, source: "manual",
    createdBy: row.createdBy, updatedBy: row.updatedBy, completedBy: row.completedBy,
    completedAt: row.completedAt?.toISOString() ?? null, voidReason: row.voidReason,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  });
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FinancialResult = { row: FinancialEntry } | { error: string; status: number };
async function audit(tx: Tx, action: string, access: RoleAccess, before: FinancialEntry | null, after: FinancialEntry) {
  await tx.insert(activityTable).values({
    action, templateName: JSON.stringify({ before: before ? serialize(before) : null, after: serialize(after) }),
    userName: actor(access),
  });
}

router.get("/economic/financial-entries", async (req, res, next): Promise<void> => {
  try {
    const parsed = ListFinancialEntriesQueryParams.safeParse(req.query);
    if (!parsed.success || !Number.isSafeInteger(parsed.data.year)) {
      res.status(400).json({ error: "Выберите год с 2000 по 2100." }); return;
    }
    const year = parsed.data.year;
    const rows = await db.select().from(financialEntriesTable).where(and(
      gte(financialEntriesTable.date, `${year}-01-01`), lte(financialEntriesTable.date, `${year}-12-31`),
    )).orderBy(desc(financialEntriesTable.date), desc(financialEntriesTable.id));
    // Paid approved spare-part items are projected, NOT copied into a second writable ledger.
    const paid = (await loadPaymentRegister()).filter((item) => item.paymentStatus === "paid" && item.paidAt)
      .map((item) => ({
        id: -item.id, book: "cash_flow", basis: "actual", direction: "expense",
        date: grainBusinessDate(new Date(item.paidAt!)), unit: item.department || "Общие",
        category: "Запчасти", counterparty: "", description: `${item.requestCode} · ${item.name} · ${item.fleetKind} ${item.registrationNumber ?? ""}`,
        amountKzt: item.amount, status: "completed", version: 0, source: "spare_part",
        createdBy: item.requesterName, updatedBy: item.paidByName, completedBy: item.paidByName,
        completedAt: item.paidAt, voidReason: "", createdAt: item.submittedAt, updatedAt: item.paidAt!,
      })).filter((item) => item.date.startsWith(String(year)));
    res.setHeader("Cache-Control", "no-store");
    res.json(ListFinancialEntriesResponse.parse([...rows.map(serialize), ...paid]));
  } catch (error) { next(error); }
});

router.post("/economic/financial-entries", async (req, res, next): Promise<void> => {
  try {
    const parsed = CreateFinancialEntryBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Проверьте обязательные поля и сумму записи." }); return; }
    const input = parsed.data;
    const invalid = validFields(input);
    if (invalid || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.clientRequestId)) {
      res.status(400).json({ error: invalid ?? "Некорректный идентификатор сохранения." }); return;
    }
    const access = res.locals.access as RoleAccess;
    const values = fields(input);
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.insert(financialEntriesTable).values({
        ...values, clientRequestId: input.clientRequestId,
        status: input.book === "cash_flow" && input.basis === "actual" ? "pending" : "recorded",
        createdByUserId: access.userId, createdBy: actor(access), updatedBy: actor(access),
      }).onConflictDoNothing({ target: financialEntriesTable.clientRequestId }).returning();
      if (row) { await audit(tx, "Добавлена финансовая запись", access, null, row); return row; }
      const [existing] = await tx.select().from(financialEntriesTable).where(eq(financialEntriesTable.clientRequestId, input.clientRequestId));
      if (!existing || existing.createdByUserId !== access.userId
        || Object.entries(values).some(([key, value]) => existing[key as keyof FinancialEntry] !== value)) return null;
      return existing;
    });
    if (!result) { res.status(409).json({ error: "Этот запрос уже сохранён с другими сведениями. Обновите список перед повторным вводом." }); return; }
    res.status(201).json(serialize(result));
  } catch (error) { next(error); }
});

router.patch("/economic/financial-entries/:id", async (req, res, next): Promise<void> => {
  try {
    const parsed = UpdateFinancialEntryBody.safeParse(req.body);
    if (!positiveId(req.params.id) || !parsed.success || !positiveId(parsed.data.version)) {
      res.status(400).json({ error: "Проверьте запись и её версию." }); return;
    }
    const invalid = validFields(parsed.data);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    const access = res.locals.access as RoleAccess;
    const result = await db.transaction<FinancialResult>(async (tx) => {
      const [existing] = await tx.select().from(financialEntriesTable).where(eq(financialEntriesTable.id, Number(req.params.id))).for("update");
      if (!existing) return { error: "Запись не найдена.", status: 404 } as const;
      if (existing.version !== parsed.data.version || ["voided", "completed"].includes(existing.status)) return { error: "Запись уже изменена, подтверждена или аннулирована. Обновите список.", status: 409 } as const;
      if (existing.book !== parsed.data.book || existing.basis !== parsed.data.basis || existing.direction !== parsed.data.direction) return { error: "Нельзя менять таблицу, план/факт и направление существующей записи.", status: 400 } as const;
      const [row] = await tx.update(financialEntriesTable).set({
        ...fields(parsed.data), version: existing.version + 1, updatedBy: actor(access), updatedAt: new Date(),
      }).where(eq(financialEntriesTable.id, existing.id)).returning();
      await audit(tx, "Изменена финансовая запись", access, existing, row);
      return { row };
    });
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
    res.json(serialize(result.row));
  } catch (error) { next(error); }
});

router.post("/economic/financial-entries/:id/complete", async (req, res, next): Promise<void> => {
  try {
    const parsed = CompleteFinancialEntryBody.safeParse(req.body);
    if (!positiveId(req.params.id) || !parsed.success || !positiveId(parsed.data.version)) {
      res.status(400).json({ error: "Проверьте запись и её версию." }); return;
    }
    const access = res.locals.access as RoleAccess;
    const result = await db.transaction<FinancialResult>(async (tx) => {
      const [existing] = await tx.select().from(financialEntriesTable).where(eq(financialEntriesTable.id, Number(req.params.id))).for("update");
      if (!existing) return { error: "Запись не найдена.", status: 404 } as const;
      if (existing.version !== parsed.data.version || existing.book !== "cash_flow" || existing.basis !== "actual" || existing.status !== "pending") return { error: "Подтвердить можно только актуальную ожидающую запись фактического движения денег.", status: 409 } as const;
      const now = new Date();
      const [row] = await tx.update(financialEntriesTable).set({
        status: "completed", version: existing.version + 1, completedBy: actor(access), completedAt: now,
        updatedBy: actor(access), updatedAt: now,
      }).where(eq(financialEntriesTable.id, existing.id)).returning();
      await audit(tx, "Подтверждено движение денег", access, existing, row);
      return { row };
    });
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
    res.json(serialize(result.row));
  } catch (error) { next(error); }
});

router.post("/economic/financial-entries/:id/void", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (access.role !== "general_director") { res.status(403).json({ error: "Аннулировать запись может только генеральный директор." }); return; }
    const parsed = VoidFinancialEntryBody.safeParse(req.body);
    if (!positiveId(req.params.id) || !parsed.success || !positiveId(parsed.data.version) || parsed.data.reason.trim().length < 3) {
      res.status(400).json({ error: "Укажите запись, версию и причину аннулирования." }); return;
    }
    const result = await db.transaction<FinancialResult>(async (tx) => {
      const [existing] = await tx.select().from(financialEntriesTable).where(eq(financialEntriesTable.id, Number(req.params.id))).for("update");
      if (!existing) return { error: "Запись не найдена.", status: 404 } as const;
      if (existing.version !== parsed.data.version || existing.status === "voided") return { error: "Запись уже изменена или аннулирована. Обновите список.", status: 409 } as const;
      const [row] = await tx.update(financialEntriesTable).set({
        status: "voided", version: existing.version + 1, voidReason: parsed.data.reason.trim(), updatedBy: actor(access), updatedAt: new Date(),
      }).where(eq(financialEntriesTable.id, existing.id)).returning();
      await audit(tx, "Аннулирована финансовая запись", access, existing, row);
      return { row };
    });
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
    res.json(serialize(result.row));
  } catch (error) { next(error); }
});
export default router;
