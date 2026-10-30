import { eq } from "drizzle-orm";
import { db, employeesTable, fleetEquipmentTable, type FieldMachineAssignmentRecord, type FieldMachineReportRecord } from "@workspace/db";
import { chemicalCheck as check } from "./chemical-stock";
import { toAreaAres } from "./field-planning";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Input = { equipmentId: number; employeeId: number; implement: string };

export async function resolveFieldAssignments(tx: Tx, rows: Input[], unit: string): Promise<FieldMachineAssignmentRecord[]> {
  check(rows.length > 0 && rows.length <= 30, "Добавьте от 1 до 30 связок «техника — механизатор».");
  const machines = new Set<number>(), people = new Set<number>();
  const result: FieldMachineAssignmentRecord[] = [];
  for (const row of rows) {
    check(Number.isSafeInteger(row.equipmentId) && Number.isSafeInteger(row.employeeId), "Выберите технику и сотрудника из справочников.");
    check(!machines.has(row.equipmentId), "Одна техника не может повторяться в операции.");
    check(!people.has(row.employeeId), "У каждой машины должен быть свой механизатор.");
    check(row.implement.trim().length > 0 && row.implement.length <= 200, "Укажите агрегат для каждой машины.");
    const [machine] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, row.equipmentId));
    const [person] = await tx.select().from(employeesTable).where(eq(employeesTable.id, row.employeeId));
    check(machine?.unit === unit, "Выберите технику нужного хозяйства.");
    check(person?.isActive, "Выберите действующего механизатора.");
    machines.add(row.equipmentId); people.add(row.employeeId);
    result.push({ equipmentId: machine.id, employeeId: person.id, equipmentName: `${machine.kind} · ${machine.registrationNumber || "без госномера"}`,
      employeeName: person.fullName, implement: row.implement.trim() });
  }
  return result;
}

/** Daily resources are authoritative snapshots, not names supplied by the dispatcher. */
export function resolveMachineReports(
  input: (Input & { dailyAreaHa: number; ratePerHa: number })[] | undefined,
  assignments: FieldMachineAssignmentRecord[], dailyAres: number,
  next?: { cumulativeAreaAres: number; machineReports: FieldMachineReportRecord[] } | null,
  cumulativeAres?: number,
): FieldMachineReportRecord[] {
  check(assignments.length <= 1 || !!input?.length, "Укажите выполненные гектары отдельно по каждой машине.");
  if (next?.machineReports.length && cumulativeAres !== undefined) check(
    next.cumulativeAreaAres - cumulativeAres === next.machineReports.reduce((n, r) => n + Math.round(r.dailyAreaHa * 100), 0),
    "Изменение нарушит отчёт по машинам за следующий день. Сначала исправьте более поздние записи.", 409);
  if (!input) return [];
  check(input.length === assignments.length && input.length > 0, "Заполните отчёт по каждой закреплённой машине.");
  const seen = new Set<number>();
  const rows = input.map(row => {
    const a = assignments.find(a => a.equipmentId === row.equipmentId && a.employeeId === row.employeeId && a.implement === row.implement);
    check(a && !seen.has(row.equipmentId), "Состав техники изменился. Обновите сведения перед внесением факта.", 409);
    seen.add(row.equipmentId);
    check(toAreaAres(row.dailyAreaHa, true) !== null && row.ratePerHa > 0 && row.ratePerHa <= 1e9
      && Math.abs(row.ratePerHa * 100 - Math.round(row.ratePerHa * 100)) < 0.00001, "Проверьте гектары и ставку каждой машины.");
    return { ...a, dailyAreaHa: row.dailyAreaHa, ratePerHa: row.ratePerHa };
  });
  check(rows.reduce((n, r) => n + Math.round(r.dailyAreaHa * 100), 0) === dailyAres,
    "Сумма гектаров по машинам должна совпадать с выполненной площадью за день.");
  return rows;
}
