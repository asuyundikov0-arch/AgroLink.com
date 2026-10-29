import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Tractor, Wallet } from "lucide-react";
import {
  getGetFieldDispatchQueueQueryKey,
  getGetFieldDashboardQueryKey,
  getListPayrollAccrualsQueryKey,
  type FieldDispatchItem,
  useGetFieldDispatchQueue,
  useUpdateFieldDispatchRate,
} from "@workspace/api-client-react";
import { dateFmt, errorInfo, POLL_MS } from "./grain/shared";
import { money } from "../engineering/repairs/shared";
import ChemicalConsumptionSection from "./chemicals/Consumption";
import { DispatcherActiveWorks } from "./fields/DispatcherActive";
import PayrollRegisterWorkspace from "../economic/PayrollRegisterWorkspace";

type View = "fields" | "chemicals" | "payroll";
const parseRate = (value: string) => {
  const parsed = Number(value.trim().replace(",", "."));
  return value.trim() && Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000_000 ? parsed : null;
};

export default function DispatcherWorkspace() {
  const fieldsQuery = useGetFieldDispatchQueue({ query: { queryKey: getGetFieldDispatchQueueQueryKey(), refetchInterval: POLL_MS } });
  const fieldOperations = fieldsQuery.data ?? [];
  const completedFields = fieldOperations.filter((operation) => !operation.operation || !!operation.operation.actualEnd || !!operation.actualEnd);
  const activeFields = fieldOperations.filter((operation) => operation.operation && !operation.operation.actualEnd && operation.operation.actualStart).length;
  const unratedFields = completedFields.filter((item) => {
    const reports = item.operation?.progressReports ?? [];
    return reports.length ? reports.some(r => r.actualRatePerHa == null && item.actualRatePerHa === null) : item.actualRatePerHa === null;
  }).length;
  const [view, setView] = useState<View>("fields");
  const [notice, setNotice] = useState("");

  return (
    <div className="space-y-5" data-testid="dispatcher-workspace">
      <header>
        <p className="eyebrow">Рабочее пространство</p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Диспетчерская</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Управляйте фактическими расценками по полевым работам, а также отправляйте ежедневные наряды в отдел кадров на подтверждение.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Очередь диспетчера">
        <article className="surface-card flex items-center gap-3 p-4">
          <div className="setting-icon"><Tractor size={17} /></div>
          <div><p className="eyebrow">Выполняемые работы</p><p className="mt-1 text-xl font-bold" data-testid="text-dispatch-active-count">{activeFields}</p></div>
        </article>
        <article className="surface-card flex items-center gap-3 p-4">
          <div className="setting-icon"><Tractor size={17} /></div>
          <div><p className="eyebrow">Завершённые работы без ставки</p><p className="mt-1 text-xl font-bold">{unratedFields}</p></div>
        </article>
      </section>

      {notice && <p className="notice-banner" role="status" data-testid="dispatcher-notice"><Check size={15} />{notice}</p>}
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Работа диспетчера">
        <button type="button" role="tab" aria-selected={view === "fields"} onClick={() => setView("fields")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${view === "fields" ? "bg-foreground text-background" : "text-muted-foreground"}`} data-testid="tab-dispatch-fields">Полевые работы{activeFields > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-px text-[10px] text-primary-foreground" data-testid="badge-dispatch-fields-active">{activeFields}</span>}</button>
        <button type="button" role="tab" aria-selected={view === "chemicals"} onClick={() => setView("chemicals")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${view === "chemicals" ? "bg-foreground text-background" : "text-muted-foreground"}`} data-testid="tab-dispatch-chemicals">Химия по дням</button>
        <button type="button" role="tab" aria-selected={view === "payroll"} onClick={() => setView("payroll")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${view === "payroll" ? "bg-foreground text-background" : "text-muted-foreground"}`} data-testid="tab-dispatch-payroll"><Wallet size={13} /> Ежедневные наряды</button>
      </div>

      {view === "payroll" ? <PayrollRegisterWorkspace canManage sourceGroup="brigade" /> : view === "chemicals" ? <ChemicalConsumptionSection onSaved={setNotice} /> : (
        <div className="space-y-5">
        <section className="surface-card p-4 sm:p-5" data-testid="section-dispatch-active">
          <header><p className="eyebrow">Выполняемые полевые работы</p><h2 className="mt-1 text-lg font-bold">Площадь за день и завершение</h2><p className="mt-1 text-xs text-muted-foreground">Механизатор, техника и агрегат берутся из текущих сведений агронома. Завершение подтверждает агроном.</p></header>
          {fieldsQuery.isLoading ? <div className="skeleton mt-3 h-24 rounded-xl" /> : fieldsQuery.isError ? <ErrorPanel message={errorInfo(fieldsQuery.error).message} onRetry={() => void fieldsQuery.refetch()} testId="dispatch-active-error" /> : <DispatcherActiveWorks items={fieldOperations} onSaved={setNotice} />}
        </section>
        <section className="surface-card p-4 sm:p-5" data-testid="section-dispatch-fields">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="eyebrow">Завершённые полевые работы</p><h2 className="mt-1 text-lg font-bold">Фактическая ставка и сумма</h2></div>
            <button type="button" className="button button-secondary text-xs" onClick={() => void fieldsQuery.refetch()} disabled={fieldsQuery.isFetching} data-testid="button-refresh-dispatch-fields">Обновить</button>
          </header>
          {fieldsQuery.isLoading ? <p className="py-8 text-center text-xs text-muted-foreground">Загружаем выполненные работы…</p>
            : fieldsQuery.isError ? <ErrorPanel message={errorInfo(fieldsQuery.error).message} onRetry={() => void fieldsQuery.refetch()} testId="dispatch-fields-error" />
              : completedFields.length === 0 ? <EmptyPanel title="Завершённых работ пока нет" detail="Когда агроном подтвердит завершение, работа появится здесь для расценки." testId="dispatch-fields-empty" />
                : <ul className="mt-3 divide-y divide-border">{completedFields.map((operation) => <FieldOperationRow key={operation.id} operation={operation} onSaved={() => setNotice(`Фактическая ставка по полю №${operation.fieldNumber} сохранена.`)} />)}</ul>}
        </section>
        </div>
      )}
    </div>
  );
}

function FieldOperationRow({ operation, onSaved }: { operation: FieldDispatchItem; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateFieldDispatchRate();
  const [rate, setRate] = useState(operation.actualRatePerHa === null ? "" : String(operation.actualRatePerHa));
  const [error, setError] = useState("");
  useEffect(() => setRate(operation.actualRatePerHa === null ? "" : String(operation.actualRatePerHa)), [operation.id, operation.actualRatePerHa]);
  const parsedRate = parseRate(rate);
  const reports = operation.operation?.progressReports ?? [];
  const dailyRated = reports.length > 0 && reports.every(r => r.actualRatePerHa != null);
  const amount = reports.length > 0
    ? reports.some(r => r.actualRatePerHa == null && parsedRate === null) ? null
      : reports.reduce((total, r) => total + Math.round(r.dailyAreaHa * (r.actualRatePerHa ?? parsedRate ?? 0) * 100), 0) / 100
    : parsedRate === null ? null : Math.round((operation.actualAreaHa * parsedRate + Number.EPSILON) * 100) / 100;
  const save = async () => {
    if (parsedRate === null) { setError("Укажите положительную расценку за гектар."); return; }
    setError("");
    try {
      await mutation.mutateAsync({ id: operation.id, data: { version: operation.version, ratePerHa: parsedRate } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetFieldDispatchQueueQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetFieldDashboardQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListPayrollAccrualsQueryKey() }),
      ]);
      onSaved();
    } catch (err) { setError(errorInfo(err).message); }
  };
  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" data-testid={`dispatch-field-row-${operation.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">Поле №{operation.fieldNumber} · {operation.operationName}</strong><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">{operation.cropName} · {operation.year}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">Завершено {dateFmt(operation.actualEnd)} · {operation.actualAreaHa.toLocaleString("ru-RU")} га · плановая ставка {money(operation.plannedRatePerHa)}/га</p>
        <p className="mt-1 text-xs font-semibold">{operation.actualMechanic} · {operation.actualEquipment}{operation.actualImplement ? ` · ${operation.actualImplement}` : ""}</p>
        {operation.actualRateSetBy && <p className="mt-1 text-[10px] text-muted-foreground">Ставку внёс {operation.actualRateSetBy}{operation.actualRateSetAt ? ` · ${dateFmt(operation.actualRateSetAt)}` : ""}</p>}
      </div>
      {dailyRated ? <div className="text-right text-xs"><p className="text-muted-foreground">Сумма по дневным ставкам</p><strong className="font-mono">{money(amount ?? 0)}</strong></div> : <RateEditor
        value={rate}
        onChange={setRate}
        amount={amount}
        unitLabel="₸/га"
        pending={mutation.isPending}
        error={error}
        onSave={() => void save()}
        testId={`dispatch-field-rate-${operation.id}`}
      />}
    </li>
  );
}

function RateEditor({ value, onChange, amount, unitLabel, pending, error, onSave, testId }: {
  value: string;
  onChange: (value: string) => void;
  amount: number | null;
  unitLabel: string;
  pending: boolean;
  error: string;
  onSave: () => void;
  testId: string;
}) {
  return (
    <div className="w-full shrink-0 lg:w-[260px]">
      <div className="flex items-end gap-2">
        <label className="form-label flex-1" htmlFor={`${testId}-input`}>Фактическая расценка<input id={`${testId}-input`} type="number" min="0.01" step="0.01" className="text-input mt-1 font-mono" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`${testId}-input`} /></label>
        <button type="button" className="button button-primary shrink-0 text-xs" onClick={onSave} disabled={pending} data-testid={`${testId}-save`}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
      <p className="mt-1 text-right text-[10px] text-muted-foreground">{amount === null ? "Введите расценку" : `${unitLabel} · сумма ${money(amount)}`}</p>
      {error && <p className="mt-1 text-right text-[10px] font-semibold text-destructive" role="alert" data-testid={`${testId}-error`}>{error}</p>}
    </div>
  );
}

function ErrorPanel({ message, onRetry, testId }: { message: string; onRetry: () => void; testId: string }) {
  return <div className="py-8 text-center" role="alert" data-testid={testId}><p className="text-xs text-destructive">{message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={onRetry}>Повторить</button></div>;
}

function EmptyPanel({ title, detail, testId }: { title: string; detail: string; testId: string }) {
  return <div className="flex flex-col items-center py-10 text-center" data-testid={testId}><Banknote size={22} className="text-muted-foreground" /><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{detail}</p></div>;
}
