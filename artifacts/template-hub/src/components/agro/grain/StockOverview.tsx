import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GrainCrop, GrainLocation } from "@workspace/api-client-react";
import { CROP_COLORS, KIND_LABEL, KIND_ORDER, tonsKg } from "./shared";

export type Cell = { cropId: number; locationId: number; kg: number };

export default function StockOverview({ cells, crops, locations }: { cells: Cell[]; crops: GrainCrop[]; locations: GrainLocation[] }) {
  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const cropIds = useMemo(() => crops.filter((c) => cells.some((x) => x.cropId === c.id && x.kg !== 0)), [crops, cells]);
  const locRows = useMemo(() => locations.filter((l) => cells.some((x) => x.locationId === l.id && x.kg !== 0))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name)), [locations, cells]);
  const get = (c: number, l: number) => cells.filter((x) => x.cropId === c && x.locationId === l).reduce((s, x) => s + x.kg, 0);
  const chart = locRows.map((l) => {
    const row: Record<string, string | number> = { name: `${l.name} (${l.unit.split(" ")[0]})` };
    for (const c of cropIds) row[`c${c.id}`] = get(c.id, l.id) / 1000;
    return row;
  });
  const color = (id: number) => CROP_COLORS[crops.findIndex((c) => c.id === id) % CROP_COLORS.length];
  const byKind = KIND_ORDER.map((k) => ({ k, kg: cells.filter((x) => locById.get(x.locationId)?.kind === k).reduce((s, x) => s + x.kg, 0) }));

  if (!locRows.length) return (
    <div className="surface-card empty-state" data-testid="status-stock-empty">
      <h3 className="text-sm font-bold">Остатков нет</h3>
      <p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">Внесите начальный остаток или приход с поля — таблица и график строятся только по проведённым записям журнала.</p>
    </div>
  );
  return (
    <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <div className="surface-card min-w-0 p-4">
        <p className="eyebrow">Культуры по местам хранения, т</p>
        <div className="mt-3 h-64" data-testid="chart-grain-storage">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: -10, right: 6, top: 6 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
              <YAxis domain={[0, "auto"]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => tonsKg(Math.round(v * 1000))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {cropIds.map((c) => <Bar key={c.id} dataKey={`c${c.id}`} name={c.name} stackId="stock" fill={color(c.id)} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {byKind.map(({ k, kg }) => (
            <div key={k} className="rounded-lg bg-muted/60 p-2"><p className="truncate text-[10px] font-semibold text-muted-foreground">{KIND_LABEL[k]}</p><p className="font-mono text-xs font-bold" data-testid={`text-kind-${k}`}>{tonsKg(kg)}</p></div>
          ))}
        </div>
      </div>
      <div className="surface-card min-w-0 overflow-x-auto p-4">
        <p className="eyebrow">Остатки зерна: культура × место</p>
        <table className="mt-3 w-full text-xs" data-testid="table-grain-stock">
          <thead><tr className="text-left text-[10px] uppercase text-muted-foreground"><th className="py-1.5 pr-2">Место</th>{cropIds.map((c) => <th key={c.id} className="px-1 text-right">{c.name}</th>)}<th className="pl-2 text-right">Итого</th></tr></thead>
          <tbody>
            {locRows.map((l) => (
              <tr key={l.id} className="border-t border-border" data-testid={`row-stock-${l.id}`}>
                <td className="py-1.5 pr-2"><div className="font-semibold">{l.name}</div><div className="text-[10px] text-muted-foreground">{KIND_LABEL[l.kind]} · {l.unit}</div></td>
                {cropIds.map((c) => <td key={c.id} className="px-1 text-right font-mono">{tonsKg(get(c.id, l.id))}</td>)}
                <td className="pl-2 text-right font-mono font-bold">{tonsKg(cells.filter((x) => x.locationId === l.id).reduce((s, x) => s + x.kg, 0))}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border font-bold"><td className="py-1.5">Итого</td>{cropIds.map((c) => <td key={c.id} className="px-1 text-right font-mono" data-testid={`text-crop-total-${c.id}`}>{tonsKg(cells.filter((x) => x.cropId === c.id).reduce((s, x) => s + x.kg, 0))}</td>)}<td className="pl-2 text-right font-mono">{tonsKg(cells.reduce((s, x) => s + x.kg, 0))}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
