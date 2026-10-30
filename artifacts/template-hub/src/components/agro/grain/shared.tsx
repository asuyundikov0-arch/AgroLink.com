import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { getGetGrainDashboardQueryKey, type GrainLocation, type GrainMovement } from "@workspace/api-client-react";

export const UNITS = ["АПК Арыстан Grain", "АФ Веденовка"] as const;
export type Unit = (typeof UNITS)[number];
export const POLL_MS = 30000;
export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
export const kg = (t: number) => Math.round(t * 1000);
const tf = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
export const tonsKg = (k: number) => `${tf.format(k / 1000)} т`;
export const dateFmt = (v?: string | null) => { if (!v) return "—"; const [y, m, d] = v.slice(0, 10).split("-"); return `${d}.${m}.${y}`; };
export const KIND_LABEL: Record<GrainLocation["kind"], string> = { warehouse: "Склад", yard: "Ток / площадка", elevator: "Элеватор (своё зерно)", dryer: "Сушилка", cleaner: "Очистка (ЗАВ)" };
export const KIND_ORDER: GrainLocation["kind"][] = ["yard", "warehouse", "elevator", "dryer", "cleaner"];
export const OP_LABEL: Record<GrainMovement["operation"], string> = { opening: "Начальный остаток", receipt: "Приход с поля", transfer: "Перемещение", sale: "Продажа", drying: "Сушка", cleaning: "Очистка", seed_transfer: "В склад семян" };
export type StockKind = "grain" | "grain_waste";
export const STOCK_LABEL: Record<StockKind, string> = { grain: "Зерно", grain_waste: "Зерновые отходы" };
export const isProcessor = (k: GrainLocation["kind"]) => k === "dryer" || k === "cleaner";
export const pct = (part: number, whole: number) => (whole > 0 ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format((part / whole) * 100)} %` : "—");
export const n0 = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const CROP_COLORS = ["#2F6F86", "#CED14E", "#C0623B", "#61A9BD", "#7A8B3A", "#8E5A9B", "#D9A441", "#3E8E6E"];
export const canRead = (r: string) => ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"].includes(r);
export const canRecord = (r: string) => ["weigher", "general_director"].includes(r);
export const canReview = (r: string) => ["grain_manager", "general_director"].includes(r);
export const canManageDir = (r: string) => ["chief_agronomist", "general_director"].includes(r);
export const isGD = (r: string) => r === "general_director";

export function errorInfo(err: unknown): { status?: number; message: string } {
  const e = err as { status?: number; data?: unknown; message?: string } | null;
  const status = typeof e?.status === "number" ? e.status : undefined;
  const d = e?.data as { error?: unknown } | null | undefined;
  const s = d && typeof d === "object" && typeof d.error === "string" ? d.error : undefined;
  if (status === 403) return { status, message: s ? `Недостаточно прав: ${s}` : "Недостаточно прав для этого действия." };
  if (status === 401) return { status, message: "Сессия истекла. Войдите снова." };
  if (status === 409) return { status, message: s ?? "Недостаточно остатка зерна (сейчас или на дату операции)." };
  return { status, message: s ?? e?.message ?? "Не удалось выполнить запрос. Повторите попытку." };
}

export function useInvalidateGrain() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: getGetGrainDashboardQueryKey() });
}

export function Field({ label, error, hint, children, htmlFor, wide }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; wide?: boolean }) {
  return (
    <div className={cx(wide && "sm:col-span-2")}>
      <label className="form-label" htmlFor={htmlFor}>{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <div className="mt-1 text-[10px] font-medium text-muted-foreground">{hint}</div>}
      {error && <p className="mt-1 text-[10px] font-semibold text-destructive" role="alert">{error}</p>}
    </div>
  );
}

export function Drawer({ title, eyebrow, onClose, children, footer, testId }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; footer: ReactNode; testId: string }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[hsl(210_43%_17%/.35)]" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex h-full w-full max-w-[560px] flex-col bg-card shadow-2xl animate-in slide-in-from-right duration-200" data-testid={testId}>
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 className="mt-1 text-lg font-bold tracking-[-0.03em]">{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть" data-testid={`${testId}-close`}><X size={16} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>
      </div>
    </div>
  );
}

export function ErrorBox({ message, testId }: { message: string; testId: string }) {
  if (!message) return null;
  return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold leading-5 text-destructive" role="alert" data-testid={testId}>{message}</div>;
}
