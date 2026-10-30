import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import {
  db, fieldOperationsTable as operations, fieldOperationProgressTable as progress,
  fieldSeasonsTable as seasons, agroFieldsTable as fields, employeesTable as employees,
  fleetEquipmentTable as equipment, chemicalBatchesTable as batches,
  chemicalInvoicesTable as invoices, chemicalRequestsTable as requests, activityTable,
} from "@workspace/db";
import type { FieldActualInput, FieldChemicalPlan, FieldLifecycleInput } from "@workspace/api-zod";
import type { RoleAccess } from "../middlewares/auth";
import { chemicalCheck as check, scaledChemical } from "./chemical-stock";
import { grainBusinessDate, validGrainDate } from "./grain-ledger";
import { isChemicalOperation, requestChemical } from "./chemical-workflow";
import { fieldPayrollLockedThrough } from "./payroll-source-guard";
import { toAreaAres } from "./field-planning";
import { validateSupportingWorks } from "./field-supporting-works";
import { resolveFieldAssignments } from "./field-machine-assignments";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Operation = typeof operations.$inferSelect;
const actor = (a: RoleAccess) => `${a.displayName} · ${a.role}`;
const stamp = (o: Operation, a: RoleAccess) => ({
  version: o.version + 1, updatedBy: actor(a), updatedAt: new Date(),
});
export async function validateChemicalPlan(tx: Tx, plan: FieldChemicalPlan[], unit: string, required: boolean) {
  check(Array.isArray(plan) && plan.length <= 20, "В плане допускается до 20 препаратов.");
  check(!required || plan.length > 0, "Укажите препарат и норму расхода на гектар для химической обработки.");
  check(required || plan.length === 0, "Для плана химии включите признак «Требуется химия».");
  const seen = new Set<number>();
  for (const item of plan) {
    check(Number.isSafeInteger(item.batchId) && item.batchId > 0 && !seen.has(item.batchId),
      "Выберите разные препараты из склада химии.");
    seen.add(item.batchId);
    const rate = scaledChemical(item.ratePerHa, 1000, "норма на гектар — до 3 знаков");
    check(rate > 0 && rate <= 1_000_000_000, "Укажите положительную норму расхода.");
    const [row] = await tx.select({ farm: invoices.farm }).from(batches)
      .innerJoin(invoices, eq(batches.invoiceId, invoices.id)).where(eq(batches.id, item.batchId));
    check(row?.farm === unit, "Выберите препарат из склада нужного хозяйства.");
  }
  return plan.map(p => ({ batchId: p.batchId, ratePerHa: p.ratePerHa }));
}

/** Future reports take a snapshot of these assignments; past daily rows are never rewritten. */
export async function startOrChangeFieldWork(tx: Tx, old: Operation, input: FieldActualInput, access: RoleAccess) {
  check(["agronomist", "general_director"].includes(access.role ?? ""), "Работу запускает и сведения меняет агроном хозяйства.", 403);
  check(!old.voidedAt && !old.actualEnd && !old.completionRequestedOn,
    "Операция завершена, отменена или ожидает подтверждения завершения.", 409);
  check(old.approvalStatus === "approved", "Внеплановую работу сначала согласовывает главный агроном.", 409);
  check(await fieldPayrollLockedThrough(tx, old.id) !== "9999-12-31", "Работа уже включена в отправленный наряд целиком.", 409);
  check(input.actualEnd === null && toAreaAres(input.actualAreaHa, true) === old.actualAreaAres,
    "Гектары вносит только диспетчер. Завершение выполняется через согласование.", 403);
  check(input.actualOperationName.trim() === (old.actualOperationName || old.name),
    "При выполнении плана нельзя менять вид операции.", 409);
  check(input.actualNotes.trim() === old.actualNotes || !old.actualStart,
    "В сведениях выполняемой работы меняются только механизатор, техника и агрегат.");
  check(input.actualStart && validGrainDate(input.actualStart) && input.actualStart <= grainBusinessDate(),
    "Укажите корректную дату начала, не позднее сегодняшней.");
  check(!old.actualStart || input.actualStart === old.actualStart,
    "Дата начала уже зафиксирована и не может быть изменена.", 409);
  const [season] = await tx.select().from(seasons).where(eq(seasons.id, old.seasonId));
  const [field] = await tx.select().from(fields).where(eq(fields.id, season.fieldId));
  check(field.isActive, "Нельзя начать работу по архивному полю.", 409);
  const actualSupportingWorks = input.actualSupportingWorks === undefined
    ? (old.actualStart ? old.actualSupportingWorks : old.supportingWorks)
    : await validateSupportingWorks(tx, input.actualSupportingWorks, field.unit);
  check(Number(input.actualStart.slice(0, 4)) === season.year, "Дата начала должна относиться к сезону поля.");
  check(Number.isSafeInteger(input.actualMechanicEmployeeId) && Number(input.actualMechanicEmployeeId) > 0,
    "Выберите механизатора из справочника.");
  const [mechanic] = await tx.select().from(employees).where(eq(employees.id, input.actualMechanicEmployeeId!));
  check(mechanic?.isActive, "Выберите действующего сотрудника.");
  const fleet = await tx.select().from(equipment).where(eq(equipment.unit, field.unit));
  const machine = fleet.find(e => `${e.kind} · ${e.registrationNumber || "без госномера"}` === input.actualEquipment.trim());
  check(machine, "Выберите технику нужного хозяйства из справочника.");
  check(input.actualImplement.trim(), "Укажите агрегат.");
  const assignmentInput = input.actualAssignments ?? [{
    equipmentId: machine.id, employeeId: mechanic.id, implement: input.actualImplement.trim(),
  }, ...(old.actualStart ? old.actualAssignments : old.plannedAssignments).slice(1)];
  const actualAssignments = await resolveFieldAssignments(tx, assignmentInput, field.unit);
  check(actualAssignments[0].employeeId === mechanic.id && actualAssignments[0].equipmentId === machine.id
    && actualAssignments[0].implement === input.actualImplement.trim(), "Первая связка должна совпадать с основными сведениями факта.");
  if (!old.actualStart && isChemicalOperation(old)) {
    await validateChemicalPlan(tx, old.chemicalPlan, field.unit, true);
  }
  const [updated] = await tx.update(operations).set({
    actualStart: input.actualStart, actualSupportingWorks, actualAssignments, actualOperationName: old.actualOperationName || old.name,
    actualMechanic: mechanic.fullName, actualMechanicEmployeeId: mechanic.id,
    actualEquipment: `${machine.kind} · ${machine.registrationNumber || "без госномера"}`,
    actualImplement: input.actualImplement.trim(),
    actualNotes: old.actualStart ? old.actualNotes : input.actualNotes.trim(),
    startedByUserId: old.startedByUserId ?? access.userId, ...stamp(old, access),
  }).where(eq(operations.id, old.id)).returning();
  if (!old.actualStart && isChemicalOperation(old)) {
    // Demand is generated exactly once with the start transaction; never book a field expense here.
    const previous = await tx.select().from(requests).where(eq(requests.operationId, old.id));
    for (const line of old.chemicalPlan) {
      const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId));
      const area = (old.isUnplanned ? old.actualAreaLimitAres : old.plannedAreaAres)! / 100;
      const need = Math.round(line.ratePerHa * area * 1000);
      const packaged = batch.containerVolumeMillis ? Math.ceil(need / batch.containerVolumeMillis) * batch.containerVolumeMillis : need;
      const requested = previous.filter(r => r.batchId === line.batchId && r.requesterUserId === access.userId)
        .reduce((n, r) => n + r.quantityMillis, 0);
      if (packaged > requested) await requestChemical(tx, {
        requestId: randomUUID(), operationId: old.id, batchId: line.batchId,
        quantity: (packaged - requested) / 1000,
        notes: `Начало работ · норма ${line.ratePerHa} ${batch.unit}/га × ${area} га; выдача целыми упаковками`,
      }, access);
    }
  }
  await tx.insert(activityTable).values({
    action: old.actualStart ? "Агроном изменил сведения выполняемой работы" : "Работа началась — уведомлён диспетчер",
    templateName: `Поле ${field.number} · ${old.name}`, userName: actor(access),
  });
  return updated;
}

