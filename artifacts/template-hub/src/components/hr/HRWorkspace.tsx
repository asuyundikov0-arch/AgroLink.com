import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Check, ChevronDown, CircleAlert, Search, Users } from "lucide-react";
import {
  getListEmployeesQueryKey, getListPayrollRegistersQueryKey,
  useListEmployees, useListPayrollRegisters, useUpdateEmployeePayrollGroup, useApproveHrPayrollRegister,
  type Employee, type PayrollRegister,
} from "@workspace/api-client-react";
import { errorInfo, money } from "../engineering/repairs/shared";
import { PendingRegister } from "../economic/PayrollRegisterWorkspace";
import { buildHRRoster, groupLabel, groupOf, PAYROLL_GROUPS, type GroupFilter } from "./payrollGroups";
import "./hr-payroll.css";

export default function HRWorkspace({ demoActive = false, onExitDemo }: { demoActive?: boolean; onExitDemo?: () => void }) {
  const qc = useQueryClient();
  const employeesQuery = useListEmployees({ query: { queryKey: getListEmployeesQueryKey(), refetchInterval: 15000 } });
  const registersQuery = useListPayrollRegisters({ query: { queryKey: getListPayrollRegistersQueryKey(), refetchInterval: 15000 } });
  const changeGroup = useUpdateEmployeePayrollGroup();
  const approve = useApproveHrPayrollRegister();
  const [group, setGroup] = useState<GroupFilter>("brigade");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [selectedRegister, setSelectedRegister] = useState<number | null>(null);
  const registers = registersQuery.data ?? [];
  const roster = useMemo(() => buildHRRoster(employeesQuery.data ?? [], registers, month), [employeesQuery.data, registersQuery.data, month]);
  const members = roster.filter((row) => row.group === group);
  const visible = members.filter((row) => `${row.name} ${row.employee?.position ?? ""}`.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")));
  const unassigned = roster.filter((row) => row.group === "unassigned").length;
  const pendingIds = new Set(members.flatMap((row) => row.pendingRegisterIds));
  const pendingRegisters = registers.filter((register) => pendingIds.has(register.id)).sort((a, b) => a.workDate.localeCompare(b.workDate) || a.id - b.id);
  const selected = registers.find((register) => register.id === selectedRegister);
  const loading = employeesQuery.isLoading || registersQuery.isLoading;
  const loadError = employeesQuery.isError || registersQuery.isError;
  const total = (kind: "confirmed" | "pending") => Math.round(roster.reduce((sum, row) => sum + Math.round(row[kind] * 100), 0)) / 100;
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() }),
    qc.invalidateQueries({ queryKey: getListPayrollRegistersQueryKey() }),
    qc.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? "").includes("/costs") }),
  ]);

  async function assign(employee: Employee, next: GroupFilter) {
    if (changeGroup.isPending) return;
    setError(""); setNotice("");
    try {
      await changeGroup.mutateAsync({ id: employee.id, data: { payrollGroup: next, expectedGroup: groupOf(employee) } });
      await qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      setNotice(`${employee.fullName}: ${groupLabel(next)}. Начисленные суммы не изменены.`);
    } catch (err) {
      setError(errorInfo(err).message);
      void qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
    }
  }

  async function confirmRegister(register: PayrollRegister) {
    if (approve.isPending || approvingId !== null || register.status !== "pending_hr") return;
    if (!window.confirm(`Подтвердить весь наряд №${register.id} за ${register.workDate.slice(0, 10)}?\n\n${register.entries.length} строк · ${money(register.totalAmount)}.\n\nВключены все сотрудники наряда, в том числе из других групп. Состав показан полностью. Отменить подтверждение нельзя.`)) return;
    setApprovingId(register.id); setError(""); setNotice("");
    try {
      await approve.mutateAsync({ id: register.id, data: { version: register.version } });
      await refresh();
      setNotice(`Наряд №${register.id} подтверждён. ${money(register.totalAmount)} включены в накопительные начисления.`);
      setSelectedRegister(null);
    } catch (err) {
      setError(errorInfo(err).message);
      void qc.invalidateQueries({ queryKey: getListPayrollRegistersQueryKey() });
    } finally { setApprovingId(null); }
  }

  return <div className="hr-payroll animate-page" data-testid="hr-workspace">
    <header className="hr-heading">
      <div><p className="eyebrow">AgroLink operation · Отдел кадров</p><h1>Начисления по подразделениям</h1><p>Сотрудники, подтверждённые суммы и расшифровки работ — в одном месте.</p></div>
      {demoActive && onExitDemo && <button type="button" className="button button-secondary text-xs" onClick={onExitDemo} data-testid="button-hr-exit-demo"><ArrowLeft size={14} />Выйти из демо-роли</button>}
    </header>
    <div className="hr-metrics">
      <article><span>Подтверждено · до удержаний</span><strong data-testid="hr-confirmed-total">{loading || loadError ? "—" : money(total("confirmed"))}</strong><small><BadgeCheck size={13} />Только подтверждённые начисления</small></article>
      <article><span>Ожидает подтверждения</span><strong data-testid="hr-pending-total">{loading || loadError ? "—" : money(total("pending"))}</strong><small>Пока не входит в зарплату</small></article>
      <article><span>Сотрудников в выбранной группе</span><strong data-testid="hr-member-count">{loading || loadError ? "—" : members.length}</strong><small>{month || "За весь период"} · текущая группа из справочника</small></article>
    </div>
    <div className="hr-policy"><CircleAlert size={16} /><p><b>Правила оплаты настроим позже.</b> Новые оклады, ставки и табельные начисления пока не вводятся. Существующий порядок сохраняется: плановую расценку задаёт главный агроном, фактическую — диспетчер, начисление подтверждают кадры.</p></div>
    {notice && <p className="notice-banner" role="status"><Check size={15} />{notice}</p>}
    {error && <p className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive" role="alert">{error}</p>}
    <nav className="hr-group-tabs" aria-label="Зарплатные подразделения">
      {PAYROLL_GROUPS.map(([key, label]) => <button type="button" key={key} aria-pressed={group === key} className={group === key ? "is-active" : ""} onClick={() => { setGroup(key); setSearch(""); setSelectedRegister(null); }} data-testid={`hr-group-${key}`}>{label}<span>{roster.filter((row) => row.group === key).length}</span></button>)}
    </nav>
    {(unassigned > 0 || group === "unassigned") && <div className="hr-unassigned"><span>Без назначенной группы: {unassigned}. Автоматически распределять сотрудников по должности не будем.</span><button type="button" className="button button-secondary text-xs" onClick={() => { setGroup("unassigned"); setSearch(""); setSelectedRegister(null); }} data-testid="hr-show-unassigned">Распределить сотрудников</button></div>}
    <section className="hr-roster">
      <div className="hr-section-head"><div><p className="eyebrow">Накопительный реестр · по текущему составу группы</p><h2>{groupLabel(group)}</h2></div><Users size={20} /></div>
      <div className="hr-toolbar">
        <label className="hr-search"><Search size={15} /><input aria-label="Поиск сотрудника" placeholder="ФИО или должность" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="hr-search" /></label>
        <label className="hr-month">Месяц<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setSelectedRegister(null); }} aria-label="Месяц начислений" /></label>
        <button type="button" className="button button-secondary text-xs" disabled={!month} onClick={() => { setMonth(""); setSelectedRegister(null); }}>Весь период</button>
      </div>
      {loading ? <div className="skeleton m-5 h-32 rounded-lg" /> : loadError ? <div className="p-5" role="alert"><p className="text-sm text-destructive">{errorInfo(employeesQuery.error ?? registersQuery.error).message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={() => void refresh()}>Повторить загрузку</button></div>
        : visible.length === 0 ? <div className="hr-empty"><Users size={24} /><h3>{search ? "Никого не нашли" : "В этой группе пока нет сотрудников"}</h3><p>{search ? "Измените поиск." : "Существующих сотрудников можно распределить через «Распределить сотрудников». Новые карточки по-прежнему ведут главные специалисты, диспетчер и генеральный директор."}</p>{!search && unassigned > 0 && <button type="button" className="button button-secondary mt-3 text-xs" onClick={() => setGroup("unassigned")}>Распределить сотрудников</button>}</div>
          : <div className="hr-table-scroll"><table className="hr-table"><thead><tr><th>Сотрудник</th><th>Группа</th><th>Подтверждено</th><th>На согласовании</th><th>Расшифровка</th></tr></thead><tbody>{visible.map((row) => <tr key={row.key} data-testid={`hr-row-${row.key}`}>
            <td><b>{row.name}</b><small>{row.employee ? `${row.employee.position || "Должность не указана"}${!row.employee.isActive ? " · неактивен" : ""}` : "Историческая запись · нет однозначной карточки"}</small></td>
            <td>{row.employee ? <select aria-label={`Группа сотрудника ${row.name}`} value={row.group} disabled={changeGroup.isPending || demoActive} onChange={(event) => void assign(row.employee!, event.target.value as GroupFilter)} data-testid={`hr-assign-${row.employee.id}`}><option value="unassigned">Без группы</option>{PAYROLL_GROUPS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select> : <span className="text-xs text-muted-foreground">Без группы</span>}</td>
            <td className="hr-money">{money(row.confirmed)}</td><td className="hr-money">{money(row.pending)}</td>
            <td><details className="hr-details"><summary>Показать <ChevronDown size={12} /></summary>{row.lines.length === 0 ? <p>Подтверждённых начислений за выбранный период нет.</p> : row.lines.map((line, index) => <div className="hr-line" key={`${line.registerId}-${line.id}-${index}`}><b>{line.workType} · {money(line.amountKzt)}</b><span>{line.workDate.slice(0, 10)} · {line.unit} · наряд №{line.registerId}</span><span>{line.details || "Без примечаний"}</span></div>)}{row.pendingRegisterIds.map((id) => <button type="button" key={id} className="button button-secondary mt-2 text-xs" onClick={() => setSelectedRegister(id)}>Проверить наряд №{id}</button>)}</details></td>
          </tr>)}</tbody></table></div>}
    </section>
    {!loading && !loadError && <section className="hr-approvals"><div className="hr-section-head"><div><p className="eyebrow">{groupLabel(group)} · требуют решения кадров</p><h2>Начисления на подтверждение</h2></div><BadgeCheck size={20} /></div><p className="hr-hint">Наряды могут включать несколько подразделений. Перед подтверждением показываем весь состав и полную сумму — скрытого частичного подтверждения нет.</p>
      {pendingRegisters.length === 0 ? <p className="hr-hint pb-5">Начислений на подтверждение в этой группе за выбранный период нет.</p> : <div className="hr-order-buttons">{pendingRegisters.map((register) => <button type="button" key={register.id} className="button button-secondary text-xs" onClick={() => setSelectedRegister(register.id)} data-testid={`hr-review-${register.id}`}>Наряд №{register.id} · {register.workDate.slice(0, 10)} · {money(register.totalAmount)}</button>)}</div>}
      {selected?.status === "pending_hr" && <div className="hr-full-order" data-testid="hr-full-order"><p className="hr-policy">Полный наряд: все сотрудники и подразделения. Подтверждение сохраняет весь наряд, а не только строки выбранной группы.</p><PendingRegister register={selected} canApprove={!demoActive} approving={approvingId === selected.id} disabled={approvingId !== null || approve.isPending} onApprove={() => void confirmRegister(selected)} /></div>}
    </section>}
  </div>;
}
