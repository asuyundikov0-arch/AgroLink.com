import { eq } from "drizzle-orm";
import { db, employeesTable, fleetEquipmentTable } from "@workspace/db";
import type { FieldSupportingWork } from "@workspace/api-zod";
import { chemicalCheck as check } from "./chemical-stock";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** These are resource assignments and budgets, never warehouse issues or payroll accruals. */
export async function validateSupportingWorks(tx: Tx, works: FieldSupportingWork[], unit: string) {
  check(Array.isArray(works) && works.length <= 20, "Допускается до 20 сопутствующих работ.");
  const result: FieldSupportingWork[] = [];
  for (const work of works) {
    check(work.name.trim().length > 0, "Укажите название сопутствующей работы.");
    const employeeIds = [...new Set(work.employeeIds)];
    check(employeeIds.length === work.employeeIds.length && employeeIds.length <= 30,
      "Не повторяйте сотрудников в одной сопутствующей работе.");
    const employeeNames: string[] = [];
    for (const id of employeeIds) {
      check(Number.isSafeInteger(id) && id > 0, "Выберите сотрудника из справочника.");
      const [employee] = await tx.select().from(employeesTable).where(eq(employeesTable.id, id));
      check(employee?.isActive, "Сотрудник сопутствующей работы не найден или неактивен.");
      employeeNames.push(employee.fullName);
    }
    let equipmentName = "";
    if (work.equipmentId !== null) {
      check(Number.isSafeInteger(work.equipmentId) && work.equipmentId > 0, "Выберите технику из справочника.");
      const [equipment] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, work.equipmentId));
      check(equipment?.unit === unit, "Техника сопутствующей работы должна относиться к хозяйству поля.");
      equipmentName = `${equipment.kind} · ${equipment.registrationNumber || "без госномера"}`;
    }
    for (const value of [work.salaryCost, work.fuelCost, work.seedPrice]) {
      check(Number.isFinite(value) && value >= 0 && value <= 1e9 &&
        Math.abs(Math.round(value * 100) - value * 100) < 0.0001,
      "Затраты указываются в тенге, до двух знаков после запятой.");
    }
    check(Number.isFinite(work.seedQuantity) && work.seedQuantity >= 0 && work.seedQuantity <= 1e6,
      "Укажите корректное количество семян.");
    check(work.seedQuantity === 0 || work.seedName.trim().length > 0, "Укажите название семян.");
    check(work.seedQuantity * work.seedPrice <= 1e12, "Стоимость семян слишком велика.");
    result.push({ ...work, name: work.name.trim(), seedName: work.seedName.trim(),
      employeeIds, employeeNames, equipmentName });
  }
  return result;
}
