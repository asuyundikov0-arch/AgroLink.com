import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type FleetEquipment, type RepairExpense } from "@workspace/api-client-react";
import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_ORDER, addMoney, fleetLabel, kztCompact, money } from "./shared";

const TOP_N = 10;
type Cat = RepairExpense["category"];

export default function CostOverview({ expenses, fleetById, planFleetIds }: { expenses: RepairExpense[]; fleetById: Map<number, FleetEquipment>; planFleetIds: Set<number> }) {
  const { totals, rows, machines, outsidePlan } = useMemo(() => {
    const totals: Record<Cat, number> = { capital: 0, current: 0, tires: 0, oils: 0, service: 0 };
    const per = new Map<number, Record<Cat, number> & { total: number }>();
    for (const e of expenses) {
      totals[e.category] = addMoney(totals[e.category], e.amount);
      const r = per.get(e.fleetId) ?? { capital: 0, current: 0, tires: 0, oils: 0, service: 0, total: 0 };
      r[e.category] = addMoney(r[e.category], e.amount); r.total = addMoney(r.total, e.amount); per.set(e.fleetId, r);
    }
    const all = [...per].map(([id, r]) => { const f = fleetById.get(id); return { ...r, name: f ? fleetLabel(f) : `Техника №${id}` }; }).sort((a, b) => b.total - a.total);
    return { totals, rows: all.slice(0, TOP_N), machines: all.length, outsidePlan: [...per.keys()].filter((id) => !planFleetIds.has(id)).length };
  }, [expenses, fleetById, planFleetIds]);
  const currentTotal = [totals.current, totals.tires, totals.oils, totals.service].reduce(addMoney, 0);
  const grand = addMoney(currentTotal, totals.capital);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
      <div className="surface-card p-4 sm:p-5">
        <h2 className="text-sm font-bold">Затраты по технике, ₸</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">По журналу затрат, включая технику вне плана{outsidePlan ? ` (${outsidePlan})` : ""}. {machines > TOP_N ? `Показаны ${TOP_N} крупнейших из ${machines}.` : `Машин с затратами: ${machines}.`}</p>
        {rows.length === 0 ? <p className="py-14 text-center text-xs text-muted-foreground" data-testid="status-chart-empty">Затраты ещё не внесены.</p> : (
          <div style={{ height: Math.max(180, rows.length * 38 + 70) }} className="mt-3" data-testid="chart-repair-costs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke="hsl(205 21% 90%)" />
                <XAxis type="number" domain={[0, "auto"]} tickFormatter={(v: number) => kztCompact.format(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(203 55% 96%)" }} formatter={(v: number, n: string) => [money(v), n]} labelStyle={{ fontWeight: 700 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {CATEGORY_ORDER.map((c) => <Bar key={c} dataKey={c} name={CATEGORY_LABEL[c]} stackId="cost" fill={CATEGORY_COLOR[c]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="surface-card p-4 sm:p-5" data-testid="card-cost-structure">
        <h2 className="text-sm font-bold">Структура затрат</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Шины, масла и сервис входят в текущий ремонт.</p>
        <dl className="mt-4 space-y-2.5 text-xs">
          <Row label="Текущий ремонт, всего" value={money(currentTotal)} swatch={CATEGORY_COLOR.current} testId="text-cost-current" />
          <div className="ml-4 space-y-1.5 border-l border-border pl-3 text-muted-foreground">
            <Row label="прочее" value={money(totals.current)} />
            <Row label="шины" value={money(totals.tires)} />
            <Row label="масла" value={money(totals.oils)} />
            <Row label="сервис" value={money(totals.service)} />
          </div>
          <Row label="Капитальный ремонт" value={money(totals.capital)} swatch={CATEGORY_COLOR.capital} testId="text-cost-capital" />
          <div className="border-t border-border pt-2.5"><Row label="Итого" value={money(grand)} strong testId="text-cost-total" /></div>
        </dl>
      </div>
    </section>
  );
}

function Row({ label, value, swatch, strong, testId }: { label: string; value: string; swatch?: string; strong?: boolean; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-bold" : "flex items-center gap-2"}>{swatch && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />}{label}</dt>
      <dd className={strong ? "font-mono font-bold" : "font-mono"} data-testid={testId}>{value}</dd>
    </div>
  );
}
