import { type ReactNode, useMemo, useState } from "react";
import { AlertTriangle, Gauge, RefreshCw, Wallet, Wrench } from "lucide-react";
import {
  getListEngineeringRepairsQueryKey,
  getListFleetEquipmentQueryKey,
  getListRepairExpensesQueryKey,
  useListEngineeringRepairs,
  useListFleetEquipment,
  useListRepairExpenses,
} from "@workspace/api-client-react";
import CostOverview from "./repairs/CostOverview";
import ExpenseLedger from "./repairs/ExpenseLedger";
import FleetDirectory from "./repairs/FleetDirectory";
import PlanRegister from "./repairs/PlanRegister";
import SparePartsWarehouse from "./SparePartsWarehouse";
import { POLL_MS, SectionError, UNITS, type UnitFilter, addMoney, cx, dateFmt, effReadiness, errorInfo, money, num } from "./repairs/shared";

type View = "plan" | "warehouse" | "expenses" | "fleet";

export default function RepairDashboard({ role }: { role: string }) {
  const [unit, setUnit] = useState<UnitFilter>("all");
  const [view, setView] = useState<View>("plan");
  const fleetQ = useListFleetEquipment({ query: { queryKey: getListFleetEquipmentQueryKey(), refetchInterval: POLL_MS } });
  const planQ = useListEngineeringRepairs(undefined, { query: { queryKey: getListEngineeringRepairsQueryKey(), refetchInterval: POLL_MS } });
  const expQ = useListRepairExpenses(undefined, { query: { queryKey: getListRepairExpensesQueryKey(), refetchInterval: POLL_MS } });

  const fleetAll = useMemo(() => fleetQ.data ?? [], [fleetQ.data]);
  const fleetById = useMemo(() => new Map(fleetAll.map((f) => [f.id, f])), [fleetAll]);
  const inUnit = (fleetId: number, fallback?: string) => unit === "all" || (fleetById.get(fleetId)?.unit ?? fallback) === unit;

  const fleet = useMemo(() => fleetAll.filter((f) => unit === "all" || f.unit === unit), [fleetAll, unit]);
  const planAll = useMemo(() => planQ.data?.items ?? [], [planQ.data]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planAll.filter((e) => inUnit(e.fleetId, e.unit)), [planAll, unit, fleetById]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expenses = useMemo(() => (expQ.data ?? []).filter((e) => inUnit(e.fleetId)), [expQ.data, unit, fleetById]);
  const planFleetIdsAll = useMemo(() => new Set(planAll.map((e) => e.fleetId)), [planAll]);
  const available = useMemo(() => fleet.filter((f) => !planFleetIdsAll.has(f.id)), [fleet, planFleetIdsAll]);
  const costByFleet = useMemo(() => {
    const m = new Map<number, { total: number; capital: number; current: number }>();
    for (const e of expenses) { const r = m.get(e.fleetId) ?? { total: 0, capital: 0, current: 0 }; r.total = addMoney(r.total, e.amount); if (e.category === "capital") r.capital = addMoney(r.capital, e.amount); else r.current = addMoney(r.current, e.amount); m.set(e.fleetId, r); }
    return m;
  }, [expenses]);

  const kpi = useMemo(() => {
    const by = { planned: 0, in_progress: 0, overdue: 0, completed: 0 };
    const ready: number[] = [];
    for (const e of plan) { by[e.status] += 1; const r = effReadiness(e); if (r !== null) ready.push(r); }
    const total = expenses.reduce((s, e) => addMoney(s, e.amount), 0);
    return { by, avg: ready.length ? ready.reduce((a, b) => a + b, 0) / ready.length : null, readyCount: ready.length, total };
  }, [plan, expenses]);

  const loading = fleetQ.isLoading || planQ.isLoading || expQ.isLoading;
  const failed = [fleetQ, planQ, expQ].find((q) => q.isError);
  const fetching = fleetQ.isFetching || planQ.isFetching || expQ.isFetching;

  return (
    <div className="space-y-5" data-testid="repair-dashboard">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Инженерная служба · ремонт техники</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Ремонты и готовность</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {planQ.data ? <>Данные на {dateFmt(planQ.data.asOfDate)} · суммы в тенге · обновление каждые 30 с</> : "План, затраты и справочник техники"}
            {fetching && !loading && <span className="ml-2 inline-flex items-center gap-1 text-[hsl(203_87%_33%)]"><RefreshCw size={11} className="animate-spin" />синхронизация</span>}
          </p>
        </div>
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Хозяйство">
          {(["all", ...UNITS] as const).map((u, i) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} data-testid={`tab-repair-unit-${u === "all" ? "all" : i - 1}`}
              className={cx("rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors", unit === u ? "bg-[hsl(203_87%_33%)] text-white" : "text-muted-foreground hover:text-foreground")}>
              {u === "all" ? "Все хозяйства" : u}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="space-y-4" data-testid="status-loading">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[92px] rounded-xl" />)}</div>
          <div className="skeleton h-64 rounded-xl" /><div className="skeleton h-48 rounded-xl" />
        </div>
      ) : failed ? (
        <div className="surface-card"><SectionError testId="status-error" text={errorInfo(failed.error).message} onRetry={() => { fleetQ.refetch(); planQ.refetch(); expQ.refetch(); }} /></div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Сводка">
            <Kpi icon={<Wrench size={16} />} label="Техники в плане" value={String(plan.length)} sub={`${kpi.by.in_progress} в работе · ${kpi.by.completed} завершено`} testId="text-kpi-plan" />
            <Kpi icon={<AlertTriangle size={16} />} label="Просрочено" value={String(kpi.by.overdue)} sub={`${kpi.by.planned} запланировано`} danger={kpi.by.overdue > 0} testId="text-kpi-overdue" />
            <Kpi icon={<Wallet size={16} />} label="Затраты всего" value={expenses.length ? money(kpi.total) : "—"} sub={`${expenses.length} записей журнала, вкл. технику вне плана`} mono testId="text-kpi-cost" />
            <Kpi icon={<Gauge size={16} />} label="Средняя готовность" value={kpi.avg === null ? "—" : `${num(Math.round(kpi.avg * 10) / 10)}%`} sub={`по ${kpi.readyCount} из ${plan.length}; завершённые = 100%`} mono testId="text-kpi-readiness" />
          </section>

          <CostOverview expenses={expenses} fleetById={fleetById} planFleetIds={planFleetIdsAll} />

          <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Раздел">
            {([["plan", "План ремонта"], ["warehouse", "Склад запчастей"], ["expenses", "Затраты на ремонт"], ["fleet", "Справочник техники"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`tab-repair-view-${k}`}
                className={cx("rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors", view === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{l}</button>
            ))}
          </div>

          {view === "plan" && <PlanRegister role={role} items={plan} fleetById={fleetById} available={available} costByFleet={costByFleet} />}
          {view === "warehouse" && <SparePartsWarehouse role={role} fleet={fleet} fleetById={fleetById} />}
          {view === "expenses" && <ExpenseLedger role={role} expenses={expenses} fleet={fleet} fleetById={fleetById} />}
          {view === "fleet" && <FleetDirectory role={role} fleet={fleet} plan={planAll} expenses={expQ.data ?? []} />}
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, danger, mono, testId }: { icon: ReactNode; label: string; value: string; sub: string; danger?: boolean; mono?: boolean; testId: string }) {
  return (
    <div className="surface-card p-3.5 sm:p-4">
      <div className={cx("flex items-center gap-2 text-[11px] font-semibold", danger ? "text-destructive" : "text-muted-foreground")}>{icon}{label}</div>
      <p className={cx("mt-2 truncate text-xl font-bold tracking-[-0.03em]", mono && "font-mono text-lg", danger && "text-destructive")} title={value} data-testid={testId}>{value}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}
