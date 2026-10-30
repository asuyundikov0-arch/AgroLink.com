import { Plus, Trash2 } from "lucide-react";
import type { FieldMachineAssignment, FleetEquipment } from "@workspace/api-client-react";
import EmployeeSelect from "../../employees/EmployeeSelect";

export type AssignmentRow = { equipmentId: number | null; employeeId: number | null; employeeName: string; implement: string };
export const assignmentRows = (rows?: FieldMachineAssignment[]): AssignmentRow[] =>
  (rows ?? []).slice(1).map(r => ({ ...r, employeeName: r.employeeName ?? "" }));

export function collectAssignments(first: AssignmentRow, extras: AssignmentRow[]): { rows: FieldMachineAssignment[]; error: string } {
  const rows = [first, ...extras];
  if (rows.some(r => !r.equipmentId || !r.employeeId || !r.implement.trim()))
    return { rows: [], error: "У каждой машины выберите технику, своего механизатора и агрегат." };
  if (new Set(rows.map(r => r.equipmentId)).size !== rows.length || new Set(rows.map(r => r.employeeId)).size !== rows.length)
    return { rows: [], error: "Техника и механизаторы не должны повторяться." };
  return { rows: rows.map(r => ({ equipmentId: r.equipmentId!, employeeId: r.employeeId!, implement: r.implement.trim() })), error: "" };
}

/** Additional machines belong to the main operation, not to supporting works. */
export function ExtraMachinesEditor({ rows, onChange, fleet, disabled, error, prefix }: {
  rows: AssignmentRow[]; onChange: (r: AssignmentRow[]) => void; fleet: FleetEquipment[]; disabled?: boolean; error?: string; prefix: string;
}) {
  const change = (i: number, patch: Partial<AssignmentRow>) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  return <section className="space-y-3 rounded-lg border border-border p-3" data-testid={`${prefix}-machines`}>
    <div><h3 className="text-xs font-bold">Техника и механизаторы основной операции</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">Первая машина и сотрудник указаны выше. Добавьте остальные связки — у каждой машины свой механизатор и агрегат. Общая площадь операции не увеличивается.</p></div>
    {rows.map((r, i) => <fieldset key={i} disabled={disabled} className="space-y-2 rounded-md border border-border p-3" data-testid={`${prefix}-machine-${i + 2}`}>
      <div className="flex items-center justify-between"><legend className="text-xs font-semibold">Машина {i + 2}</legend>
        <button type="button" className="button button-ghost !min-h-7" aria-label={`Убрать машину ${i + 2}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></div>
      <label className="block text-xs">Техника<select className="text-input mt-1" value={r.equipmentId ?? ""} onChange={e => change(i, { equipmentId: Number(e.target.value) || null })} data-testid={`${prefix}-machine-equipment-${i + 2}`}>
        <option value="">Выберите технику</option>{fleet.map(x => <option key={x.id} value={x.id}>{x.kind} · {x.registrationNumber || "без госномера"}</option>)}
      </select></label>
      <div className="text-xs"><label htmlFor={`${prefix}-machine-employee-${i + 2}`}>Механизатор</label><EmployeeSelect id={`${prefix}-machine-employee-${i + 2}`} value={{ id: r.employeeId, name: r.employeeName }} onChange={v => change(i, { employeeId: v.id, employeeName: v.name })} testId={`${prefix}-machine-employee-${i + 2}`} /></div>
      <label className="block text-xs">Агрегат<input className="text-input mt-1" value={r.implement} maxLength={200} onChange={e => change(i, { implement: e.target.value })} data-testid={`${prefix}-machine-implement-${i + 2}`} /></label>
    </fieldset>)}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <button type="button" className="button button-secondary text-xs" disabled={disabled || rows.length >= 29} onClick={() => onChange([...rows, { equipmentId: null, employeeId: null, employeeName: "", implement: "" }])} data-testid={`${prefix}-add-machine`}><Plus size={14} />Добавить технику и механизатора</button>
  </section>;
}

export function MachineAssignmentSummary({ rows }: { rows?: FieldMachineAssignment[] }) {
  if (!rows?.length) return null;
  return <ul className="mt-1 space-y-1 text-[11px]" data-testid="machine-assignment-summary">{rows.map(r =>
    <li key={r.equipmentId}>{r.equipmentName || `Техника №${r.equipmentId}`} · {r.employeeName || `Сотрудник №${r.employeeId}`} · {r.implement}</li>)}</ul>;
}
