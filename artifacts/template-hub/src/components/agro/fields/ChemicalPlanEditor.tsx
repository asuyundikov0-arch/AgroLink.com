import { Plus, Trash2 } from "lucide-react";
import { type FieldChemicalPlan, getGetChemicalWarehouseQueryKey, useGetChemicalWarehouse } from "@workspace/api-client-react";
import { POLL_MS } from "./shared";
import { cqty, parseQty } from "../chemicals/Workflow";

export type ChemRow = { key: string; batchId: string; rate: string };
export const newChemRow = (): ChemRow => ({ key: crypto.randomUUID(), batchId: "", rate: "" });
export const chemRowsFrom = (plan?: FieldChemicalPlan[]): ChemRow[] => (plan ?? []).map((p) => ({ key: crypto.randomUUID(), batchId: String(p.batchId), rate: String(p.ratePerHa).replace(".", ",") }));
const RATE_RE = /^\d+([.,]\d{1,3})?$/;

/** Validate rows; returns plan array or an error message. */
export function chemPlanOf(rows: ChemRow[]): { plan: FieldChemicalPlan[]; error: string } {
  const plan: FieldChemicalPlan[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.batchId && !r.rate.trim()) continue;
    if (!r.batchId) return { plan, error: "Выберите препарат в каждой строке нормы." };
    if (!RATE_RE.test(r.rate.trim()) || parseQty(r.rate) < 0.001 || parseQty(r.rate) > 1_000_000) return { plan, error: "Норма на гектар — число больше 0, до 3 знаков." };
    if (seen.has(r.batchId)) return { plan, error: "Одна партия указана дважды." };
    seen.add(r.batchId);
    plan.push({ batchId: Number(r.batchId), ratePerHa: parseQty(r.rate) });
  }
  return { plan, error: "" };
}

/** Planned chemicals: warehouse batches of the field farm, norm per hectare, auto total. */
export function ChemicalPlanEditor({ farm, areaHa, rows, onChange, error, disabled, testId = "chem-plan" }: {
  farm?: string; areaHa: number | null; rows: ChemRow[]; onChange: (rows: ChemRow[]) => void; error?: string; disabled?: boolean; testId?: string;
}) {
  const wh = useGetChemicalWarehouse({ query: { queryKey: getGetChemicalWarehouseQueryKey(), refetchInterval: POLL_MS } });
  const all = wh.data?.batches ?? [];
  const batches = all.filter((b) => !farm || b.farm === farm).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const set = (i: number, patch: Partial<ChemRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2 rounded-lg border border-[hsl(200_40%_82%)] bg-[hsl(200_45%_97%)] p-3" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2"><p className="text-[11px] font-bold">Нормы химии на гектар</p><span className="text-[10px] text-muted-foreground">склад {farm ?? "хозяйства"} · итого = норма × {areaHa ? `${cqty(areaHa)} га` : "площадь"}</span></div>
      {wh.isLoading ? <div className="skeleton h-10 rounded-md" /> : wh.isError ? <p className="text-[11px] text-destructive">Склад химии не загрузился. <button type="button" className="font-bold underline" onClick={() => void wh.refetch()}>Повторить</button></p> : <>
        {rows.length === 0 && <p className="text-[10.5px] text-muted-foreground" data-testid={`${testId}-empty`}>Нормы не заданы. Без норм агроном не сможет начать работу.</p>}
        {rows.map((r, i) => {
          const b = all.find((x) => String(x.id) === r.batchId);
          const rate = RATE_RE.test(r.rate.trim()) ? parseQty(r.rate) : null;
          const total = rate !== null && areaHa ? Math.round(rate * areaHa * 1000) / 1000 : null;
          return (
            <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-start gap-2" data-testid={`${testId}-row-${i}`}>
              <select className="text-input" value={r.batchId} disabled={disabled} onChange={(e) => set(i, { batchId: e.target.value })} aria-label="Препарат" data-testid={`${testId}-batch-${i}`}>
                <option value="">{batches.length ? "Препарат и партия" : "На складе хозяйства нет партий"}</option>
                {b && !batches.some((x) => x.id === b.id) && <option value={b.id}>{b.name} · {b.farm}</option>}
                {batches.map((x) => <option key={x.id} value={x.id}>{x.name} · накл. № {x.invoiceNumber} · ост. {cqty(x.remaining)} {x.unit}</option>)}
              </select>
              <input className="text-input font-mono" inputMode="decimal" placeholder={b ? `${b.unit}/га` : "норма/га"} value={r.rate} disabled={disabled} onChange={(e) => set(i, { rate: e.target.value })} aria-label="Норма на гектар" data-testid={`${testId}-rate-${i}`} />
              <button type="button" className="icon-button" aria-label="Убрать строку" disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))} data-testid={`${testId}-remove-${i}`}><Trash2 size={14} /></button>
              <p className="col-span-3 -mt-1 text-[10px] text-muted-foreground" data-testid={`${testId}-total-${i}`}>{b ? `${b.unit}/га` : ""}{total !== null && b ? ` · на площадь: ${cqty(total)} ${b.unit}${b.remaining < total ? ` · на складе только ${cqty(b.remaining)} ${b.unit}` : ""}` : ""}</p>
            </div>
          );
        })}
        <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" disabled={disabled || rows.length >= 20} onClick={() => onChange([...rows, newChemRow()])} data-testid={`${testId}-add`}><Plus size={12} />Препарат</button>
      </>}
      {error && <p className="text-[10.5px] font-semibold text-destructive" role="alert">{error}</p>}
    </div>
  );
}
