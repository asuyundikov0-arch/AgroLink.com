import { type ReactNode } from "react";
import { Check, Coins, Sprout } from "lucide-react";
import { type SeedMovement, type SeedStock } from "@workspace/api-client-react";
import { kzt, tn } from "./shared";

export function SeedKpis({ stocks, movements, loading, failed, onRetry }: {
  stocks: SeedStock[]; movements: SeedMovement[]; loading: boolean; failed: boolean; onRetry: () => void;
}) {
  if (loading) return <>{[0, 1, 2].map(i => <div key={i} className="skeleton h-[92px] rounded-xl" data-testid={`status-seed-summary-loading-${i}`} />)}</>;
  if (failed) return <div className="surface-card p-4 text-xs" data-testid="status-seed-error"><p>Данные семян не загрузились. Остальные показатели доступны.</p><button type="button" className="button button-secondary mt-2" onClick={onRetry}>Повторить</button></div>;
  const total = stocks.reduce((sum, s) => ({ tons: sum.tons + s.quantityTons, amount: sum.amount + s.amount }), { tons: 0, amount: 0 });
  return <>
    <Stat icon={<Sprout size={16} />} label="Семена на складе" value={tn(total.tons)} sub="отдельно от товарного зерна" testId="text-seed-total-tons" />
    <Stat icon={<Coins size={16} />} label="Стоимость семян" value={kzt(total.amount)} sub={total.tons > 0 ? `в среднем ${kzt(total.amount / total.tons)}/т` : "склад семян пуст"} testId="text-seed-total-kzt" />
    <Stat icon={<Check size={16} />} label="Семена: на согласовании" value={String(movements.filter(m => m.approvalStatus === "pending").length)} sub="не включены в остатки" testId="text-seed-pending" />
  </>;
}

export function SeedStockOverview({ stocks }: { stocks: SeedStock[] }) {
  const groups = new Map<number, { name: string; tons: number; amount: number; rows: SeedStock[] }>();
  for (const s of stocks) {
    const group = groups.get(s.cropId) ?? { name: s.cropName, tons: 0, amount: 0, rows: [] };
    group.tons += s.quantityTons; group.amount += s.amount; group.rows.push(s); groups.set(s.cropId, group);
  }
  return <section className="surface-card" data-testid="section-seed-stocks">
    <h3 className="border-b border-border px-4 py-3 text-sm font-bold">Семена по культурам</h3>
    {!groups.size ? <div className="px-4 py-5 text-xs text-muted-foreground" data-testid="status-seed-stocks-empty">Семян нет. Приход и выдача доступны через общую кнопку «Операция» → «Семена».</div> :
      <ul className="divide-y divide-border/70">{[...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "ru")).map(([id, group]) =>
        <li key={id} className="px-4 py-3" data-testid={`row-seed-stock-${id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-bold">{group.name}</span><span className="font-mono text-sm font-bold">{tn(group.tons)} · {kzt(group.amount)}</span></div>
          {group.rows.map(s => <div key={s.unit} className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground"><span>{s.unit}</span><span className="font-mono">{tn(s.quantityTons)} · {kzt(s.amount)} · {kzt(s.pricePerTon)}/т</span></div>)}
        </li>)}</ul>}
  </section>;
}

function Stat({ icon, label, value, sub, testId }: { icon: ReactNode; label: string; value: string; sub: string; testId: string }) {
  return <div className="surface-card min-w-0 p-3.5 sm:p-4"><div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">{icon}{label}</div><p className="mt-2 truncate font-mono text-lg font-bold" title={value} data-testid={testId}>{value}</p><p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{sub}</p></div>;
}
