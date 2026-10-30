import { getGetFieldCostsQueryKey, useGetFieldCosts } from "@workspace/api-client-react";
import { dateFmt, POLL_MS } from "./shared";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const tons = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

/** Approved warehouse issues, independent of the operation's optional seed budget. */
export function HistorySeedCosts({ seasonId, operationId }: { seasonId: number; operationId?: number }) {
  const q = useGetFieldCosts(seasonId, {
    query: { queryKey: getGetFieldCostsQueryKey(seasonId), refetchInterval: POLL_MS },
  });
  if (q.isLoading) return <p className="mt-2 text-[10.5px] text-muted-foreground">Загружаем фактические затраты семян…</p>;
  if (q.isError || !q.data) return <div className="mt-2 text-[10.5px] text-destructive">Затраты семян не загрузились. <button type="button" className="underline" onClick={() => void q.refetch()}>Повторить</button></div>;
  const operation = operationId ? q.data.operations.find(o => o.operationId === operationId) : undefined;
  const amount = operationId ? operation?.seedCost ?? 0 : q.data.seedCost ?? 0;
  const issues = operation?.seedIssues ?? [];
  return <div className="mt-2 rounded-md border border-border bg-muted/20 p-2 text-[10.5px]" data-testid={operationId ? `history-seed-cost-operation-${operationId}` : `history-seed-cost-season-${seasonId}`}>
    <p className="font-semibold">Семена — фактические затраты {operationId ? "операции" : "сезона"}: <span className="font-mono">{money.format(amount)} ₸</span></p>
    {issues.map(issue => <p key={issue.movementId} className="mt-1 text-muted-foreground">{dateFmt(issue.occurredOn)} · {issue.cropName} · {tons.format(issue.quantityTons)} т · <span className="font-mono">{money.format(issue.amount)} ₸</span></p>)}
    <p className="mt-1 text-muted-foreground">Только согласованные выдачи со склада семян. Плановый бюджет не включён.</p>
    {!operationId && (q.data.unallocatedSeedCost ?? 0) > 0 && <p className="mt-1 text-muted-foreground">Без привязки к операции: {money.format(q.data.unallocatedSeedCost!)} ₸</p>}
  </div>;
}
