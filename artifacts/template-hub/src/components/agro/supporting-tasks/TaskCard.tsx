import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { type SupportingTask } from "@workspace/api-client-react";
import { cx } from "../fields/shared";
import { DeliveryPill, NOT_EXPENSE_TEXT, TaskStatusPill, dt, dtTime, money } from "./shared";

export function TaskCard({ task: t, actions, highlight }: { task: SupportingTask; actions?: ReactNode; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const s = t.sourceSnapshot;
  const diff = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  const rows: [string, string, string, boolean][] = !s ? [] : [
    ["Название", s.name, t.title, s.name !== t.title],
    ["Техника", s.equipmentName || (s.equipmentId ? `№${s.equipmentId}` : "—"), t.equipmentName || (t.equipmentId ? `№${t.equipmentId}` : "—"), s.equipmentId !== t.equipmentId],
    ["Сотрудники", (s.employeeNames ?? []).join(", ") || (s.employeeIds.length ? s.employeeIds.map((i) => `№${i}`).join(", ") : "—"), t.employeeNames.join(", ") || "—", diff([...s.employeeIds].sort(), [...t.employeeIds].sort())],
    ["Бюджет зарплаты", money(s.salaryCost), money(t.salaryBudget), s.salaryCost !== t.salaryBudget],
    ["Бюджет топлива", money(s.fuelCost), money(t.fuelBudget), s.fuelCost !== t.fuelBudget],
  ];
  return <article className={cx("rounded-lg border bg-card px-3.5 py-3 text-xs", highlight ? "border-foreground/60" : "border-border")} data-testid={`card-supporting-task-${t.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-bold" data-testid={`text-task-number-${t.id}`}>№ {t.id}</span>
          <TaskStatusPill task={t} />
          <span className="font-mono text-[10px] text-muted-foreground">v{t.version}</span>
        </div>
        <h4 className="mt-1 text-[13px] font-bold leading-5" data-testid={`text-task-title-${t.id}`}>{t.title}</h4>
        <p className="text-[11px] text-muted-foreground" data-testid={`text-task-context-${t.id}`}>Поле № {t.fieldNumber} · {t.farm} · {t.year} · {t.operationName} · {s && t.sourceIndex !== null ? <>источник: строка {t.sourceIndex + 1} «{s.name}»</> : <span className="font-semibold text-[hsl(30_80%_30%)]" data-testid={`text-task-manual-${t.id}`}>Внеплановая сопутствующая работа</span>}</p>
      </div>
      <div className="text-right font-mono text-[11px]">
        <p className="font-semibold" data-testid={`text-task-dates-${t.id}`}>{dt(t.startDate)} – {dt(t.endDate)}</p>
        <p className="text-[10px] text-muted-foreground">{t.quantity > 0 ? `${t.quantity} ${t.quantityUnit}` : "объём не указан"}</p>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">{t.services.map((sv) => <DeliveryPill key={sv} task={t} service={sv} />)}</div>
    <div className="mt-2 grid gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
      <p><span className="text-muted-foreground">Техника: </span>{t.equipmentName || "не указана"}</p>
      <p><span className="text-muted-foreground">Сотрудники: </span>{t.employeeNames.join(", ") || "не указаны"}</p>
      <p><span className="text-muted-foreground">Предлагаемый бюджет: </span><span className="font-mono">ЗП {money(t.salaryBudget)} · ГСМ {money(t.fuelBudget)}</span></p>
      <p className="text-muted-foreground">Автор {t.createdBy} · {dtTime(t.createdAt)}{t.sentAt ? ` · отправлено ${dtTime(t.sentAt)}` : ""}</p>
    </div>
    {t.notes && <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-muted/30 px-2 py-1 text-[11px]">{t.notes}</p>}
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      {s ? <button type="button" className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => setOpen(!open)} data-testid={`button-task-compare-${t.id}`}>
        <ChevronDown size={12} className={cx("transition-transform", !open && "-rotate-90")} />План главного агронома и задание
      </button> : <span className="text-[10.5px] text-muted-foreground">Вне плана главного агронома — сравнения нет</span>}
      <div className="flex flex-wrap gap-1.5">{actions}</div>
    </div>
    {open && s && <div className="mt-2 overflow-x-auto rounded-md border border-border" data-testid={`table-task-compare-${t.id}`}>
      <table className="w-full min-w-[420px] text-[11px]">
        <thead className="bg-muted/30 text-left text-[10px] text-muted-foreground"><tr><th className="px-2 py-1 font-semibold" /><th className="font-semibold">По плану (не изменяется)</th><th className="font-semibold">В задании</th></tr></thead>
        <tbody className="divide-y divide-border/60">{rows.map(([k, a, b, changed]) => <tr key={k}><td className="px-2 py-1 text-muted-foreground">{k}</td><td>{a}</td><td className={cx(changed && "font-bold")}>{b}{changed && <span className="ml-1 rounded bg-foreground px-1 text-[9px] text-background">изм.</span>}</td></tr>)}</tbody>
      </table>
    </div>}
    <p className="mt-2 text-[10px] italic text-muted-foreground">{NOT_EXPENSE_TEXT}.</p>
  </article>;
}
