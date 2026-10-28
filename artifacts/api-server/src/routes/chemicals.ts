import { Router, type IRouter, type RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db, chemicalInvoicesTable as invoices, chemicalBatchesTable as batches, chemicalIssuesTable as issues,
  agroFieldsTable, fieldSeasonsTable, fieldOperationsTable, activityTable, chemicalConsumptionsTable,
} from "@workspace/db";
import { CreateChemicalInvoiceBody, CreateChemicalIssueBody, GetChemicalWarehouseResponse,
  CreateChemicalRequestBody, CreateChemicalConsumptionBody, CreateChemicalContainerReturnBody, UpdateChemicalBatchPackagingBody } from "@workspace/api-zod";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { grainBusinessDate, validGrainDate } from "../lib/grain-ledger";
import { isSeedingOperation } from "../lib/daily-seeding";
import { ChemicalError, chemicalCheck as check, scaledChemical, chemicalReceiptValue, chemicalCostPerHa, chemicalFieldCosts } from "../lib/chemical-stock";
import { chemicalWorkflow, requestChemical, issueRequestedChemical, consumeChemical } from "../lib/chemical-workflow";
import { chemicalPackaging, setChemicalPackaging, acceptChemicalContainers } from "../lib/chemical-containers";

const router: IRouter = Router();
const readers = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"];
export const chemicalWriters = ["grain_manager", "general_director"];
const guard = (allowed: string[]): RequestHandler => (_req, res, next) => {
  if (!allowed.includes((res.locals.access as RoleAccess).role ?? "")) {
    res.status(403).json({ error: "Приход и выдачу химии оформляет заведующий током или генеральный директор." }); return;
  }
  next();
};
const safe = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) {
    if (e instanceof ChemicalError) { res.status(e.status).json({ error: e.message }); return; }
    next(e);
  }
};
router.use("/agro/chemicals", requireApprovedRole, guard([...readers, "dispatcher"]));
const by = (access: RoleAccess) => `${access.displayName} · ${access.role}`;
function day(value: string) {
  check(validGrainDate(value) && value <= grainBusinessDate(), "Укажите корректную дату не позднее сегодняшней.");
}
const farms = ["АПК Арыстан Grain", "АФ Веденовка"];

router.get("/agro/chemicals", guard(readers), safe(async (_req, res): Promise<void> => {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    const batchRows = await tx.select({ batch: batches, invoice: invoices }).from(batches)
      .innerJoin(invoices, eq(batches.invoiceId, invoices.id));
    const seasonRows = await tx.select({ season: fieldSeasonsTable, field: agroFieldsTable }).from(fieldSeasonsTable)
      .innerJoin(agroFieldsTable, eq(fieldSeasonsTable.fieldId, agroFieldsTable.id));
    const operationRows = await tx.select().from(fieldOperationsTable);
    const issueRows = await tx.select().from(issues);
    const consumedRows = await tx.select({ consumption: chemicalConsumptionsTable, issue: issues })
      .from(chemicalConsumptionsTable).innerJoin(issues, eq(chemicalConsumptionsTable.issueId, issues.id));
    const seasonMap = new Map(seasonRows.map(row => [row.season.id, row]));
    const batchMap = new Map(batchRows.map(row => [row.batch.id, row]));
    const costs = chemicalFieldCosts(issueRows, consumedRows.map(row => row.consumption));
    const sowing = new Map<number, number>();
    for (const row of operationRows) {
      if (row.voidedAt || !row.actualStart || row.actualStart > grainBusinessDate()
        || !isSeedingOperation(row.actualOperationName || row.name)) continue;
      sowing.set(row.seasonId, (sowing.get(row.seasonId) ?? 0) + row.actualAreaAres);
    }
    return GetChemicalWarehouseResponse.parse({
      batches: batchRows.map(({ batch: b, invoice: inv }) => ({
        id: b.id, invoiceId: inv.id, invoiceNumber: inv.number, occurredOn: inv.occurredOn,
        supplier: inv.supplier, farm: inv.farm, name: b.name, unit: b.unit,
        quantity: b.receivedMillis / 1000, remaining: b.remainingMillis / 1000,
        unitPrice: Number(b.unitPriceCents) / 100, remainingAmount: Number(b.remainingCents) / 100,
        containerVolume: b.containerVolumeMillis === null ? null : b.containerVolumeMillis / 1000,
        containerCount: b.containerCount,
      })).sort((a, b) => b.id - a.id),
      fields: seasonRows.map(({ season: s, field: f }) => {
        // A repeatedly sown hectare remains one hectare of land, not additional acreage.
        const sown = Math.min(s.areaAres, sowing.get(s.id) ?? 0);
        const cents = costs.get(s.id) ?? 0;
        return { seasonId: s.id, fieldId: f.id, fieldNumber: f.number, farm: f.unit, year: s.year,
          cropName: s.cropName, sownAreaHa: sown / 100, chemicalAmount: cents / 100,
          costPerHa: chemicalCostPerHa(cents, sown) };
      }),
      issues: issueRows.map(row => {
        const source = batchMap.get(row.batchId)!;
        const target = seasonMap.get(row.seasonId)!;
        return { id: row.id, batchId: row.batchId, name: source.batch.name, unit: source.batch.unit,
          farm: source.invoice.farm, invoiceNumber: source.invoice.number, seasonId: row.seasonId,
          fieldNumber: target.field.number, year: target.season.year, employeeId: row.employeeId,
          employeeName: row.employeeName, chemicalRequestId: row.chemicalRequestId, quantity: row.quantityMillis / 1000,
          amount: Number(row.amountCents) / 100, occurredOn: row.occurredOn, notes: row.notes, createdBy: row.createdBy };
      }).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id),
    });
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(result);
}));

