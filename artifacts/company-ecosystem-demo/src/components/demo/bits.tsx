import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { holderKind, holderName, type DemoState, type MovementType, type RequestStatus, type RequestType } from '@/demo/engine';

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function NativeSelect({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...p}
      className={cn(
        'h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
    >
      {children}
    </select>
  );
}

export function HolderOptions({ s, kinds, exclude }: { s: DemoState; kinds: ('warehouse' | 'location' | 'employee')[]; exclude?: string }) {
  return (
    <>
      {kinds.includes('warehouse') && (
        <optgroup label="Склады">
          {s.warehouses.map((w) => `wh:${w.id}`).filter((h) => h !== exclude).map((h) => <option key={h} value={h}>{holderName(s, h)}</option>)}
        </optgroup>
      )}
      {kinds.includes('location') && (
        <optgroup label="Локации">
          {s.locations.map((l) => `loc:${l.id}`).filter((h) => h !== exclude).map((h) => <option key={h} value={h}>{holderName(s, h)}</option>)}
        </optgroup>
      )}
      {kinds.includes('employee') && (
        <optgroup label="Сотрудники">
          {s.employees.map((e) => `emp:${e.id}`).filter((h) => h !== exclude).map((h) => <option key={h} value={h}>{holderName(s, h)}</option>)}
        </optgroup>
      )}
    </>
  );
}

const MV: Record<MovementType, [string, string]> = {
  receipt: ['Приход', 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900'],
  issue: ['Выдача', 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900'],
  return: ['Возврат', 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900'],
  transfer: ['Перемещение', 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'],
  writeoff: ['Списание', 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-900'],
};
export function MovementBadge({ type }: { type: MovementType }) {
  return <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold', MV[type][1])}>{MV[type][0]}</span>;
}

const RS: Record<RequestStatus, [string, string]> = {
  pending: ['На согласовании', 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900'],
  approved: ['Согласована', 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900'],
  rejected: ['Отклонена', 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'],
  fulfilled: ['Исполнена', 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900'],
};
export function StatusBadge({ status, type }: { status: RequestStatus; type?: RequestType }) {
  const label = status === 'fulfilled' && type === 'writeoff' ? 'Списано' : RS[status][0];
  return <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold', RS[status][1])}>{label}</span>;
}

export function HolderTag({ s, h }: { s: DemoState; h: string | null }) {
  if (!h) return <span className="text-muted-foreground">вне компании</span>;
  const k = holderKind(h);
  const prefix = k === 'warehouse' ? 'Склад' : k === 'location' ? 'Локация' : 'Подотчёт';
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{prefix}</span>
      <span>{holderName(s, h)}</span>
    </span>
  );
}

export function PageHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{kicker}</div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-card-border bg-card', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-bold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 h-10 w-10 rounded-full border-2 border-dashed border-primary/40" aria-hidden />
      <div className="font-semibold">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</div>
    </div>
  );
}

export function RoleHint({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{text}</div>;
}
