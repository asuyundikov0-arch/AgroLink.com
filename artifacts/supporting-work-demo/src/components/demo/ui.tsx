import type { ReactNode } from "react";

export function DemoTag({ className = "" }: { className?: string }) {
  return <span className={`inline-block border border-foreground px-1.5 py-px text-[10px] font-semibold uppercase tracking-[.14em] num ${className}`}>Демо</span>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: { value: string; onChange: (v: string) => void; disabled?: boolean; testId: string; suffix?: string; numeric?: boolean; invalid?: boolean }) {
  return (
    <div className={`flex items-center border bg-card ${props.invalid ? "border-destructive" : "border-input"} focus-within:border-foreground ${props.disabled ? "opacity-60" : ""}`}>
      <input
        data-testid={props.testId}
        inputMode={props.numeric ? "decimal" : undefined}
        className={`min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none ${props.numeric ? "num" : ""}`}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.suffix && <span className="px-3 text-xs text-muted-foreground num">{props.suffix}</span>}
    </div>
  );
}

export function Check({ checked, onChange, disabled, label, testId }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; testId: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 border border-input bg-card p-3 text-sm ${disabled ? "opacity-60 cursor-default" : "hover:border-foreground"}`}>
      <input data-testid={testId} type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(0_0%_9%)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Btn({ children, onClick, variant = "solid", disabled, testId, className = "" }: { children: ReactNode; onClick?: () => void; variant?: "solid" | "ghost" | "line"; disabled?: boolean; testId: string; className?: string }) {
  const base = "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40";
  const v = variant === "solid" ? "bg-foreground text-background hover:bg-foreground/85" : variant === "line" ? "border border-foreground hover:bg-foreground hover:text-background" : "hover:bg-muted";
  return <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} className={`${base} ${v} ${className}`}>{children}</button>;
}

export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="rise w-full max-w-md border border-foreground bg-card p-6">
        <DemoTag />
        <h3 className="mt-3 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Btn variant="ghost" onClick={onCancel} testId="button-confirm-cancel">Отмена</Btn>
          <Btn onClick={onConfirm} testId="button-confirm-ok">{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}
