import { type ComponentProps, type ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, X } from "lucide-react";
import {
  type FleetEquipment,
  type RepairEntry,
  type RepairExpense,
  getListEngineeringRepairsQueryKey,
  getListEngineeringSparePartMovementsQueryKey,
  getListEngineeringSparePartsQueryKey,
  getListFleetEquipmentQueryKey,
  getListRepairExpensesQueryKey,
} from "@workspace/api-client-react";

export const UNITS = ["АПК Арыстан Grain", "АФ Веденовка"] as const;
export type Unit = (typeof UNITS)[number];
export type UnitFilter = Unit | "all";
export const POLL_MS = 30000;
export const addMoney = (a: number, b: number) => (Math.round(a * 100) + Math.round(b * 100)) / 100;
export function businessToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const CATEGORY_LABEL: Record<RepairExpense["category"], string> = {
  capital: "Капитальный ремонт",
  current: "Текущий ремонт — прочее",
  tires: "Шины (в текущем)",
  oils: "Масла (в текущем)",
  service: "Сервис (в текущем)",
};
export const CATEGORY_ORDER: RepairExpense["category"][] = ["current", "tires", "oils", "service", "capital"];
export const CATEGORY_COLOR: Record<RepairExpense["category"], string> = {
  current: "#61A9BD", tires: "#2F6F86", oils: "#8CC5D3", service: "#B9DCE5", capital: "#CED14E",
};

export const statusMeta: Record<RepairEntry["status"], { label: string; cls: string }> = {
  planned: { label: "Запланирован", cls: "bg-[hsl(205_28%_92%)] text-[hsl(207_30%_32%)]" },
  in_progress: { label: "В работе", cls: "bg-[hsl(203_87%_33%/.12)] text-[hsl(203_87%_26%)]" },
  overdue: { label: "Просрочен", cls: "bg-[hsl(2_68%_52%/.12)] text-[hsl(2_57%_40%)]" },
  completed: { label: "Завершён", cls: "bg-[hsl(157_45%_90%)] text-[hsl(161_45%_26%)]" },
};

