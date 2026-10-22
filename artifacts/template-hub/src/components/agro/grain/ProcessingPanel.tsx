import { useMemo } from "react";
import type { GrainBalance, GrainCrop, GrainLocation, GrainMovement } from "@workspace/api-client-react";
import { KIND_LABEL, isProcessor, kg, n0, pct, tonsKg } from "./shared";

type Agg = { input: number; output: number; dead: number; gw: number; moist: number; count: number };
const empty = (): Agg => ({ input: 0, output: 0, dead: 0, gw: 0, moist: 0, count: 0 });

export default function ProcessingPanel({ balances, movements, crops, locations }: { balances: GrainBalance[]; movements: GrainMovement[]; crops: GrainCrop[]; locations: GrainLocation[] }) {
  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const cn = (id: number) => crops.find((c) => c.id === id)?.name ?? `#${id}`;
  const inProc = balances.filter((b) => (b.stockKind ?? "grain") === "grain" && kg(b.quantityTons) !== 0 && isProcessor(locById.get(b.locationId)?.kind ?? "warehouse"));
  const waste = balances.filter((b) => b.stockKind === "grain_waste" && kg(b.quantityTons) !== 0);
  const agg = useMemo(() => {
    const r: Record<"drying" | "cleaning" | "all", Agg> = { drying: empty(), cleaning: empty(), all: empty() };
    for (const m of movements) {
      if (m.voidedAt || (m.operation !== "drying" && m.operation !== "cleaning")) continue;
      for (const a of [r[m.operation], r.all]) {
        a.input += kg(m.quantityTons); a.output += kg(n0(m.outputTons)); a.dead += kg(n0(m.deadWasteTons)); a.gw += kg(n0(m.grainWasteTons)); a.moist += kg(n0(m.moistureLossTons)); a.count++;
      }
    }
    return r;
  }, [movements]);

  return (
    <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]" data-testid="section-grain-processing">
      <div className="surface-card min-w-0 overflow-x-auto p-4">
        <p className="eyebrow">Сушка и очистка: итоги проведённых записей</p>
        {agg.all.count === 0 ? <p className="py-6 text-center text-xs text-muted-foreground" data-testid="status-processing-empty">Записей сушки и очистки пока нет. Отправьте зерно перемещением на сушилку или очистку, затем внесите результат обработки.</p> : (
          <table className="mt-3 w-full text-xs" data-testid="table-processing-stats">
            <thead><tr className="text-left text-[10px] uppercase text-muted-foreground"><th className="py-1.5 pr-2">Показатель</th><th className="px-1 text-right">Сушка</th><th className="px-1 text-right">Очистка</th><th className="pl-2 text-right">Всего</th></tr></thead>
            <tbody>
              {([
                ["input", "Подано на обработку", (a: Agg) => tonsKg(a.input)],
                ["output", "Выход зерна", (a: Agg) => tonsKg(a.output)],
                ["diff", "Разница зерна (вход − выход)", (a: Agg) => `${tonsKg(a.input - a.output)} · ${pct(a.input - a.output, a.input)}`],
                ["grainwaste", "Зерновые отходы (учитываются)", (a: Agg) => `${tonsKg(a.gw)} · ${pct(a.gw, a.input)}`],
                ["dead", "Мёртвый сор (списан)", (a: Agg) => `${tonsKg(a.dead)} · ${pct(a.dead, a.input)}`],
                ["moisture", "Усушка (влага)", (a: Agg) => `${tonsKg(a.moist)} · ${pct(a.moist, a.input)}`],
                ["loss", "Безвозвратная убыль (сор + влага)", (a: Agg) => `${tonsKg(a.dead + a.moist)} · ${pct(a.dead + a.moist, a.input)}`],
              ] as const).map(([k, l, f]) => (
                <tr key={k} className="border-t border-border"><td className="py-1.5 pr-2 font-semibold">{l}</td>
                  <td className="px-1 text-right font-mono" data-testid={`text-proc-drying-${k}`}>{f(agg.drying)}</td>
                  <td className="px-1 text-right font-mono" data-testid={`text-proc-cleaning-${k}`}>{f(agg.cleaning)}</td>
                  <td className="pl-2 text-right font-mono font-bold" data-testid={`text-proc-all-${k}`}>{f(agg.all)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[10.5px] leading-4 text-muted-foreground">Разница зерна (рефакция по весу) включает зерновые отходы — они остаются на учёте отдельно. Безвозвратная убыль — только мёртвый сор и влага. Проценты — от поданного на обработку. При повторной обработке один и тот же объём учитывается в каждом проходе; это оборот обработки, а не новый приход зерна.</p>
      </div>
      <div className="space-y-4">
        <div className="surface-card p-4">
          <p className="eyebrow">Зерно в обработке</p>
          {!inProc.length ? <p className="py-3 text-xs text-muted-foreground" data-testid="status-inprocessing-empty">На сушилках и очистках зерна нет.</p> : (
            <ul className="mt-2 divide-y divide-border">{inProc.map((b) => { const l = locById.get(b.locationId); return (
              <li key={`${b.locationId}-${b.cropId}`} className="flex justify-between gap-2 py-1.5 text-xs" data-testid={`row-inprocessing-${b.locationId}-${b.cropId}`}>
                <span><b>{l?.name ?? `#${b.locationId}`}</b> <span className="text-muted-foreground">{l ? KIND_LABEL[l.kind] : ""} · {cn(b.cropId)}</span></span><span className="font-mono font-bold">{tonsKg(kg(b.quantityTons))}</span></li>); })}</ul>
          )}
        </div>
        <div className="surface-card p-4">
          <p className="eyebrow">Зерновые отходы на хранении</p>
          {!waste.length ? <p className="py-3 text-xs text-muted-foreground" data-testid="status-waste-empty">Остатков зерновых отходов нет.</p> : (
            <ul className="mt-2 divide-y divide-border">{waste.map((b) => (
              <li key={`${b.locationId}-${b.cropId}`} className="flex justify-between gap-2 py-1.5 text-xs" data-testid={`row-waste-${b.locationId}-${b.cropId}`}>
                <span><b>{cn(b.cropId)}</b> <span className="text-muted-foreground">· {locById.get(b.locationId)?.name ?? `#${b.locationId}`} · {b.unit}</span></span><span className="font-mono font-bold">{tonsKg(kg(b.quantityTons))}</span></li>))}</ul>
          )}
          <p className="mt-2 text-[10.5px] text-muted-foreground">Не входят в остаток зерна. Продаются и перемещаются с выбором вида «Зерновые отходы».</p>
        </div>
      </div>
    </section>
  );
}
