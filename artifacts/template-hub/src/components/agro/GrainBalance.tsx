import { type ReactNode, useMemo, useState } from "react";
import { ArrowLeftRight, Check, Droplets, Flame, Plus, Trash2, RefreshCw, ShoppingCart, Sprout, Warehouse } from "lucide-react";
import { getGetGrainDashboardQueryKey, useGetGrainDashboard } from "@workspace/api-client-react";
import Directory from "./grain/Directory";
import Journal from "./grain/Journal";
import MovementForm from "./grain/MovementForm";
import ApprovalQueue from "./grain/ApprovalQueue";
import SeedWorkspace from "./seeds/SeedWorkspace";
import ProcessingPanel from "./grain/ProcessingPanel";
import StockOverview, { type Cell } from "./grain/StockOverview";
import { POLL_MS, UNITS, type Unit, canManageDir, canRead, canRecord, canReview, cx, dateFmt, errorInfo, isProcessor, kg, n0, type StockKind, tonsKg } from "./grain/shared";

type View = "seeds" | "stock" | "processing" | "journal" | "directory" | "approval";

export default function GrainBalance({ role }: { role: string }) {
  const allowed = canRead(role);
  const [unit, setUnit] = useState<Unit | "all">("all");
  const [cropF, setCropF] = useState("all");
  const [view, setView] = useState<View>("stock");
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const q = useGetGrainDashboard({ query: { queryKey: getGetGrainDashboardQueryKey(), refetchInterval: POLL_MS, enabled: allowed } });
  const d = q.data;
  const crops = useMemo(() => d?.crops ?? [], [d]);
  const locations = useMemo(() => d?.locations ?? [], [d]);
  const okU = (u: string) => unit === "all" || u === unit;
  const okC = (c: number) => cropF === "all" || String(c) === cropF;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fBal = useMemo(() => (d?.balances ?? []).filter((b) => okU(b.unit) && okC(b.cropId)), [d, unit, cropF]);
  const cells: Cell[] = useMemo(() => fBal.filter((b) => (b.stockKind ?? "grain") === "grain").map((b) => ({ cropId: b.cropId, locationId: b.locationId, kg: kg(b.quantityTons) })), [fBal]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const movements = useMemo(() => (d?.movements ?? []).filter((m) => okU(m.unit) && okC(m.cropId)), [d, unit, cropF]);
  const postedMovements = useMemo(() => movements.filter((m) => m.approvalStatus === "approved"), [movements]);
  const kpi = useMemo(() => {
    const live = postedMovements.filter((m) => !m.voidedAt);
    const sum = (op: string) => live.filter((m) => m.operation === op).reduce((s, m) => s + kg(m.quantityTons), 0);
    const grainOnly = (op: string) => live.filter((m) => m.operation === op && (m.stockKind ?? "grain") === "grain").reduce((s, m) => s + kg(m.quantityTons), 0);
    const proc = live.filter((m) => m.operation === "drying" || m.operation === "cleaning");
    const kindOf = (id: number) => locations.find((l) => l.id === id)?.kind ?? "warehouse";
    return { total: cells.reduce((s, c) => s + c.kg, 0), opening: grainOnly("opening"), receipt: sum("receipt"), sale: grainOnly("sale"), transfer: grainOnly("transfer"),
      inProc: cells.filter((c) => isProcessor(kindOf(c.locationId))).reduce((s, c) => s + c.kg, 0),
      waste: fBal.filter((b) => b.stockKind === "grain_waste").reduce((s, b) => s + kg(b.quantityTons), 0),
      dead: proc.reduce((s, m) => s + kg(n0(m.deadWasteTons)), 0), moist: proc.reduce((s, m) => s + kg(n0(m.moistureLossTons)), 0) };
  }, [postedMovements, cells, fBal, locations]);
  const stock = (u: string, c: number, l: number, k: StockKind) => (d?.balances ?? []).filter((b) => b.unit === u && b.cropId === c && b.locationId === l && (b.stockKind ?? "grain") === k).reduce((s, b) => s + kg(b.quantityTons), 0);

  if (!allowed) return (
    <div className="surface-card empty-state" data-testid="status-grain-forbidden"><h3 className="text-sm font-bold">Нет доступа к учёту зерна</h3>
      <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Раздел доступен агроному, главному агроному, заведующему током, весовщице и генеральному директору.</p></div>
  );

  return (
    <div className="space-y-5" data-testid="grain-balance">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Агрономия · зерно в наличии</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Баланс зерна</h1>
          <p className="mt-1 text-xs text-muted-foreground">{d ? <>На {dateFmt(d.asOfDate)} · тонны, точность до кг · обновление каждые 30 с</> : "Приход, размещение, перемещения и продажи"}
            {q.isFetching && !q.isLoading && <span className="ml-2 inline-flex items-center gap-1 text-[hsl(203_87%_33%)]"><RefreshCw size={11} className="animate-spin" />синхронизация</span>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Хозяйство" className="text-input !w-auto" value={unit} onChange={(e) => setUnit(e.target.value as Unit | "all")} data-testid="select-grain-unit"><option value="all">Все хозяйства</option>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          <select aria-label="Культура" className="text-input !w-auto" value={cropF} onChange={(e) => setCropF(e.target.value)} data-testid="select-grain-crop"><option value="all">Все культуры</option>{crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {canRecord(role) && d && <button type="button" className="button button-primary" onClick={() => setFormOpen(true)} data-testid="button-new-movement"><Plus size={14} />Операция</button>}
        </div>
      </header>

      {q.isLoading ? (
        <div className="space-y-4" data-testid="status-loading"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[92px] rounded-xl" />)}</div><div className="skeleton h-64 rounded-xl" /></div>
      ) : q.isError || !d ? (
        <div className="surface-card empty-state" data-testid="status-error"><h3 className="text-sm font-bold">Не удалось загрузить</h3><p className="mt-1 text-xs text-muted-foreground">{errorInfo(q.error).message}</p>
          <button type="button" className="button button-secondary mt-4" onClick={() => q.refetch()} data-testid="button-retry">Повторить</button></div>
      ) : (
        <>
          {notice && <p className="notice-banner" role="status" data-testid="text-grain-notice"><Check size={15} />{notice}</p>}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Сводка">
            <Kpi icon={<Warehouse size={16} />} label="Остаток всего" value={tonsKg(kpi.total)} sub={`зерно, вкл. элеватор · в обработке ${tonsKg(kpi.inProc)}`} testId="text-kpi-total" />
            <Kpi icon={<Sprout size={16} />} label="Приход с полей" value={tonsKg(kpi.receipt)} sub={`нач. остаток ${tonsKg(kpi.opening)}`} testId="text-kpi-receipt" />
            <Kpi icon={<ArrowLeftRight size={16} />} label="Перемещено" value={tonsKg(kpi.transfer)} sub="не меняет общий остаток" testId="text-kpi-transfer" />
            <Kpi icon={<ShoppingCart size={16} />} label="Продано" value={tonsKg(kpi.sale)} sub="уменьшает остаток" testId="text-kpi-sale" />
            <Kpi icon={<Flame size={16} />} label="В обработке" value={tonsKg(kpi.inProc)} sub="на сушилках и очистках" testId="text-kpi-inprocessing" />
            <Kpi icon={<Sprout size={16} />} label="Зерновые отходы" value={tonsKg(kpi.waste)} sub="отдельно, не в остатке зерна" testId="text-kpi-grain-waste" />
            <Kpi icon={<Trash2 size={16} />} label="Мёртвый сор" value={tonsKg(kpi.dead)} sub="списано нарастающим итогом" testId="text-kpi-dead-waste" />
            <Kpi icon={<Droplets size={16} />} label="Усушка" value={tonsKg(kpi.moist)} sub="влага нарастающим итогом" testId="text-kpi-moisture" />
          </section>
          {!canRecord(role) && <p className="text-[11px] text-muted-foreground" data-testid="text-readonly">Режим просмотра: ваша роль не вносит операции.</p>}
          <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Раздел">
            {([["stock", "Остатки"], ["processing", "Обработка и отходы"], ["journal", "Журнал"], ["seeds", "Склад семян"], ["directory", "Справочники"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`tab-grain-${k}`}
                className={cx("rounded-md px-3 py-1.5 text-[11px] font-bold", view === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{l}</button>
            ))}
            {canReview(role) && <button type="button" role="tab" aria-selected={view === "approval"} onClick={() => setView("approval")} data-testid="tab-grain-approval"
              className={cx("rounded-md px-3 py-1.5 text-[11px] font-bold", view === "approval" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>Согласование ({movements.filter((m) => m.approvalStatus === "pending" && !m.voidedAt && m.operation !== "seed_transfer").length})</button>}
          </div>
          {view === "stock" && <StockOverview cells={cells} crops={crops} locations={locations} />}
          {view === "processing" && <ProcessingPanel balances={fBal} movements={postedMovements} crops={crops} locations={locations} />}
          {view === "journal" && <Journal role={role} movements={movements} crops={crops} locations={locations} />}
          {view === "seeds" && <SeedWorkspace role={role} enabled={allowed} crops={crops} locations={locations} balances={d.balances ?? []} asOfDate={d.asOfDate.slice(0, 10)} />}
          {view === "directory" && <Directory crops={crops} locations={locations} canEdit={canManageDir(role)} />}
          {view === "approval" && canReview(role) && <ApprovalQueue movements={movements} crops={crops} locations={locations} />}
          {formOpen && <MovementForm role={role} crops={crops} locations={locations} stock={stock} asOfDate={d.asOfDate.slice(0, 10)} defaultUnit={unit === "all" ? UNITS[0] : unit} onClose={() => setFormOpen(false)} onDone={setNotice} />}
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, testId }: { icon: ReactNode; label: string; value: string; sub: string; testId: string }) {
  return (
    <div className="surface-card min-w-0 p-3.5 sm:p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">{icon}{label}</div>
      <p className="mt-2 truncate font-mono text-lg font-bold" title={value} data-testid={testId}>{value}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}
