import { and, eq, isNotNull } from "drizzle-orm";
import {
  chemicalBatchesTable, chemicalConsumptionsTable, chemicalIssuesTable, db, fieldOperationsTable,
  fieldOperationProgressTable, fieldSeasonsTable, fuelMovementsTable, payrollRegisterItemsTable,
  payrollRegistersTable,
} from "@workspace/db";
import type { FieldCosts, FieldOperationCosts } from "@workspace/api-zod";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const addMoney = (a: number, b: number) => Math.round((a + b) * 100) / 100;
const addQuantity = (a: number, b: number) => Math.round((a + b) * 1000) / 1000;
const emptyTotals = () => ({ chemicalCost: 0, fuelCost: 0, salaryCost: 0, totalCost: 0, fuelLiters: 0 });

export async function fieldCosts(tx: Tx, seasonId: number): Promise<FieldCosts | null> {
  const [season] = await tx.select().from(fieldSeasonsTable).where(eq(fieldSeasonsTable.id, seasonId));
  if (!season) return null;
  const operations = await tx.select().from(fieldOperationsTable).where(eq(fieldOperationsTable.seasonId, seasonId));
  const result: FieldCosts = {
    ...emptyTotals(), seasonId, fieldId: season.fieldId, unallocatedChemicalCost: 0,
    operations: operations.map((o) => ({ ...emptyTotals(), operationId: o.id,
      name: o.actualOperationName || o.name, chemicals: [], fuels: [], salaries: [] })),
  };
  const byId = new Map<number, FieldOperationCosts>(result.operations.map((o) => [o.operationId, o]));
  const chemistry = await tx.select({ consumption: chemicalConsumptionsTable, batch: chemicalBatchesTable })
    .from(chemicalConsumptionsTable)
    .innerJoin(chemicalIssuesTable, eq(chemicalConsumptionsTable.issueId, chemicalIssuesTable.id))
    .innerJoin(chemicalBatchesTable, eq(chemicalIssuesTable.batchId, chemicalBatchesTable.id))
    .where(eq(chemicalIssuesTable.seasonId, seasonId));
  for (const { consumption, batch } of chemistry) {
    const op = byId.get(consumption.operationId);
    if (!op) continue;
    const amount = Number(consumption.amountCents) / 100;
    const line = op.chemicals.find((item) => item.batchId === batch.id);
    if (line) {
      line.quantity = addQuantity(line.quantity, consumption.quantityMillis / 1000);
      line.amount = addMoney(line.amount, amount);
    } else op.chemicals.push({ batchId: batch.id, name: batch.name, unit: batch.unit,
      quantity: consumption.quantityMillis / 1000, amount });
    op.chemicalCost = addMoney(op.chemicalCost, amount);
  }
  // Historical direct issues have no operation association; retain them in the field total only.
  const legacyIssues = await tx.select().from(chemicalIssuesTable).where(eq(chemicalIssuesTable.seasonId, seasonId));
  for (const issue of legacyIssues) {
    if (issue.chemicalRequestId === null) {
      result.unallocatedChemicalCost = addMoney(result.unallocatedChemicalCost, Number(issue.amountCents) / 100);
    }
  }
  const fuel = await tx.select({ movement: fuelMovementsTable }).from(fuelMovementsTable)
    .innerJoin(fieldOperationsTable, eq(fuelMovementsTable.operationId, fieldOperationsTable.id))
    .where(and(eq(fieldOperationsTable.seasonId, seasonId), eq(fuelMovementsTable.kind, "issue")));
  for (const { movement } of fuel) {
    const op = byId.get(movement.operationId!);
    if (!op) continue;
    const amount = Number(movement.amountCents) / 100;
    const liters = movement.quantityMillis / 1000;
    const line = op.fuels.find((item) => item.fuelType === movement.fuelType);
    if (line) { line.liters = addQuantity(line.liters, liters); line.amount = addMoney(line.amount, amount); }
    else op.fuels.push({ fuelType: movement.fuelType, liters, amount });
    op.fuelCost = addMoney(op.fuelCost, amount); op.fuelLiters = addQuantity(op.fuelLiters, liters);
  }
  const wages = await tx.select({ item: payrollRegisterItemsTable, register: payrollRegistersTable })
    .from(payrollRegisterItemsTable)
    .innerJoin(payrollRegistersTable, eq(payrollRegisterItemsTable.registerId, payrollRegistersTable.id))
    .where(and(eq(payrollRegistersTable.status, "sent_to_economist"), isNotNull(payrollRegistersTable.hrApprovedAt)));
  const progress = await tx.select().from(fieldOperationProgressTable)
    .innerJoin(fieldOperationsTable, eq(fieldOperationProgressTable.operationId, fieldOperationsTable.id))
    .where(eq(fieldOperationsTable.seasonId, seasonId));
  const progressToOperation = new Map(progress.map((p) => [p.field_operation_progress.id, p.field_operations.id]));
  for (const { item, register } of wages) {
    const id = item.sourceType === "field_progress" ? progressToOperation.get(item.sourceId!) :
      item.sourceType === "field_operation" ? item.sourceId : null;
    const op = id ? byId.get(id) : null;
    if (!op) continue; // Transport/manual rows are not guessed from free-text field names.
    const amount = Number(item.amountKzt);
    op.salaries.push({ employeeId: item.employeeId, employeeName: item.employeeName,
      workDate: register.workDate, amount });
    op.salaryCost = addMoney(op.salaryCost, amount);
  }
  for (const op of result.operations) {
    op.totalCost = addMoney(addMoney(op.chemicalCost, op.fuelCost), op.salaryCost);
    result.chemicalCost = addMoney(result.chemicalCost, op.chemicalCost);
    result.fuelCost = addMoney(result.fuelCost, op.fuelCost);
    result.salaryCost = addMoney(result.salaryCost, op.salaryCost);
    result.fuelLiters = addQuantity(result.fuelLiters, op.fuelLiters);
  }
  result.chemicalCost = addMoney(result.chemicalCost, result.unallocatedChemicalCost);
  result.totalCost = addMoney(addMoney(result.chemicalCost, result.fuelCost), result.salaryCost);
  return result;
}
