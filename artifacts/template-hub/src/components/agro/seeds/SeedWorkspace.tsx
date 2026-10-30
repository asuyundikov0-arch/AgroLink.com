import { type ReactNode, useMemo, useState } from "react";
import { Check, Coins, Plus, RefreshCw, Sprout, Wheat } from "lucide-react";
import { getGetSeedWarehouseQueryKey, useGetSeedWarehouse, type GrainBalance as GrainBalanceRow, type GrainCrop, type GrainLocation } from "@workspace/api-client-react";
import { UNITS, type Unit, canRecord, canReview, dateFmt, errorInfo } from "../grain/shared";
import SeedForm from "./SeedForm";
import SeedJournal from "./SeedJournal";
import { SEED_POLL_MS, kzt, tn } from "./shared";

export default function SeedWorkspace({ role, enabled, crops, locations, balances, asOfDate }: { role: string; enabled: boolean; crops: GrainCrop[]; locations: GrainLocation[]; balances: GrainBalanceRow[]; asOfDate: string }) {
  const q = useGetSeedWarehouse({ query: { queryKey: getGetSeedWarehouseQueryKey(), enabled, refetchInterval: SEED_POLL_MS } });
  const [unit, setUnit] = useState<Unit | "all">("all");
  const [crop, setCrop] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const d = q.data;
  const ok = (u: string, c: number) => (unit === "all" || u === unit) && (crop === "all" || String(c) === crop);
  const stocks = useMemo(() => (d?.stocks ?? []).filter((s) => ok(s.unit, s.cropId)), [d, unit, crop]); // eslint-disable-line react-hooks/exhaustive-deps
  const movements = useMemo(() => (d?.movements ?? []).filter((m) => ok(m.unit, m.cropId)), [d, unit, crop]); // eslint-disable-line react-hooks/exhaustive-deps
  const grouped = useMemo(() => {
    const m = new Map<number, { name: string; tons: number; amount: number; rows: typeof stocks }>();
    for (const s of stocks) { const g = m.get(s.cropId) ?? { name: s.cropName, tons: 0, amount: 0, rows: [] }; g.tons += s.quantityTons; g.amount += s.amount; g.rows.push(s); m.set(s.cropId, g); }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "ru"));
  }, [stocks]);
  const total = grouped.reduce((a, [, g]) => ({ t: a.t + g.tons, k: a.k + g.amount }), { t: 0, k: 0 });
  const pending = movements.filter((m) => m.approvalStatus === "pending").length;
  const placeName = (id: number | null) => (id === null ? "—" : locations.find((l) => l.id === id)?.name ?? `#${id}`);

  if (q.isLoading) return <div className="space-y-3" data-testid="status-seed-loading"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[84px] rounded-xl" />)}</div><div className="skeleton h-48 rounded-xl" /></div>;
  if (q.isError || !d) return <div className="surface-card empty-state" data-testid="status-seed-error"><h3 className="text-sm font-bold">Склад семян не загрузился</h3><p className="mt-1 text-xs text-muted-foreground">{errorInfo(q.error).message}</p><button type="button" className="button button-secondary mt-4" onClick={() => q.refetch()} data-testid="button-seed-retry">Повторить</button></div>;

  return (
    <div className="space-y-4" data-testid="section-seed-warehouse">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Склад семян · один на хозяйство</p>
          <p className="mt-1 text-xs text-muted-foreground">На {dateFmt(d.asOfDate)} · несогласованные записи не меняют остатки и затраты
            {q.isFetching && <span className="ml-2 inline-flex items-center gap-1 text-[hsl(203_87%_45%)]"><RefreshCw size={11} className="animate-spin" />синхронизация</span>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Хозяйство" className="text-input !w-auto" value={unit} onChange={(e) => setUnit(e.target.value as Unit | "all")} data-testid="select-seed-filter-unit"><option value="all">Все хозяйства</option>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          <select aria-label="Культура" className="text-input !w-auto" value={crop} onChange={(e) => setCrop(e.target.value)} data-testid="select-seed-filter-crop"><option value="all">Все культуры</option>{crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {canRecord(role) && <button type="button" className="button button-primary" onClick={() => setFormOpen(true)} data-testid="button-new-seed-movement"><Plus size={14} />Операция с семенами</button>}
        </div>
      </div>
      {notice && <p className="notice-banner" role="status" data-testid="text-seed-notice"><Check size={15} />{notice}</p>}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat icon={<Sprout size={16} />} label="Семян на складе" value={tn(total.t)} sub={`${grouped.length} культур`} testId="text-seed-total-tons" />
        <Stat icon={<Coins size={16} />} label="Стоимость" value={kzt(total.k)} sub={total.t > 0 ? `в среднем ${kzt(total.k / total.t)}/т` : "склад пуст"} testId="text-seed-total-kzt" />
        <Stat icon={<Wheat size={16} />} label="Ждут согласования" value={String(pending)} sub="не учтены в остатке" testId="text-seed-pending" />
      </section>
      <section className="surface-card" data-testid="section-seed-stocks">
        <h3 className="border-b border-border px-4 py-3 text-sm font-bold">Остатки по культурам</h3>
        {grouped.length === 0 ? <div className="empty-state !min-h-[140px]" data-testid="status-seed-stocks-empty"><p className="text-sm font-bold">Семян нет</p><p className="mt-1 text-xs text-muted-foreground">Оприходуйте покупку или переведите зерно в семена.</p></div> : (
          <ul className="divide-y divide-border/70">{grouped.map(([id, g]) => (
            <li key={id} className="px-4 py-3" data-testid={`row-seed-stock-${id}`}>
              <div className="flex items-baseline justify-between gap-3"><span className="text-sm font-bold">{g.name}</span><span className="font-mono text-sm font-bold">{tn(g.tons)} · {kzt(g.amount)}</span></div>
              <div className="mt-1 space-y-0.5">{g.rows.map((s) => <div key={s.unit} className="flex justify-between gap-2 text-[11px] text-muted-foreground"><span>{s.unit}</span><span className="font-mono">{tn(s.quantityTons)} · {kzt(s.amount)} · {kzt(s.pricePerTon)}/т</span></div>)}</div>
            </li>))}</ul>
        )}
      </section>
      <SeedJournal movements={movements} canReview={canReview(role)} placeName={placeName} />
      {formOpen && <SeedForm role={role} crops={crops} locations={locations} balances={balances} stocks={d.stocks} asOfDate={asOfDate} defaultUnit={unit === "all" ? UNITS[0] : unit} onClose={() => setFormOpen(false)} onDone={setNotice} />}
    </div>
  );
}

function Stat({ icon, label, value, sub, testId }: { icon: ReactNode; label: string; value: string; sub: string; testId: string }) {
  return <div className="surface-card min-w-0 p-3.5"><div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">{icon}{label}</div><p className="mt-2 truncate font-mono text-lg font-bold" data-testid={testId}>{value}</p><p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{sub}</p></div>;
}
