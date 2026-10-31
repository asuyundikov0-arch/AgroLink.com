import { type ReactNode, useState } from "react";
import { ArrowLeft, Ban, Banknote, BellRing, CalendarRange, ChevronDown, Cog, FlaskConical, Fuel, History, Layers, MapPin, Play, Plus, Settings2, ShieldCheck, Tractor, UserRound } from "lucide-react";
import { OP_KINDS, kzt, opKind } from "./PlanOperationCard";
import { type AgroField, type FieldCosts, type FieldLifecycleInputAction, type FieldOperation, type FieldSeason, getGetFieldCostsQueryKey, useGetFieldCosts } from "@workspace/api-client-react";
import { FieldCostsPanel, OperationCost } from "./FieldCostsPanel";
import { ChemicalOperationRequests } from "../chemicals/Requests";
import { Drawer, POLL_MS, Progress, StatusPill, canActual, canManage, cx, dateFmt, ha, isGD } from "./shared";
import { SupportingWorksSummary } from "./SupportingWorksEditor";
import { SeedPlanSummary } from "./SeedPlanEditor";
import { DailyHistory, approvalOf, chemNormsMissing, isPendingCompletion, isPendingUnplanned, limitOf, ReviewButtons } from "./WorkForms";
import { CropBadge, cropStyle } from "./PlanRegister";
import { SupportingTasksPanel } from "../supporting-tasks/SupportingTasksPanel";
import { PlannedSupportingTasks, SupportingTaskBatchButton } from "../supporting-tasks/PlannedSupportingTasks";

type Props = {
  field: AgroField; season?: FieldSeason; predecessor?: FieldSeason; year: number; ops: FieldOperation[]; role: string; planFact: ReactNode;
  onBack: () => void; onHistory: () => void; onUnplanned: () => void;
  onWork: (op: FieldOperation) => void; onLifecycle: (op: FieldOperation, action: FieldLifecycleInputAction) => void; onVoid: (op: FieldOperation) => void;
};

const btn = "button button-secondary !min-h-[28px] !px-2 text-[10px]";

