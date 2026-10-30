import { useQueryClient } from "@tanstack/react-query";
import { getGetGrainDashboardQueryKey, getGetSeedWarehouseQueryKey, type SeedMovement } from "@workspace/api-client-react";

export const SEED_POLL_MS = 15000;
export const SEED_KIND_LABEL: Record<SeedMovement["kind"], string> = { receipt: "Покупка семян", from_grain: "Из зерна", issue: "Выдача на поле" };
export const SEED_STATUS_LABEL: Record<SeedMovement["approvalStatus"], string> = { pending: "Ждёт согласования", approved: "Проведено", rejected: "Отклонено" };
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const tons = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
export const kzt = (v: number) => `${money.format(v)} ₸`;
export const tn = (v: number) => `${tons.format(v)} т`;
export const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); }));

/** Parses a decimal with at most `dp` decimals, strictly positive. */
export function parsePos(v: string, dp: number, max: number): { value: number | null; err?: string } {
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return { value: null, err: "Обязательное поле" };
  if (!/^\d+(\.\d+)?$/.test(t)) return { value: null, err: "Введите положительное число" };
  const q = Number(t);
  if (!(q > 0)) return { value: null, err: "Должно быть больше нуля" };
  if (q > max) return { value: null, err: `Не более ${tons.format(max)}` };
  if ((t.split(".")[1] ?? "").length > dp) return { value: null, err: `Точность до ${dp} знаков после запятой` };
  return { value: q };
}

export function useInvalidateSeeds() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: getGetSeedWarehouseQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetGrainDashboardQueryKey() }),
    qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/agro/fields") }),
  ]);
}
