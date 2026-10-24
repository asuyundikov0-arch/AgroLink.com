import { ChevronDown } from "lucide-react";
import { getListEmployeesQueryKey, useListEmployees } from "@workspace/api-client-react";

export type EmployeeChoice = { id: number | null; name: string };

/** Select from the employee directory. Returns both id and the official name snapshot. */
export default function EmployeeSelect({ id, value, onChange, testId, invalid }: {
  id?: string;
  value: EmployeeChoice;
  onChange: (next: EmployeeChoice) => void;
  testId?: string;
  invalid?: boolean;
}) {
  const query = useListEmployees({ query: { queryKey: getListEmployeesQueryKey(), staleTime: 30_000 } });
  const all = query.data ?? [];
  const active = all.filter((employee) => employee.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  const current = value.id !== null ? all.find((employee) => employee.id === value.id) : undefined;
  const currentInactive = value.id !== null && (!current || !current.isActive);
  const legacyName = value.id === null && value.name.trim() ? value.name.trim() : "";

  if (query.isLoading) return <div className="skeleton h-10 w-full rounded-lg" data-testid={testId ? `${testId}-loading` : undefined} />;
  if (query.isError) return <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">Справочник сотрудников не загрузился. <button type="button" className="font-bold underline" onClick={() => void query.refetch()}>Повторить</button></div>;

  return <div>
    <span className="select-wrap block">
      <select
        id={id}
        className="text-input appearance-none"
        aria-invalid={invalid || undefined}
        value={value.id === null ? "" : String(value.id)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!next) { onChange({ id: null, name: "" }); return; }
          const picked = all.find((employee) => employee.id === next);
          onChange({ id: next, name: picked?.fullName ?? value.name });
        }}
        data-testid={testId}
      >
        <option value="">{legacyName ? `Не сопоставлено: «${legacyName}»` : "Выберите сотрудника"}</option>
        {currentInactive && value.id !== null && <option value={String(value.id)}>{current?.fullName ?? value.name} (неактивен)</option>}
        {active.map((employee) => <option key={employee.id} value={String(employee.id)}>{employee.fullName}{employee.position ? ` · ${employee.position}` : ""}</option>)}
      </select>
      <ChevronDown size={15} />
    </span>
    {legacyName && <p className="mt-1 text-[11px] leading-4 text-amber-800">Ранее внесено вручную. Выберите сотрудника из справочника, чтобы начисление попало в реестр.</p>}
    {currentInactive && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Сотрудник деактивирован — для новых записей выберите действующего.</p>}
    {active.length === 0 && !currentInactive && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">В справочнике нет активных сотрудников. Их добавляет диспетчер или руководитель в разделе «Сотрудники».</p>}
  </div>;
}