const kzt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
export const num = (v: number) => kzt.format(v);
export const kztCompact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
export const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${kzt.format(v)} ₸`);
export const dateFmt = (v: string | null | undefined) => {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};
export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
export const fleetLabel = (f: Pick<FleetEquipment, "kind" | "registrationNumber">) =>
  `${f.kind} · ${f.registrationNumber ?? "без госномера"}`;
export const effReadiness = (e: RepairEntry) => (e.actualEnd ? 100 : e.readiness);

export function canManageFleet(role: string) { return role === "chief_engineer" || role === "general_director"; }
export function isDirector(role: string) { return role === "general_director"; }

export function errorInfo(err: unknown): { status?: number; message: string } {
  const e = err as { status?: number; data?: unknown; message?: string } | null;
  const status = typeof e?.status === "number" ? e.status : undefined;
  const d = e?.data as { error?: unknown } | null | undefined;
  const serverText = d && typeof d === "object" && typeof d.error === "string" ? d.error : undefined;
  if (status === 403) return { status, message: serverText ? `Недостаточно прав: ${serverText}` : "Недостаточно прав для этого действия." };
  if (status === 401) return { status, message: "Сессия истекла. Войдите снова." };
  if (status === 409) return { status, message: serverText ?? "Конфликт данных." };
  return { status, message: serverText ?? e?.message ?? "Не удалось выполнить запрос. Повторите попытку." };
}

export const CONFLICT_TEXT = "Запись уже изменил другой пользователь. Ваши значения остались в форме и не отправлены повторно. Перепишите их, нажмите «Обновить данные», закройте форму и откройте запись заново — затем внесите изменения в актуальную версию.";

export function useInvalidateRepairs() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: [getListFleetEquipmentQueryKey()[0]] }),
    qc.invalidateQueries({ queryKey: [getListEngineeringRepairsQueryKey()[0]] }),
    qc.invalidateQueries({ queryKey: [getListRepairExpensesQueryKey()[0]] }),
    qc.invalidateQueries({ queryKey: [getListEngineeringSparePartsQueryKey()[0]] }),
    qc.invalidateQueries({ queryKey: [getListEngineeringSparePartMovementsQueryKey()[0]] }),
  ]);
}

export function Field({ label, error, hint, children, wide, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; wide?: boolean; htmlFor?: string }) {
  return (
    <div className={cx(wide && "sm:col-span-2")}>
      <label className="form-label" htmlFor={htmlFor}>{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="mt-1 text-[10px] font-medium text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-[10px] font-semibold text-destructive" role="alert">{error}</p>}
    </div>
  );
}

export function OverlayPortal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? <>{children}</> : createPortal(children, document.body);
}

// Portal the whole form, not only its fields: native submit buttons must retain their form owner.
export function OverlayForm(props: ComponentProps<"form">) {
  return <OverlayPortal><form {...props} /></OverlayPortal>;
}

export function Drawer({ title, eyebrow, onClose, children, footer, testId, wide }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; footer: ReactNode; testId: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[hsl(210_43%_17%/.35)]" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("flex h-full w-full flex-col bg-card shadow-2xl animate-in slide-in-from-right duration-200", wide ? "max-w-[860px]" : "max-w-[560px]")} data-testid={testId}>
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 className="mt-1 text-lg font-bold tracking-[-0.03em]">{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть" data-testid={`${testId}-close`}><X size={16} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>
      </div>
    </div>
  );
}

export function SaveError({ message, conflict, testId }: { message: string; conflict: boolean; testId: string }) {
  const invalidate = useInvalidateRepairs();
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

export function ConfirmDialog({ title, body, error, pending, onCancel, onConfirm, testId }: { title: string; body: ReactNode; error: string; pending: boolean; onCancel: () => void; onConfirm: () => void; testId: string }) {
  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(210_43%_17%/.4)] p-4" role="alertdialog" aria-modal="true" aria-label={title} data-testid={testId}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-150">
        <h2 className="text-base font-bold">{title}</h2>
        <div className="mt-1.5 text-xs leading-5 text-muted-foreground">{body}</div>
        {error && <p className="mt-3 rounded-lg bg-destructive/5 p-2.5 text-xs font-semibold text-destructive" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="button button-secondary" onClick={onCancel} disabled={pending} data-testid={`${testId}-cancel`}>Отмена</button>
          <button type="button" className="button !bg-destructive text-white" onClick={onConfirm} disabled={pending} data-testid={`${testId}-confirm`}>{pending ? "Удаляем..." : "Удалить"}</button>
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

export function FleetPicker({ fleet, value, onChange, id, testId, invalid, exclude }: { fleet: FleetEquipment[]; value: number | null; onChange: (id: number | null) => void; id: string; testId: string; invalid?: boolean; exclude?: Set<number> }) {
  const [q, setQ] = useState("");
  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    return fleet.filter((f) => (!exclude || !exclude.has(f.id) || f.id === value) && (!t || f.id === value || `${f.kind} ${f.registrationNumber ?? ""} ${f.unit}`.toLowerCase().includes(t)));
  }, [fleet, q, exclude, value]);
  return (
    <div className="space-y-1.5">
      <input className="text-input" type="search" placeholder="Поиск по виду, госномеру, хозяйству" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск техники" data-testid={`${testId}-search`} />
      <select id={id} className={cx("text-input", invalid && "!border-destructive")} aria-invalid={invalid} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} data-testid={testId}>
        <option value="">Выберите технику из справочника ({options.length})</option>
        {options.map((f) => <option key={f.id} value={f.id}>{fleetLabel(f)} — {f.unit}</option>)}
      </select>
    </div>
  );
}

export function SectionSkeleton() {
  return <div className="space-y-3 p-4" data-testid="status-loading"><div className="skeleton h-10 rounded-lg" /><div className="skeleton h-10 rounded-lg" /><div className="skeleton h-10 rounded-lg" /></div>;
}

export function SectionError({ text, onRetry, testId }: { text: string; onRetry: () => void; testId: string }) {
  return (
    <div className="empty-state" data-testid={testId}>
      <h3 className="text-sm font-bold">Не удалось загрузить</h3>
      <p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{text}</p>
      <button type="button" className="button button-secondary mt-4" onClick={onRetry} data-testid={`${testId}-retry`}>Повторить</button>
    </div>
  );
}