export function FieldWorkBoard({ field, season, predecessor, year, ops, role, planFact, onBack, onHistory, onUnplanned, onWork, onLifecycle, onVoid }: Props) {
  const actual = canActual(role) && field.isActive;
  const chief = canManage(role);
  const gd = isGD(role);
  const so = season ? ops.filter((o) => o.seasonId === season.id && o.status !== "cancelled") : [];
  const completionReq = so.filter(isPendingCompletion);
  const active = so.filter((o) => o.status === "in_progress" && !isPendingCompletion(o)).sort((a, b) => (b.actualStart ?? "").localeCompare(a.actualStart ?? ""));
  const requests = so.filter((o) => o.isUnplanned && !o.actualStart).sort((a, b) => b.id - a.id);
  const plan = so.filter((o) => !o.isUnplanned && !o.actualStart).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.id - b.id);
  const costsQuery = useGetFieldCosts(season?.id ?? 0, { query: { enabled: !!season, queryKey: getGetFieldCostsQueryKey(season?.id ?? 0), refetchInterval: POLL_MS } });
  const costByOp = new Map<number, FieldCosts["operations"][number]>((costsQuery.data?.operations ?? []).map((c) => [c.operationId, c]));
  const costsReady = !!costsQuery.data;
  const done = so.filter((o) => o.status === "completed").sort((a, b) => (b.actualEnd ?? "").localeCompare(a.actualEnd ?? ""));

  return (
    <section className="surface-card overflow-hidden" data-testid="section-facts-field">
      <div className="flex flex-col gap-2 border-b border-border bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5" style={season ? cropStyle(season.cropName).row : undefined}>
        <div className="flex items-center gap-3">
          <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={onBack} data-testid="button-facts-back-fields"><ArrowLeft size={13} />К полям</button>
          <div className="min-w-0"><h2 className="flex flex-wrap items-center gap-2 text-sm font-bold">Поле № {field.number} · {year}{season ? <CropBadge crop={season.cropName} /> : <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Севооборот не задан</span>}</h2><p className="text-[11px] text-muted-foreground" data-testid={`text-facts-field-predecessor-${field.id}`}>{field.unit}{season?.variety ? ` · ${season.variety}` : ""} · {ha(season?.areaHa ?? field.areaHa)} · предшественник: {predecessor ? `${predecessor.cropName} (${predecessor.year})` : "Нет данных"}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {planFact}
          <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={onHistory} data-testid={`button-facts-history-${field.id}`}><History size={13} />История</button>
          {actual && season && <button type="button" className="button button-primary !min-h-[30px] !px-2.5 text-[11px]" onClick={onUnplanned} data-testid={`button-facts-unplanned-${field.id}`}><Plus size={13} />Внеплановая работа</button>}
        </div>
      </div>
      {!canActual(role) && !chief && <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground sm:px-5" data-testid="text-facts-readonly">Режим просмотра.</p>}
      {!season ? <Blank icon={<Layers size={18} />} title={`На ${year} год сезона нет`} text="Сезон и план работ добавляет главный агроном." testId="status-facts-no-season" /> : <div className="divide-y divide-border">
        <FieldCostsPanel costs={costsQuery.data} isLoading={costsQuery.isLoading} isError={costsQuery.isError} onRetry={() => { void costsQuery.refetch(); }} />
        {(canActual(role) || chief) && <SupportingTasksPanel role={role} fieldId={field.id} seasonId={season.id} year={year} compact />}

        {completionReq.length > 0 && <Block title="Запрошено завершение" count={completionReq.length} tone="alert" testId="block-completion-requests">
          {completionReq.map((o) => <Card key={o.id} field={field} crop={season.cropName} year={year} role={role} cost={costByOp.get(o.id)} costsReady={costsReady} op={o} tone="alert" testId={`card-completion-${o.id}`}
            meta={<p className="font-semibold text-[hsl(30_80%_30%)]">Диспетчер {o.completionRequestedBy || ""} просит завершить на {dateFmt(o.completionRequestedOn)} · итог {ha(o.actualAreaHa)}</p>}
            actions={(canActual(role)) ? <ReviewButtons approveLabel="Подтвердить завершение" rejectLabel="Вернуть" onApprove={() => onLifecycle(o, "approve_completion")} onReject={() => onLifecycle(o, "reject_completion")} testId={`button-completion-${o.id}`} /> : <span className="text-[10.5px] text-muted-foreground">Ждёт решения агронома</span>} />)}
        </Block>}

        <Block title="Выполняются" count={active.length} testId="block-active">
          {active.length === 0 ? <p className="text-[11px] text-muted-foreground" data-testid="status-facts-active-empty">Сейчас на поле ничего не выполняется.</p> : active.map((o) => <Card key={o.id} field={field} crop={season.cropName} year={year} role={role} cost={costByOp.get(o.id)} costsReady={costsReady} op={o} testId={`row-fact-op-${o.id}`}
            meta={<>{o.approvalNote && o.status === "in_progress" && <p className="text-[hsl(2_57%_40%)]">Возвращено: {o.approvalNote}</p>}</>}
            actions={<>
              {actual && <button type="button" className={btn} onClick={() => onWork(o)} data-testid={`button-fact-resources-${o.id}`}><Settings2 size={12} />Изменить сведения о выполняемой работе</button>}
              {actual && o.requiresChemicals && <ChemExtra op={o} />}
              {gd && <VoidBtn op={o} onVoid={onVoid} />}
            </>} history />)}
        </Block>

        {requests.length > 0 && <Block title="Внеплановые заявки" count={requests.filter(isPendingUnplanned).length} tone={requests.some(isPendingUnplanned) ? "info" : undefined} testId="block-unplanned-requests">
          {requests.map((o) => {
            const st = approvalOf(o);
            return <Card key={o.id} field={field} crop={season.cropName} year={year} role={role} cost={costByOp.get(o.id)} costsReady={costsReady} op={o} testId={`card-unplanned-${o.id}`}
              meta={<>
                <ApprovalPill status={st} id={o.id} />
                {st === "rejected" && o.approvalNote && <p className="text-[hsl(2_57%_40%)]" data-testid={`text-unplanned-reject-reason-${o.id}`}>Причина: {o.approvalNote}</p>}
                {st === "approved" && o.approvalNote && <p className="text-muted-foreground">Комментарий: {o.approvalNote}</p>}
              </>}
              actions={<>
                {st === "pending" && chief && <ReviewButtons approveLabel="Согласовать" rejectLabel="Отклонить" onApprove={() => onLifecycle(o, "approve_unplanned")} onReject={() => onLifecycle(o, "reject_unplanned")} testId={`button-unplanned-review-${o.id}`} />}
                {st === "pending" && !chief && <span className="text-[10.5px] text-muted-foreground">Ждёт главного агронома</span>}
                {st === "approved" && actual && <StartBtn op={o} onWork={onWork} />}
                {gd && <VoidBtn op={o} onVoid={onVoid} />}
              </>} />;
          })}
        </Block>}

        <Block title="План работ" count={plan.length} testId="block-plan">
          {plan.length === 0 ? <p className="text-[11px] text-muted-foreground" data-testid="status-facts-notstarted-empty">Все плановые работы начаты или план пуст.</p> : plan.map((o) => <Card key={o.id} field={field} crop={season.cropName} year={year} role={role} cost={costByOp.get(o.id)} costsReady={costsReady} op={o} testId={`row-fact-planned-${o.id}`}
            actions={<>{actual && <StartBtn op={o} onWork={onWork} />}{gd && <VoidBtn op={o} onVoid={onVoid} />}</>} />)}
        </Block>

        <Block title="Завершённые" count={done.length} testId="block-completed">
          {done.length === 0 ? <p className="text-[11px] text-muted-foreground">Завершённых работ нет.</p> : done.map((o) => <Card key={o.id} field={field} crop={season.cropName} year={year} role={role} cost={costByOp.get(o.id)} costsReady={costsReady} op={o} testId={`row-fact-done-${o.id}`}
            meta={<p className="text-muted-foreground">{o.progressReports.some(r => r.machineReports?.length) ? "Расценки по технике" : o.actualRatePerHa === null ? "Ожидает расценки диспетчера" : "Расценка диспетчера внесена"}</p>}
            actions={gd ? <VoidBtn op={o} onVoid={onVoid} /> : null} history />)}
        </Block>
      </div>}
    </section>
  );
}

