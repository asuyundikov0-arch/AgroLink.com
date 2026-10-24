import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Search, UserCheck, UserMinus, Users } from "lucide-react";
import {
  type Employee,
  getListEmployeesQueryKey,
  getListPayrollAccrualsQueryKey,
  useCreateEmployee,
  useListEmployees,
  useUpdateEmployee,
} from "@workspace/api-client-react";
import { errorInfo } from "../engineering/repairs/shared";

type Draft = { id: number | null; fullName: string; department: string; position: string; isActive: boolean };
const emptyDraft: Draft = { id: null, fullName: "", department: "", position: "", isActive: true };

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "С";
}

export default function EmployeeDirectory({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const query = useListEmployees({ query: { queryKey: getListEmployeesQueryKey() } });
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");
  const pending = create.isPending || update.isPending;

  const employees = useMemo(() => [...(query.data ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")), [query.data]);
  const activeCount = employees.filter((e) => e.isActive).length;
  const visible = employees.filter((e) => (filter === "all" || (filter === "active") === e.isActive)
    && `${e.fullName} ${e.department} ${e.position}`.toLowerCase().includes(search.trim().toLowerCase()));

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListPayrollAccrualsQueryKey() }),
  ]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !canManage) return;
    const fullName = draft.fullName.trim().replace(/\s+/g, " ");
    if (fullName.length < 2) { setFormError("Укажите ФИО полностью (не короче 2 символов)."); return; }
    const body = { fullName, department: draft.department.trim(), position: draft.position.trim() };
    setFormError("");
    try {
      if (draft.id === null) await create.mutateAsync({ data: body });
      else await update.mutateAsync({ id: draft.id, data: { ...body, isActive: draft.isActive } });
      await refresh();
      setNotice(draft.id === null ? `${fullName} добавлен(а) в справочник.` : `Карточка «${fullName}» обновлена.`);
      setDraft(null);
    } catch (err) { setFormError(errorInfo(err).message); }
  };

  const toggleActive = async (employee: Employee) => {
    if (!canManage) return;
    if (employee.isActive && !window.confirm(`Деактивировать «${employee.fullName}»? Сотрудник исчезнет из списков выбора, история начислений сохранится.`)) return;
    setNotice("");
    try {
      await update.mutateAsync({ id: employee.id, data: { fullName: employee.fullName, department: employee.department, position: employee.position, isActive: !employee.isActive } });
      await refresh();
      setNotice(employee.isActive ? `«${employee.fullName}» деактивирован(а).` : `«${employee.fullName}» снова активен(на).`);
    } catch (err) { setNotice(errorInfo(err).message); }
  };

  return <div className="animate-page space-y-4" data-testid="employee-directory">
    <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="eyebrow">Справочник · начисления по реальным людям</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">Сотрудники</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Механизаторы и водители выбираются в полевых отчётах и рейсах только отсюда. Так дневной реестр собирается по одному человеку, а не по вариантам написания имени.</p></div>
      {canManage && !draft && <button type="button" className="button button-primary shrink-0" onClick={() => { setDraft({ ...emptyDraft }); setFormError(""); setNotice(""); }} data-testid="button-new-employee"><Plus size={15} />Добавить сотрудника</button>}
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon"><UserCheck size={17} /></div><div><p className="eyebrow">Активные</p><p className="mt-1 text-xl font-bold" data-testid="text-employees-active">{query.isLoading ? "…" : activeCount}</p></div></article>
      <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon setting-icon-yellow"><UserMinus size={17} /></div><div><p className="eyebrow">Деактивированы</p><p className="mt-1 text-xl font-bold">{query.isLoading ? "…" : employees.length - activeCount}</p></div></article>
    </div>

    {notice && <p className="notice-banner" role="status"><Check size={15} />{notice}</p>}

    {draft && canManage && <form className="surface-card overflow-hidden" onSubmit={save} data-testid="employee-editor">
      <div className="border-b border-border bg-muted/25 px-5 py-4"><p className="eyebrow">{draft.id === null ? "Новая карточка" : `Карточка №${draft.id}`}</p><h2 className="mt-1 text-lg font-bold tracking-[-0.03em]">{draft.id === null ? "Добавить сотрудника" : "Изменить данные"}</h2></div>
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        <label className="form-label">ФИО *<input className="text-input mt-1" maxLength={200} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} placeholder="Фамилия Имя Отчество" autoFocus data-testid="input-employee-name" /></label>
        <label className="form-label">Подразделение<input className="text-input mt-1" maxLength={160} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} placeholder="АФ Веденовка" data-testid="input-employee-department" /></label>
        <label className="form-label">Должность<input className="text-input mt-1" maxLength={160} value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} placeholder="Механизатор, водитель…" data-testid="input-employee-position" /></label>
        {draft.id !== null && <label className="flex items-center gap-2 text-xs font-semibold sm:col-span-3"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} data-testid="checkbox-employee-active" />Активен — доступен для выбора в новых записях</label>}
      </div>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Изменение ФИО обновит официальное имя в будущих начислениях. Удаление не предусмотрено — только деактивация.</p>
        <div className="flex justify-end gap-2"><button type="button" className="button button-secondary" onClick={() => setDraft(null)} disabled={pending}>Отмена</button><button type="submit" className="button button-primary" disabled={pending} data-testid="button-save-employee">{pending ? "Сохраняем…" : "Сохранить"}</button></div>
      </div>
      {formError && <p className="px-5 pb-4 text-xs font-semibold text-destructive" role="alert">{formError}</p>}
    </form>}

    <section className="surface-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-xs"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input className="text-input pl-9" placeholder="Поиск по ФИО, должности" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-employee-search" /></label>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist">
          {([["active", "Активные"], ["inactive", "Неактивные"], ["all", "Все"]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={`rounded-md px-3 py-1.5 text-xs font-bold ${filter === key ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setFilter(key)} data-testid={`tab-employees-${key}`}>{label}</button>)}
        </div>
      </div>
      {query.isLoading ? <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
        : query.isError ? <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive" role="alert">{errorInfo(query.error).message}<button type="button" className="button button-secondary ml-3 text-xs" onClick={() => void query.refetch()}>Повторить</button></div>
        : visible.length === 0 ? <div className="flex flex-col items-center py-10 text-center"><div className="empty-icon"><Users size={20} /></div><p className="mt-3 text-sm font-semibold">{employees.length === 0 ? "Справочник пуст" : "Никого не нашли"}</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{employees.length === 0 ? "Добавьте механизаторов и водителей — после этого их можно будет выбирать в полевых отчётах и рейсах." : "Измените поиск или фильтр."}</p></div>
        : <ul className="mt-4 divide-y divide-border" data-testid="employee-list">{visible.map((e) => <li key={e.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`employee-row-${e.id}`}>
          <div className="flex min-w-0 items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${e.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{initials(e.fullName)}</span><div className="min-w-0"><p className={`truncate text-sm font-bold ${e.isActive ? "" : "text-muted-foreground line-through"}`}>{e.fullName}</p><p className="truncate text-xs text-muted-foreground">{[e.position, e.department].filter(Boolean).join(" · ") || "Должность не указана"}{!e.isActive && " · неактивен"}</p></div></div>
          {canManage && <div className="flex shrink-0 gap-2"><button type="button" className="button button-secondary min-h-8 px-3 text-[11px]" disabled={pending} onClick={() => { setDraft({ id: e.id, fullName: e.fullName, department: e.department, position: e.position, isActive: e.isActive }); setFormError(""); setNotice(""); }} data-testid={`button-edit-employee-${e.id}`}><Pencil size={13} />Изменить</button><button type="button" className="button button-secondary min-h-8 px-3 text-[11px]" disabled={pending} onClick={() => void toggleActive(e)} data-testid={`button-toggle-employee-${e.id}`}>{e.isActive ? "Деактивировать" : "Вернуть"}</button></div>}
        </li>)}</ul>}
    </section>
  </div>;
}