router.post("/agro/chemicals/invoices", guard(chemicalWriters), safe(async (req, res): Promise<void> => {
  const parsed = CreateChemicalInvoiceBody.safeParse(req.body);
  check(parsed.success, "Проверьте реквизиты накладной и позиции химии.");
  const input = parsed.data;
  day(input.occurredOn);
  check(input.number.trim() && input.supplier.trim() && farms.includes(input.farm), "Укажите номер накладной, поставщика и хозяйство.");
  const prepared = input.lines.map(line => {
    check(line.name.trim(), "Укажите название химии.");
    const quantity = scaledChemical(line.quantity, 1000, "количество — до 3 знаков");
    const price = scaledChemical(line.unitPrice, 100, "цена — до 2 знаков");
    check(quantity > 0 && quantity <= 1_000_000_000 && price >= 0 && price <= 1_000_000_000, "Недопустимые количество или цена.");
    const cents = chemicalReceiptValue(quantity, price);
    check(cents <= 1_000_000_000_000, "Сумма позиции слишком велика.");
    return { ...chemicalPackaging(line, quantity), name: line.name.trim(), unit: line.unit, receivedMillis: quantity, remainingMillis: quantity,
      unitPriceCents: String(price), receivedCents: String(cents), remainingCents: String(cents) };
  });
  const actor = by(res.locals.access);
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(718392009)`);
    const [existing] = await tx.select().from(invoices).where(eq(invoices.requestId, input.requestId));
    if (existing) return { id: existing.id };
    const [duplicate] = await tx.select().from(invoices).where(and(
      eq(invoices.number, input.number.trim()), eq(invoices.supplier, input.supplier.trim()),
      eq(invoices.farm, input.farm), eq(invoices.occurredOn, input.occurredOn),
    ));
    check(!duplicate, "Такая накладная поставщика уже оприходована в этом хозяйстве.", 409);
    const [created] = await tx.insert(invoices).values({
      requestId: input.requestId, number: input.number.trim(), occurredOn: input.occurredOn,
      supplier: input.supplier.trim(), farm: input.farm, createdBy: actor,
    }).returning();
    await tx.insert(batches).values(prepared.map(line => ({ ...line, invoiceId: created.id })));
    await tx.insert(activityTable).values({ action: "Оприходована химия", templateName: `Накладная ${created.number}`, userName: actor });
    return { id: created.id };
  });
  res.status(201).json(result);
}));

router.post("/agro/chemicals/issues", guard(chemicalWriters), safe(async (req, res): Promise<void> => {
  const parsed = CreateChemicalIssueBody.safeParse(req.body);
  check(parsed.success, "Выдача возможна только по заявке агронома. Выберите заявку и количество.");
  const result = await db.transaction(tx => issueRequestedChemical(tx, parsed.data, res.locals.access));
  res.status(201).json(result);
}));

router.get("/agro/chemicals/workflow", safe(async (_req, res): Promise<void> => {
  const result = await db.transaction(async tx => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    return chemicalWorkflow(tx, res.locals.access);
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(result);
}));
router.post("/agro/chemicals/requests", guard(["agronomist", "general_director"]), safe(async (req, res): Promise<void> => {
  const parsed = CreateChemicalRequestBody.safeParse(req.body);
  check(parsed.success, "Выберите плановую операцию, химию и количество.");
  res.status(201).json(await db.transaction(tx => requestChemical(tx, parsed.data, res.locals.access)));
}));
router.post("/agro/chemicals/consumptions", guard(["dispatcher", "general_director"]), safe(async (req, res): Promise<void> => {
  const parsed = CreateChemicalConsumptionBody.safeParse(req.body);
  check(parsed.success, "Выберите принятую заведующим током пустую тару для подтверждения расхода.");
  res.status(201).json(await db.transaction(tx => consumeChemical(tx, parsed.data, res.locals.access)));
}));
router.post("/agro/chemicals/container-returns", guard(chemicalWriters), safe(async (req, res): Promise<void> => {
  const parsed = CreateChemicalContainerReturnBody.safeParse(req.body);
  check(parsed.success, "Выберите выдачу, день работы, дату возврата и целое количество пустой тары.");
  res.status(201).json(await db.transaction(tx => acceptChemicalContainers(tx, parsed.data, res.locals.access)));
}));
router.put("/agro/chemicals/batches/:id/packaging", guard(chemicalWriters), safe(async (req, res): Promise<void> => {
  const parsed = UpdateChemicalBatchPackagingBody.safeParse(req.body);
  check(parsed.success, "Укажите объём одной упаковки и целое количество упаковок в исходной партии.");
  const id = Number(req.params.id);
  res.json(await db.transaction(tx => setChemicalPackaging(tx, id, parsed.data, res.locals.access)));
}));

export default router;
