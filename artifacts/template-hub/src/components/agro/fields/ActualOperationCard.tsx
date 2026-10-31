import { type ReactNode, useState } from "react";
import { Banknote, CalendarRange, ChevronDown, Cog, FlaskConical, Fuel, MapPin, ShieldCheck, Sprout, Tractor, UserRound } from "lucide-react";
import type { AgroField, FieldCosts, FieldOperation } from "@workspace/api-client-react";
import { OP_KINDS, kzt, opKind } from "./PlanOperationCard";
import { OperationCost } from "./FieldCostsPanel";
import { Progress, StatusPill, cx, dateFmt, ha } from "./shared";
import { SupportingWorksSummary } from "./SupportingWorksEditor";
import { SeedPlanSummary } from "./SeedPlanEditor";
import { DailyHistory, limitOf } from "./WorkForms";
import { PlannedSupportingTasks, SupportingTaskBatchButton } from "../supporting-tasks/PlannedSupportingTasks";

const btn = "button button-secondary !min-h-[28px] !px-2 text-[10px]";

/** Shared actual-operation card (FieldWorkBoard + read-only field map). readOnly hides every mutating control. */
export function ActualOperationCard({ op: o, field, crop, year, role, cost, costsReady, meta, actions, tone, history, testId, readOnly = false }: { op: FieldOperation; field: AgroField; crop: string; year: number; role: string; cost?: FieldCosts["operations"][number]; costsReady: boolean; meta?: ReactNode; actions?: ReactNode; tone?: "alert"; history?: boolean; testId: string; readOnly?: boolean }) {
  const [showHist, setShowHist] = useState(false);
  const [open, setOpen] = useState(false);
  const started = !!o.actualStart;
  const ms = resourcesOf(o);
  const kind = opKind(o.name);
  const K = OP_KINDS[kind];
  const Icon = K.icon;
  const perMachine = o.progressReports.some((r) => r.machineReports?.length);
  const rate = !started ? "работа не начата" : perMachine ? "По технике" : o.actualRatePerHa === null ? "ожидает диспетчера" : `${kzt(o.actualRatePerHa)}/га`;
  const earned = !started ? "—" : perMachine || o.actualRatePerHa !== null ? kzt(o.actualPayAmount) : "нет расценки";
  const fuel = !costsReady ? "нет данных" : cost ? kzt(cost.fuelCost) : "не выдавалось";
  const seeds = !costsReady ? "нет данных" : cost ? kzt(cost.seedCost ?? 0) : "не выдавались";
  return <article className={cx("op-card text-xs", tone === "alert" && "ring-1 ring-[hsl(30_80%_45%/.6)]")} style={{ ["--op" as string]: K.hue }} data-kind={kind} data-testid={testId}>
    <div className="grid gap-4 p-4 pl-5 md:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.5fr)] md:gap-6">
      <div className="min-w-0">
        <div className="font-mono text-[12px] leading-5" data-testid={`text-fact-dates-${o.id}`}>
          {o.isUnplanned ? <p className="text-muted-foreground">предложено {dateFmt(o.plannedStart)}</p> : <p className={started ? "text-muted-foreground" : "font-bold"}>{dateFmt(o.plannedStart)} – {dateFmt(o.plannedEnd)}<span className="ml-1 font-normal text-muted-foreground">план</span></p>}
          {started && <p className="font-bold text-foreground">{dateFmt(o.actualStart)} – {o.actualEnd ? dateFmt(o.actualEnd) : "…"}<span className="ml-1 font-normal text-muted-foreground">факт</span></p>}
        </div>
        <div className="mt-2.5 flex items-start gap-3">
          <span className="op-card-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-bold leading-tight [overflow-wrap:anywhere]">{o.name}</h3>{!readOnly && <SupportingTaskBatchButton operation={o} field={field} year={year} role={role} />}</div>
            <p className="text-[12px] text-muted-foreground">{crop}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin size={12} />Поле {field.number} · {field.unit}</p>
            <div className="flex flex-wrap items-center gap-1.5">{o.isUnplanned && <span className="rounded-full bg-[hsl(38_92%_50%/.14)] px-2 py-0.5 text-[10px] font-bold text-[hsl(30_80%_30%)]">Вне плана</span>}{(o.actualStart || !o.isUnplanned) && <StatusPill op={o} />}{o.requiresChemicals && <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(200_45%_92%)] px-2 py-0.5 text-[10px] font-bold text-[hsl(203_60%_28%)]"><FlaskConical size={10} />химия{o.chemicalPlan?.length ? ` · ${o.chemicalPlan.length}` : " · нормы не заданы"}</span>}</div>
            {!o.isUnplanned && <p className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground"><MapPin size={12} />план {ha(o.plannedAreaHa)}</p>}
            {started && <div className="max-w-[220px]" data-testid={`text-fact-area-${o.id}`}>{o.isUnplanned ? <p className="font-mono text-[11px] font-bold">Факт: {ha(o.actualAreaHa)} из {ha(limitOf(o))}</p> : <><Progress value={o.progressPercent} label={`Выполнено ${o.name}`} /><p className="font-mono text-[10.5px]">Факт: <b>{ha(o.actualAreaHa)}</b> из {ha(o.plannedAreaHa)}</p></>}</div>}
            <div className="space-y-1 text-[10.5px]">{meta}</div>
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-[9.5px] font-bold uppercase tracking-[.12em] text-muted-foreground">{started || o.isUnplanned ? "Текущие ресурсы" : "Ресурсы по плану"}</p>
        <div className="space-y-2.5" data-testid={`text-fact-mechanic-${o.id}`}>
          {ms.map((m, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" data-testid={`row-fact-machine-${o.id}-${i}`}>
              <div className="flex min-w-0 items-start gap-2.5"><Tractor size={20} className="mt-0.5 shrink-0 text-foreground/80" />
                <div className="min-w-0"><p className="text-[10.5px] text-muted-foreground">Техника{ms.length > 1 ? ` ${i + 1}` : ""}</p><p className="text-[12.5px] font-semibold [overflow-wrap:anywhere]">{dash(m.equipment, "не указана")}</p>
                  <p className="flex items-center gap-1 text-[11px] [overflow-wrap:anywhere]"><UserRound size={11} className="text-muted-foreground" />{dash(m.employee)}</p></div></div>
              <div className="flex min-w-0 items-start gap-2.5"><Cog size={20} className="mt-0.5 shrink-0 text-foreground/80" />
                <div className="min-w-0"><p className="text-[10.5px] text-muted-foreground">Агрегат</p><p className="text-[12.5px] font-semibold [overflow-wrap:anywhere]">{dash(m.implement)}</p></div></div>
              {m.reported && <div className="font-mono text-[10.5px] sm:text-right" data-testid={`text-fact-machine-earned-${o.id}-${i}`}><p>{ha(m.reported.area)}</p><p className="text-muted-foreground">начислено {kzt(m.reported.pay)}</p></div>}
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/60 pt-3 sm:grid-cols-2 xl:grid-cols-4" data-testid={`text-fact-metrics-${o.id}`}>
          <Metric icon={<Banknote size={18} />} tone="op-m-rate" label="Факт. расценка" value={rate} testId={`text-fact-rate-${o.id}`} />
          <Metric icon={<UserRound size={18} />} tone="op-m-pay" label="Начислено (расчёт)" value={earned} testId={`text-fact-earned-${o.id}`} />
          <Metric icon={<Sprout size={18} />} tone="op-m-rate" label="Семена факт" value={seeds} testId={`text-fact-seeds-${o.id}`} />
          <Metric icon={<Fuel size={18} />} tone="op-m-fuel" label="ГСМ факт (выдано)" value={fuel} testId={`text-fact-fuel-${o.id}`} />
          <Metric icon={<ShieldCheck size={18} />} tone="op-m-rate" label="ЗП подтв. ОК" value={!costsReady ? "нет данных" : cost ? kzt(cost.salaryCost) : "не подтверждено"} testId={`text-fact-hr-${o.id}`} />
        </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2 pl-5">
      <button type="button" className="op-card-more" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid={`button-fact-details-${o.id}`}><ChevronDown size={13} className={cx("transition-transform", open && "rotate-180")} />{open ? "Скрыть детали" : "Детали затрат"}</button>
      <span className="ml-auto flex flex-wrap justify-end gap-1.5">{!readOnly && actions}{history && <button type="button" className={btn} onClick={() => setShowHist(!showHist)} data-testid={`button-daily-toggle-${o.id}`}><CalendarRange size={12} />По дням ({o.progressReports.length})</button>}</span>
    </div>
    <div className="space-y-1 border-t border-border/60 px-4 pb-3 pl-5 empty:hidden">
      <SeedPlanSummary seeds={o.seeds} opName={o.name} testId={`text-seeds-plan-${o.id}`} />
      {readOnly
        ? <SupportingWorksSummary works={o.supportingWorks} title="Плановые сопутствующие работы" testId={`text-support-plan-${o.id}`} />
        : <PlannedSupportingTasks operation={o} field={field} year={year} role={role} />}
      {started && <SupportingWorksSummary works={o.actualSupportingWorks} title="Сопутствующие работы в выполнении" testId={`text-support-actual-${o.id}`} />}
      {!costsReady ? <p className="pt-2 text-[10.5px] text-muted-foreground" data-testid={`text-op-cost-unavailable-${o.id}`}>Фактические затраты недоступны.</p> : open ? <OperationCost cost={cost} opId={o.id} /> : !cost && <p className="pt-2 text-[10.5px] text-muted-foreground" data-testid={`text-op-cost-empty-${o.id}`}>Затрат по операции пока нет.</p>}
      {showHist && <div className="mt-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5"><DailyHistory op={o} /></div>}
    </div>
  </article>;
}

function Metric({ icon, label, value, tone, testId }: { icon: ReactNode; label: string; value: string; tone: string; testId: string }) {
  return <div className="flex items-center gap-2.5"><span className={cx("op-metric-icon", tone)}>{icon}</span><div className="min-w-0"><p className="text-[10.5px] text-muted-foreground">{label}</p><p className="font-mono text-[12px] font-bold" data-testid={testId}>{value}</p></div></div>;
}

const dash = (v: string, t = "не указан") => v || <span className="text-muted-foreground">{t}</span>;
type Res = { employee: string; equipment: string; implement: string; reported?: { area: number; pay: number } };
/** Current resources: actualAssignments for started/unplanned ops, planned assignments otherwise; legacy single fields as fallback. Not daily history. */
function resourcesOf(o: FieldOperation): Res[] {
  const live = !!o.actualStart || o.isUnplanned;
  const rows = live ? o.actualAssignments : o.plannedAssignments;
  const reps = live ? o.progressReports.flatMap((p) => p.machineReports ?? []) : [];
  const rep = (eq: number, em: number) => { const xs = reps.filter((x) => x.equipmentId === eq && x.employeeId === em); return xs.length ? { area: xs.reduce((t, x) => t + x.dailyAreaHa, 0), pay: Math.round(xs.reduce((t, x) => t + x.dailyAreaHa * x.ratePerHa, 0) * 100) / 100 } : undefined; };
  if (rows?.length) return rows.map((r) => ({ employee: r.employeeName || (r.employeeId ? `Сотрудник №${r.employeeId}` : ""), equipment: r.equipmentName || (r.equipmentId ? `Техника №${r.equipmentId}` : ""), implement: r.implement || "", reported: rep(r.equipmentId, r.employeeId) }));
  return [live ? { employee: o.actualMechanic || "", equipment: o.actualEquipment || "", implement: o.actualImplement || "" } : { employee: o.responsible || "", equipment: o.plannedEquipment || "", implement: o.plannedImplement || "" }];
}