export async function transitionFieldWork(tx: Tx, old: Operation, input: FieldLifecycleInput, access: RoleAccess) {
  check(!old.voidedAt && !old.actualEnd, "Операция уже завершена или отменена.", 409);
  const chief = ["chief_agronomist", "general_director"].includes(access.role ?? "");
  const agronomist = ["agronomist", "general_director"].includes(access.role ?? "");
  const dispatcher = ["dispatcher", "general_director"].includes(access.role ?? "");
  let patch: Partial<typeof operations.$inferInsert> = {};
  let action = "";
  switch (input.action) {
    case "approve_unplanned":
    case "reject_unplanned":
      check(chief, "Внеплановые работы согласовывает главный агроном.", 403);
      check(old.isUnplanned && old.approvalStatus === "pending" && !old.actualStart,
        "Заявка уже рассмотрена или работа началась.", 409);
      if (input.action === "reject_unplanned") check(input.note?.trim(), "Укажите причину отказа.");
      patch = { approvalStatus: input.action === "approve_unplanned" ? "approved" : "rejected", approvalNote: input.note?.trim() ?? "" };
      action = input.action === "approve_unplanned" ? "Согласована внеплановая работа — агроном может начать" : "Отказано во внеплановой работе";
      break;
    case "request_completion": {
      check(dispatcher, "На подтверждение завершения отправляет диспетчер.", 403);
      check(old.actualStart && !old.completionRequestedOn && old.actualAreaAres > 0,
        "Нужна начатая работа с положительным дневным фактом, без ожидающего согласования.", 409);
      const rows = await tx.select().from(progress).where(eq(progress.operationId, old.id)).orderBy(asc(progress.reportDate));
      check(input.date && validGrainDate(input.date) && input.date >= old.actualStart
        && input.date <= grainBusinessDate() && (!rows.length || input.date >= rows.at(-1)!.reportDate),
      "Завершение должно быть не раньше последнего факта и не позднее сегодняшней даты.");
      patch = { completionRequestedOn: input.date, completionRequestedBy: actor(access), approvalNote: input.note?.trim() ?? "" };
      action = "Диспетчер завершил работы — ожидается подтверждение агронома";
      break;
    }
    case "approve_completion":
    case "reject_completion":
      check(agronomist, "Завершение подтверждает агроном хозяйства.", 403);
      check(old.actualStart && old.completionRequestedOn, "Диспетчер ещё не отправил завершение на согласование.", 409);
      if (input.action === "reject_completion") check(input.note?.trim(), "Укажите причину возврата.");
      patch = {
        actualEnd: input.action === "approve_completion" ? old.completionRequestedOn : null,
        completionRequestedOn: null, completionRequestedBy: "",
        approvalNote: input.note?.trim() ?? "",
      };
      action = input.action === "approve_completion" ? "Агроном подтвердил завершение — работа в истории поля" : "Агроном вернул работу диспетчеру";
      break;
  }
  const [updated] = await tx.update(operations).set({ ...patch, ...stamp(old, access) })
    .where(eq(operations.id, old.id)).returning();
  await tx.insert(activityTable).values({ action, templateName: `${old.name} · операция №${old.id}`, userName: actor(access) });
  return updated;
}
