import { useQueryClient } from "@tanstack/react-query";
import {
  getGetChemicalWarehouseQueryKey,
  getGetChemicalWorkflowQueryKey,
  getGetFieldDashboardQueryKey,
  useGetChemicalWorkflow,
} from "@workspace/api-client-react";
import { POLL_MS } from "../grain/shared";

const nf3 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const nf2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const cqty = (v: number) => nf3.format(v);
export const cmoney = (v: number) => `${nf2.format(v)} ₸`;
export const parseQty = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
export const QTY_RE = /^\d+([.,]\d{1,3})?$/;
export const validQty = (s: string) => QTY_RE.test(s.trim()) && parseQty(s) >= 0.001 && parseQty(s) <= 1_000_000;

/** Single shared workflow query: polled every 30 s so all roles see each other's changes. */
export function useChemicalWorkflow(enabled = true) {
  return useGetChemicalWorkflow({ query: { queryKey: getGetChemicalWorkflowQueryKey(), refetchInterval: POLL_MS, enabled } });
}

export function useInvalidateChemicals() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: getGetChemicalWorkflowQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetChemicalWarehouseQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetFieldDashboardQueryKey() }),
  ]);
}

export function ChemError({ msg }: { msg: string }) {
  return msg ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] font-semibold leading-5 text-destructive" role="alert" data-testid="status-chem-flow-error">{msg} Данные формы сохранены, можно повторить.</div> : null;
}