function Block({ title, count, tone, testId, collapsed, children }: { title: string; count: number; tone?: "alert" | "info"; testId: string; collapsed?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!collapsed);
  return <div className={cx("px-4 py-3 sm:px-5", tone === "alert" && "bg-[hsl(38_92%_50%/.07)]", tone === "info" && "bg-[hsl(203_87%_33%/.04)]")} data-testid={testId}>
    <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)} data-testid={`${testId}-toggle`}>
      {tone === "alert" && <BellRing size={13} className="text-[hsl(30_80%_35%)]" />}
      <h3 className="text-xs font-bold">{title}</h3>
      <span className={cx("rounded-full px-1.5 py-px font-mono text-[10px] font-bold", tone === "alert" ? "bg-[hsl(30_80%_40%)] text-white" : tone === "info" && count > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{count}</span>
      <ChevronDown size={13} className={cx("ml-auto text-muted-foreground transition-transform", !open && "-rotate-90")} />
    </button>
    {open && <div className="mt-3 space-y-3">{children}</div>}
  </div>;
}

function Card({ op: o, field, crop, year, role, cost, costsReady, meta, actions, tone, history, testId }: { op: FieldOperation; field: AgroField; crop: string; year: number; role: string; cost?: FieldCosts["operations"][number]; costsReady: boolean; meta?: ReactNode; actions?: ReactNode; tone?: "alert"; history?: boolean; testId: string }) {
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
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-bold leading-tight [overflow-wrap:anywhere]">{o.name}</h3><SupportingTaskBatchButton operation={o} field={field} year={year} role={role} /></div>
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
          <Metric icon={<Fuel size={18} />} tone="op-m-fuel" label="ГСМ факт (выдано)" value={fuel} testId={`text-fact-fuel-${o.id}`} />
          <Metric icon={<ShieldCheck size={18} />} tone="op-m-rate" label="ЗП подтв. ОК" value={!costsReady ? "нет данных" : cost ? kzt(cost.salaryCost) : "не подтверждено"} testId={`text-fact-hr-${o.id}`} />
        </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2 pl-5">
      <button type="button" className="op-card-more" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid={`button-fact-details-${o.id}`}><ChevronDown size={13} className={cx("transition-transform", open && "rotate-180")} />{open ? "Скрыть детали" : "Детали затрат"}</button>
      <span className="ml-auto flex flex-wrap justify-end gap-1.5">{actions}{history && <button type="button" className={btn} onClick={() => setShowHist(!showHist)} data-testid={`button-daily-toggle-${o.id}`}><CalendarRange size={12} />По дням ({o.progressReports.length})</button>}</span>
    </div>
    <div className="space-y-1 border-t border-border/60 px-4 pb-3 pl-5 empty:hidden">
      <SeedPlanSummary seeds={o.seeds} opName={o.name} testId={`text-seeds-plan-${o.id}`} />
      <PlannedSupportingTasks operation={o} field={field} year={year} role={role} />
      {started && <SupportingWorksSummary works={o.actualSupportingWorks} title="Сопутствующие работы в выполнении" testId={`text-support-actual-${o.id}`} />}
      {!costsReady ? <p className="pt-2 text-[10.5px] text-muted-foreground" data-testid={`text-op-cost-unavailable-${o.id}`}>Фактические затраты недоступны.</p> : open ? <OperationCost cost={cost} opId={o.id} /> : !cost && <p className="pt-2 text-[10.5px] text-muted-foreground" data-testid={`text-op-cost-empty-${o.id}`}>Затрат по операции пока нет.</p>}
      {showHist && <div className="mt-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5"><DailyHistory op={o} /></div>}
    </div>
  </article>;
}

function Metric({ icon, label, value, tone, testId }: { icon: ReactNode; label: string; value: string; tone: string; testId: string }) {
  return <div className="flex items-center gap-2.5"><span className={cx("op-metric-icon", tone)}>{icon}</span><div className="min-w-0"><p className="text-[10.5px] text-muted-foreground">{label}</p><p className="font-mono text-[12px] font-bold" data-testid={testId}>{value}</p></div></div>;
}

function ApprovalPill({ status, id }: { status: string; id: number }) {
  const m = status === "pending" ? ["На согласовании", "bg-[hsl(203_87%_33%/.12)] text-[hsl(203_87%_26%)]"] : status === "rejected" ? ["Отклонена", "bg-[hsl(2_68%_52%/.12)] text-[hsl(2_57%_40%)]"] : ["Согласована, можно начинать", "bg-[hsl(157_45%_90%)] text-[hsl(161_45%_26%)]"];
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold", m[1])} data-testid={`status-unplanned-approval-${id}`}>{m[0]}</span>;
}

function StartBtn({ op, onWork }: { op: FieldOperation; onWork: (op: FieldOperation) => void }) {
  const noNorms = chemNormsMissing(op);
  return <>
    {noNorms && <span className="text-[10px] font-semibold text-destructive" data-testid={`text-start-blocked-${op.id}`}>Нужны нормы химии от главного агронома</span>}
    <button type="button" className="button button-primary !min-h-[28px] !px-2 text-[10px]" disabled={noNorms} onClick={() => onWork(op)} data-testid={`button-fact-start-${op.id}`}><Play size={11} />Начать работу</button>
  </>;
}

function VoidBtn({ op, onVoid }: { op: FieldOperation; onVoid: (op: FieldOperation) => void }) {
  return <button type="button" className="button button-danger border !min-h-[28px] !px-2 text-[10px]" onClick={() => onVoid(op)} data-testid={`button-fact-void-${op.id}`}><Ban size={12} />Отменить</button>;
}

function ChemExtra({ op }: { op: FieldOperation }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={btn} onClick={() => setOpen(true)} data-testid={`button-fact-chem-request-${op.id}`}><FlaskConical size={12} />Доп. химия</button>
    {open && <Drawer title="Дополнительная заявка на химию" eyebrow={op.name} onClose={() => setOpen(false)} testId={`drawer-chem-request-${op.id}`} footer={<div className="flex justify-end"><button type="button" className="button button-ghost" onClick={() => setOpen(false)}>Закрыть</button></div>}>
      <p className="text-[11px] leading-5 text-muted-foreground">Плановая потребность уже передана складу при начале работы. Здесь — только дополнительная выдача сверх нормы.</p>
      <ChemicalOperationRequests operationId={op.id} compact />
    </Drawer>}
  </>;
}

function Blank({ icon, title, text, testId }: { icon: ReactNode; title: string; text: string; testId: string }) {
  return <div className="empty-state" data-testid={testId}><div className="empty-icon">{icon}</div><h3 className="mt-3 text-sm font-bold">{title}</h3><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">{text}</p></div>;
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
