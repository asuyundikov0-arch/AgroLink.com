import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ClipboardList, Clock3, Lock, Send, Users, Wallet } from "lucide-react";
import {
  getListPayrollAccrualsQueryKey,
  getListPayrollRegistersQueryKey,
  type PayrollAccrualDay,
  type PayrollAccrualEntry,
  type PayrollRegister,
  useListPayrollAccruals,
  useListPayrollRegisters,
  useSendDailyPayrollRegister,
} from "@workspace/api-client-react";
import { errorInfo, money } from "../engineering/repairs/shared";

const sourceLabel: Record<string, string> = {
  grain_trip: "Рейс зерна",
  field_progress: "Дневной отчёт поля",
  field_operation: "Полевая операция",
  manual: "Ручная строка",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

type Line = { workType: string; details: string; amountKzt: number; sourceType: string; key: string };
type Group = { key: string; name: string; total: number; lines: Line[] };

function groupLines(entries: Array<{ employeeId: number | null; employeeName: string; workType: string; details: string; amountKzt: number; sourceType: string; sourceId: number | null }>): Group[] {
  const map = new Map<string, Group>();
  entries.forEach((entry, index) => {
    const key = entry.employeeId !== null ? `id-${entry.employeeId}` : `name-${entry.employeeName}`;
    const group = map.get(key) ?? { key, name: entry.employeeName, total: 0, lines: [] };
    group.total = Math.round((group.total + entry.amountKzt) * 100) / 100;
    group.lines.push({ workType: entry.workType, details: entry.details, amountKzt: entry.amountKzt, sourceType: entry.sourceType, key: `${entry.sourceType}-${entry.sourceId ?? index}-${index}` });
    map.set(key, group);
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function EmployeeGroups({ groups, testPrefix }: { groups: Group[]; testPrefix: string }) {
  return <div className="overflow-hidden rounded-lg border border-border/80">
    {groups.map((group) => <div key={group.key} className="border-t border-border/70 first:border-t-0" data-testid={`${testPrefix}-${group.key}`}>
      <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2"><span className="text-xs font-bold">{group.name}</span><span className="font-mono text-xs font-bold">{money(group.total)}</span></div>
      {group.lines.map((line) => <div key={line.key} className="grid gap-1 px-3 py-2 text-[11px] sm:grid-cols-[minmax(120px,1fr)_minmax(140px,1.6fr)_120px] sm:gap-3">
        <span><span className="font-semibold">{line.workType}</span> <span className="text-muted-foreground">· {sourceLabel[line.sourceType] ?? line.sourceType}</span></span>
        <span className="text-muted-foreground">{line.details || "—"}</span>
        <span className="font-mono sm:text-right">{money(line.amountKzt)}</span>
      </div>)}
    </div>)}
  </div>;
}

export default function PayrollRegisterWorkspace({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const registersQuery = useListPayrollRegisters({ query: { queryKey: getListPayrollRegistersQueryKey(), refetchInterval: 15000 } });
  const accrualsQuery = useListPayrollAccruals({ query: { queryKey: getListPayrollAccrualsQueryKey(), enabled: canManage, refetchInterval: canManage ? 15000 : false } });
  const send = useSendDailyPayrollRegister();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  const sent = (registersQuery.data ?? []).filter((register) => register.status === "sent_to_economist");
  const days = canManage ? accrualsQuery.data ?? [] : [];
  const pendingTotal = days.reduce((sum, day) => sum + day.totalAmount, 0);
  const sentTotal = sent.reduce((sum, register) => sum + register.totalAmount, 0);

  const sendDay = async (day: PayrollAccrualDay) => {
    if (!canManage || day.unassignedCount > 0 || day.entries.length === 0) return;
    const key = `${day.workDate}|${day.unit}`;
    setSendingKey(key); setError(""); setNotice("");
    try {
      await send.mutateAsync({ data: { workDate: day.workDate.slice(0, 10), unit: day.unit, sourceHash: day.sourceHash } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListPayrollAccrualsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListPayrollRegistersQueryKey() }),
      ]);
      setNotice(`Реестр за ${formatDate(day.workDate)} (${day.unit}) передан экономисту.`);
    } catch (err) {
      const info = errorInfo(err);
      setError(info.status === 409 ? "Исходные данные дня изменились после загрузки. Обновили расчёт — проверьте суммы и отправьте снова." : info.message);
      void queryClient.invalidateQueries({ queryKey: getListPayrollAccrualsQueryKey() });
    } finally { setSendingKey(null); }
  };

  return <section className="space-y-4" data-testid="payroll-register-workspace">
    <header>
      <p className="eyebrow">Ежедневные начисления · автоматический расчёт</p>
      <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Реестр начислений</h1>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{canManage
        ? "Суммы собираются из рейсов зерна и полевых работ с фактической расценкой. Строки не редактируются вручную — исправления вносятся в исходную запись. Отправленный реестр фиксируется и больше не меняется."
        : "Зафиксированные реестры, переданные диспетчером. Только просмотр."}</p>
    </header>

    <div className={`grid gap-3 ${canManage ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {canManage && <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon setting-icon-yellow"><Wallet size={17} /></div><div><p className="eyebrow">К отправке · {days.length} дн.</p><p className="mt-1 font-mono text-lg font-bold" data-testid="payroll-summary-pending">{accrualsQuery.isLoading ? "…" : money(pendingTotal)}</p></div></article>}
      <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon"><ClipboardList size={17} /></div><div><p className="eyebrow">Передано реестров</p><p className="mt-1 text-xl font-bold" data-testid="payroll-summary-register-count">{registersQuery.isLoading ? "…" : sent.length}</p></div></article>
      <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon"><Users size={17} /></div><div><p className="eyebrow">Сумма переданных</p><p className="mt-1 font-mono text-lg font-bold" data-testid="payroll-summary-total">{registersQuery.isLoading ? "…" : money(sentTotal)}</p></div></article>
    </div>

    {notice && <p className="notice-banner" role="status" data-testid="payroll-register-notice"><Check size={15} />{notice}</p>}
    {error && <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-semibold text-destructive" role="alert" data-testid="payroll-register-mutation-error">{error}</p>}

    {canManage && <section className="surface-card p-4 sm:p-5" data-testid="payroll-accruals-section">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Ожидают отправки</p><h2 className="mt-1 text-lg font-bold">Начисления по дням</h2></div><span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><Clock3 size={12} />Обновление каждые 15 секунд</span></header>
      {accrualsQuery.isLoading ? <div className="mt-4 space-y-3"><div className="skeleton h-24 rounded-lg" /><div className="skeleton h-24 rounded-lg" /></div>
        : accrualsQuery.isError ? <div className="mt-4" role="alert"><p className="text-sm font-semibold text-destructive">{errorInfo(accrualsQuery.error).message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={() => void accrualsQuery.refetch()}>Повторить</button></div>
        : days.length === 0 ? <div className="flex flex-col items-center py-10 text-center" data-testid="payroll-accruals-empty"><div className="empty-icon"><ClipboardList size={20} /></div><p className="mt-3 text-sm font-semibold">Неотправленных начислений нет</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Дни появятся здесь, когда рейсы или полевые работы получат фактическую расценку.</p></div>
        : <div className="mt-3 divide-y divide-border">{days.map((day) => {
          const key = `${day.workDate}|${day.unit}`;
          const blocked = day.unassignedCount > 0 || day.entries.length === 0;
          const groups = groupLines(day.entries.map((entry: PayrollAccrualEntry) => ({ ...entry })));
          return <article key={key} className="py-4" data-testid={`payroll-accrual-day-${day.workDate.slice(0, 10)}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{formatDate(day.workDate)}</h3><span className="meta-chip">{day.unit}</span><span className="text-[10px] text-muted-foreground">{groups.length} сотр. · {day.entries.length} строк</span></div>
                {day.unassignedCount > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900" data-testid={`payroll-unassigned-${day.workDate.slice(0, 10)}`}>
                  <p className="flex items-center gap-1.5 font-bold"><AlertTriangle size={13} />Не сопоставлено с сотрудниками: {day.unassignedCount}</p>
                  <p className="mt-1">Эти записи внесены до справочника — имя набрано вручную. Откройте исходный рейс или полевой отчёт и выберите сотрудника из справочника (при необходимости сначала добавьте его в разделе «Сотрудники»). До этого день отправить нельзя.</p>
                  <ul className="mt-2 space-y-0.5">{day.unassignedSources.map((source) => <li key={`${source.sourceType}-${source.sourceId}`}>{sourceLabel[source.sourceType] ?? source.sourceType} №{source.sourceId} · «{source.employeeName || "без имени"}» · {source.workType}{source.details ? ` · ${source.details}` : ""}</li>)}</ul>
                </div>}
                {day.entries.length > 0 && <div className="mt-3"><EmployeeGroups groups={groups} testPrefix={`payroll-accrual-employee-${day.workDate.slice(0, 10)}`} /></div>}
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border/70 pt-3 xl:min-w-[210px] xl:flex-col xl:items-end xl:border-0 xl:pt-0">
                <div className="xl:text-right"><p className="eyebrow">Итого за день</p><p className="mt-1 font-mono text-lg font-bold">{money(day.totalAmount)}</p></div>
                <button type="button" className="button button-primary min-h-8 px-3 text-[11px]" disabled={blocked || send.isPending} onClick={() => void sendDay(day)} title={blocked ? "Сначала сопоставьте все записи с сотрудниками" : undefined} data-testid={`button-send-payroll-day-${day.workDate.slice(0, 10)}`}>{sendingKey === key ? "Передаём…" : <><Send size={13} />Передать экономисту</>}</button>
              </div>
            </div>
          </article>;
        })}</div>}
    </section>}

    <section className="surface-card p-4 sm:p-5" data-testid="payroll-register-list-section">
      <header><p className="eyebrow">{canManage ? "Отправленные" : "Полученные реестры"}</p><h2 className="mt-1 text-lg font-bold">Зафиксированные реестры</h2></header>
      {registersQuery.isLoading ? <div className="mt-4 space-y-3"><div className="skeleton h-20 rounded-lg" /></div>
        : registersQuery.isError ? <div className="mt-4" role="alert"><p className="text-sm font-semibold text-destructive">{errorInfo(registersQuery.error).message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={() => void registersQuery.refetch()} data-testid="button-retry-payroll-register">Повторить</button></div>
        : sent.length === 0 ? <div className="flex flex-col items-center py-10 text-center" data-testid="payroll-register-empty"><div className="empty-icon"><ClipboardList size={20} /></div><p className="mt-3 text-sm font-semibold">Переданных реестров пока нет</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{canManage ? "Отправьте день из списка выше — он зафиксируется здесь." : "Когда диспетчер направит дневной реестр, он появится здесь."}</p></div>
        : <div className="mt-3 divide-y divide-border" data-testid="payroll-register-list">{sent.map((register) => <SentRegister key={register.id} register={register} />)}</div>}
    </section>
  </section>;
}

function SentRegister({ register }: { register: PayrollRegister }) {
  const groups = groupLines(register.entries);
  return <article className="py-4" data-testid={`payroll-register-card-${register.id}`}>
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{formatDate(register.workDate)}</h3><span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-800"><Lock size={10} />Передан экономисту</span><span className="text-[10px] text-muted-foreground">№ {register.id}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">{register.unit} · {groups.length} сотр. · передал {register.submittedByName || register.createdByName || "—"} · {formatDateTime(register.submittedAt)}</p>
        <details className="group mt-3"><summary className="cursor-pointer list-none text-[11px] font-semibold text-muted-foreground hover:text-foreground">Показать начисления по сотрудникам</summary><div className="mt-2"><EmployeeGroups groups={groups} testPrefix={`payroll-register-employee-${register.id}`} /></div></details>
      </div>
      <div className="xl:min-w-[180px] xl:text-right"><p className="eyebrow">Всего</p><p className="mt-1 font-mono text-lg font-bold" data-testid={`payroll-register-total-${register.id}`}>{money(register.totalAmount)}</p></div>
    </div>
  </article>;
}
