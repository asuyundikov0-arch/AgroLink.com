import { useQueryClient } from "@tanstack/react-query";
import { type SupportingService, type SupportingTask } from "@workspace/api-client-react";
import { cx, errorInfo } from "../fields/shared";

export const TASKS_POLL_MS = 25000;
export const TASKS_KEY_ROOT = "/api/agro/supporting-tasks";
export const SERVICES: { id: SupportingService; label: string; short: string }[] = [
  { id: "tok", label: "Ток", short: "Ток" },
  { id: "motor_pool", label: "Автобаза", short: "Автобаза" },
  { id: "fuel", label: "Нефтебаза", short: "Нефтебаза" },
];
export const serviceLabel = (s: SupportingService) => SERVICES.find((x) => x.id === s)?.label ?? s;
export const canCreateTasks = (role: string) => role === "agronomist" || role === "general_director";
export const NOT_EXPENSE_TEXT = "Задание не является складским списанием или начислением зарплаты";

export function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === TASKS_KEY_ROOT });
}

export const money = (v: number) => `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v)} ₸`;
export const dt = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = s.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : s;
};
export const dtTime = (s: string | null | undefined) => s ? new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function isIsoDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** Money/quantity string → number or null when invalid. 2 decimals, 0..max. */
export function parseAmount(raw: string, max: number, decimals = 2): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
export const amountStr = (n: number) => String(n).replace(".", ",");

export function taskErr(err: unknown) {
  const info = errorInfo(err);
  const conflict = info.status === 409;
  return { conflict, message: conflict ? `Задание уже изменено в другой сессии. Обновите список и повторите. ${info.message ? `(${info.message})` : ""}` : info.message };
}

export function TaskStatusPill({ task }: { task: SupportingTask }) {
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em]", task.status === "draft" ? "border border-dashed border-foreground/40 text-muted-foreground" : "bg-foreground text-background")} data-testid={`status-supporting-task-${task.id}`}>
    {task.status === "draft" ? "Черновик" : "Отправлено"}
  </span>;
}

export function DeliveryPill({ task, service }: { task: SupportingTask; service: SupportingService }) {
  const d = task.deliveries.find((x) => x.service === service);
  const accepted = d?.status === "accepted";
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", accepted ? "border-foreground bg-foreground/10 text-foreground" : d ? "border-border text-foreground" : "border-dashed border-border text-muted-foreground")} data-testid={`status-delivery-${task.id}-${service}`}
    title={accepted ? `Исполнение начал ${d?.acceptedBy} · ${dtTime(d?.acceptedAt)}` : undefined}>
    <span className={cx("h-1.5 w-1.5 rounded-full", accepted ? "bg-[hsl(152_50%_42%)]" : d ? "bg-[hsl(38_90%_50%)]" : "bg-muted-foreground/40")} />
    {serviceLabel(service)} · {accepted ? "в исполнении" : d ? "отправлено" : task.status === "draft" ? "не отправлено" : "—"}
  </span>;
}
