import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { type FieldOperation, getGetDailySeedingReportQueryKey, getGetFieldDashboardQueryKey } from "@workspace/api-client-react";
import { cx } from "../grain/shared";

export { UNITS, type Unit, cx, dateFmt, Field, Drawer } from "../grain/shared";
export const POLL_MS = 30000;
export const OP_SUGGESTIONS = ["Посев", "Культивация", "Предпосевная культивация", "Дискование", "Боронование", "Прикатывание", "Внесение удобрений", "Обработка СЗР", "Гербицидная обработка", "Десикация", "Уборка", "Лущение стерни", "Снегозадержание"];

export const canManage = (r: string) => ["chief_agronomist", "general_director"].includes(r);
export const canActual = (r: string) => ["agronomist", "general_director"].includes(r);
export const isGD = (r: string) => r === "general_director";

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
export const haNum = (v: number) => nf.format(v);
export const ha = (v: number) => `${nf.format(v)} га`;
export const pctFmt = (v: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v)}%`;
export const sumHa = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;

/** "12,5" -> 12.5; null when not a non-negative number with at most two decimals */
export function parseHa(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}
export const haStr = (v: number) => String(v).replace(".", ",");

export type StatusKey = FieldOperation["status"];
export const STATUS: Record<StatusKey, { label: string; cls: string }> = {
  planned: { label: "Запланирована", cls: "bg-[hsl(205_28%_92%)] text-[hsl(207_30%_32%)]" },
  in_progress: { label: "Выполняется", cls: "bg-[hsl(203_87%_33%/.12)] text-[hsl(203_87%_26%)]" },
  completed: { label: "Завершена", cls: "bg-[hsl(157_45%_90%)] text-[hsl(161_45%_26%)]" },
  cancelled: { label: "Отменена", cls: "bg-muted text-muted-foreground line-through" },
};

export function StatusPill({ op }: { op: FieldOperation }) {
  const m = STATUS[op.status];
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid={`status-op-${op.id}`}>
      <span className={cx("whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold", m.cls)}>{m.label}</span>
      {op.isOverdue && <span className="whitespace-nowrap rounded-full bg-[hsl(2_68%_52%/.12)] px-2 py-0.5 text-[10px] font-bold text-[hsl(2_57%_40%)]">просрочена</span>}
    </span>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-[100px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}>
        <div className="h-full origin-left rounded-full bg-[#44986D] transition-transform duration-500" style={{ transform: `scaleX(${v / 100})` }} />
      </div>
      <span className="w-11 text-right font-mono text-[10.5px] font-bold">{pctFmt(value)}</span>
    </div>
  );
}

export function errorInfo(err: unknown): { status?: number; message: string } {
  const e = err as { status?: number; data?: unknown; message?: string } | null;
  const status = typeof e?.status === "number" ? e.status : undefined;
  const d = e?.data as { error?: unknown } | null | undefined;
  const s = d && typeof d === "object" && typeof d.error === "string" ? d.error : undefined;
  if (status === 403) return { status, message: s ? `Недостаточно прав: ${s}` : "Недостаточно прав для этого действия." };
  if (status === 401) return { status, message: "Сессия истекла. Войдите снова." };
  return { status, message: s ?? e?.message ?? "Не удалось выполнить запрос. Повторите попытку." };
}
export const CONFLICT_TEXT = "Запись уже изменил другой пользователь. Ваши значения остались в форме и не отправлены. Обновите данные, закройте форму и откройте её заново.";
export const isStale = (status?: number, msg = "") => status === 409 && /верси|version|изменил|устар/i.test(msg);

export function useInvalidateFields() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: getGetFieldDashboardQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetDailySeedingReportQueryKey() }),
  ]);
}

export function SaveError({ message, conflict, testId }: { message: string; conflict: boolean; testId: string }) {
  const invalidate = useInvalidateFields();
  const [busy, setBusy] = useState(false);
  if (!message) return null;
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold leading-5 text-destructive" role="alert" data-testid={testId}>
      {message}
      {conflict && (
        <button type="button" className="button button-secondary mt-2 !min-h-[32px] text-foreground" disabled={busy}
          onClick={async () => { setBusy(true); try { await invalidate(); } finally { setBusy(false); } }} data-testid={`${testId}-reload`}>
          <RefreshCw size={13} className={cx(busy && "animate-spin")} />Обновить данные
        </button>
      )}
    </div>
  );
}

/** Map server error to form state: 409 on an update with stale version locks the form. */
export function handleSaveError(err: unknown, isUpdate: boolean, set: (msg: string, conflict: boolean) => void) {
  const info = errorInfo(err);
  if (isUpdate && info.status === 409 && (isStale(info.status, info.message) || !info.message || info.message === "Конфликт данных.")) set(`${CONFLICT_TEXT}${info.message ? ` (${info.message})` : ""}`, true);
  else set(info.message, false);
}
