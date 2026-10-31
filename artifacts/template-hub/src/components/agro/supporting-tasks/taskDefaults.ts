import type { FieldOperation } from "@workspace/api-client-react";
import { amountStr } from "./shared";

export function plannedTaskDefaults(operation: FieldOperation | undefined, sourceIndex: number) {
  const source = operation?.supportingWorks?.[sourceIndex];
  return {
    title: source?.name ?? "",
    startDate: operation?.plannedStart?.slice(0, 10) ?? "",
    endDate: operation?.plannedEnd?.slice(0, 10) ?? "",
    equipmentId: source?.equipmentId ?? null,
    employeeIds: [...(source?.employeeIds ?? [])],
    salary: source ? amountStr(source.salaryCost) : "0",
    fuel: source ? amountStr(source.fuelCost) : "0",
  };
}
