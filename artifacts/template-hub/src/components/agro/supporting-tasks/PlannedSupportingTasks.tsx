import { useState } from "react";
import { ClipboardPlus } from "lucide-react";
import type { AgroField, FieldOperation } from "@workspace/api-client-react";
import { SupportingWorksSummary } from "../fields/SupportingWorksEditor";
import { TaskForm } from "./TaskForm";
import { canCreateTasks } from "./shared";

/** The source is the exact clicked planned row, never the actual-work snapshot or first global candidate. */
export function PlannedSupportingTasks({ operation, field, year, role }: {
  operation: FieldOperation; field: AgroField; year: number; role: string;
}) {
  const [sourceIndex, setSourceIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const canCreate = canCreateTasks(role) && field.isActive && !operation.isUnplanned
    && operation.status !== "completed" && operation.status !== "cancelled";
  return <>
    <SupportingWorksSummary works={operation.supportingWorks} title="Сопутствующие работы по плану"
      testId={`text-support-plan-${operation.id}`}
      renderAction={canCreate ? (index) => <button type="button"
        className="button button-secondary !min-h-[28px] !px-2 text-[10.5px]"
        data-testid={`button-support-task-create-${operation.id}-${index}`}
        onClick={() => { setNotice(""); setSourceIndex(index); }}>
        <ClipboardPlus size={12} />Создать задание
      </button> : undefined} />
    {notice && <p role="status" className="mt-1 text-[11px] font-semibold" data-testid={`text-support-task-created-${operation.id}`}>{notice}</p>}
    {sourceIndex !== null && canCreate && <TaskForm key={`${operation.id}-${sourceIndex}`}
      candidates={[{ op: operation, fieldNumber: field.number, farm: field.unit, year }]}
      defaultOpId={operation.id} defaultSourceIndex={sourceIndex} lockSource
      onClose={() => setSourceIndex(null)}
      onSaved={(_task, message) => { setSourceIndex(null); setNotice(message); }} />}
  </>;
}
