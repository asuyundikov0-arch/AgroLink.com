import { getGetFieldCostsQueryKey, useGetFieldCosts, type FieldOperation } from "@workspace/api-client-react";
import { Field } from "./shared";

const kzt = (amount: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount)} ₸`;

export function ActualRateField({ rate, prefix }: { rate: number | null; prefix: string }) {
  return <Field label="Фактическая расценка, ₸/га" hint="Расценку назначает диспетчер в своём разделе." htmlFor={`${prefix}-rate`}>
    <input id={`${prefix}-rate`} className="text-input font-mono" readOnly value={rate === null ? "Не назначена" : String(rate)} data-testid={`input-${prefix}-actual-rate`} />
  </Field>;
}

export function ActualFuelField({ amount, prefix, planned }: { amount: number; prefix: string; planned: number }) {
  return <Field label="Фактические затраты на топливо, ₸" hint={`Автоматически из нефтебазы, всего по операции. План: ${kzt(planned)}.`} htmlFor={`${prefix}-fuel`} wide>
    <input id={`${prefix}-fuel`} className="text-input font-mono" readOnly value={String(amount)} data-testid={`input-${prefix}-actual-fuel-cost`} />
  </Field>;
}

/** Agronomy-only query. Dispatchers receive just the fuel total from their own queue. */
export function AgronomyActualFuelField({ op }: { op: FieldOperation }) {
  const q = useGetFieldCosts(op.seasonId, { query: { queryKey: getGetFieldCostsQueryKey(op.seasonId), refetchInterval: 30_000 } });
  if (q.isError) return <div className="text-xs text-destructive sm:col-span-2" role="alert">
    Не удалось загрузить фактические затраты на топливо.
    <button type="button" className="ml-2 underline" onClick={() => { void q.refetch(); }}>Повторить</button>
  </div>;
  if (!q.data) return <p className="text-xs text-muted-foreground sm:col-span-2">Загрузка затрат на топливо…</p>;
  return <ActualFuelField amount={q.data.operations.find((row) => row.operationId === op.id)?.fuelCost ?? 0} planned={op.plannedFuelCost} prefix="work" />;
}
