import { useState } from "react";
import { BellRing, CalendarPlus, Flag, Tractor } from "lucide-react";
import { type FieldDispatchItem, type FieldOperation, type FieldProgressReport } from "@workspace/api-client-react";
import { Progress, dateFmt, ha } from "./shared";
import { DailyHistory, DispatcherDailyForm, LifecycleDialog, latestChemDate, limitOf } from "./WorkForms";
import { businessToday } from "../../engineering/repairs/shared";
import { useChemicalWorkflow } from "../chemicals/Workflow";


/** Dispatcher: active field work — daily hectares, completion request. */
export function DispatcherActiveWorks({ items, onSaved }: { items: FieldDispatchItem[]; onSaved: (msg: string) => void }) {
  const today = businessToday();
  const flow = useChemicalWorkflow();
  const [modal, setModal] = useState<{ k: "daily"; op: FieldOperation; report: FieldProgressReport | null; title: string } | { k: "complete"; op: FieldOperation; title: string } | null>(null);
  const active = items.filter((i) => i.operation && !i.operation.actualEnd && i.operation.actualStart);
  const done = (m: string) => { setModal(null); onSaved(m); };
  if (active.length === 0) return <div className="empty-state !min-h-[140px]" data-testid="dispatch-active-empty"><div className="empty-icon"><Tractor size={18} /></div><h3 className="mt-3 text-sm font-bold">Выполняемых работ нет</h3><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Работа появится здесь, когда агроном её начнёт.</p></div>;
  return <>
    <ul className="mt-3 space-y-2.5">{active.map((i) => {
      const op = i.operation!;
      const title = `Поле №${i.fieldNumber} · ${op.name}`;
      const locked = latestChemDate(flow.data?.consumptions ?? [], op.id);
      const waiting = !!op.completionRequestedOn;
      return <li key={op.id} className={`rounded-xl border p-3.5 ${waiting ? "border-[hsl(30_80%_45%/.5)] bg-[hsl(38_92%_50%/.06)]" : "border-border"}`} data-testid={`dispatch-active-row-${op.id}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 text-xs">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{title}</strong><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{i.farm ?? ""} · {i.cropName} · {i.year}</span>{op.isUnplanned && <span className="rounded-full bg-[hsl(38_92%_50%/.14)] px-2 py-0.5 text-[10px] font-bold text-[hsl(30_80%_30%)]">Вне плана</span>}</div>
            <p className="mt-1 text-muted-foreground">Начата {dateFmt(op.actualStart)} · сейчас: <b className="text-foreground">{op.actualMechanic || "—"}</b> · {op.actualEquipment}{op.actualImplement ? ` · ${op.actualImplement}` : ""}</p>
            {op.actualMechanicEmployeeId == null && <p className="mt-1 font-semibold text-destructive" data-testid={`dispatch-active-no-mechanic-${op.id}`}>Механизатор не выбран из справочника — агроном должен обновить сведения о работе.</p>}
            {waiting && <p className="mt-1 inline-flex items-center gap-1 font-semibold text-[hsl(30_80%_30%)]" data-testid={`dispatch-active-waiting-${op.id}`}><BellRing size={12} />Завершение на {dateFmt(op.completionRequestedOn)} ждёт агронома</p>}
            {!waiting && op.approvalNote && op.progressReports.length > 0 && <p className="mt-1 text-[hsl(2_57%_40%)]">Агроном вернул: {op.approvalNote}</p>}
          </div>
          <div className="w-full shrink-0 lg:w-[240px]">
            <Progress value={Math.min(100, (op.actualAreaHa / Math.max(limitOf(op), 0.01)) * 100)} label={title} />
            <p className="text-right font-mono text-[10.5px] text-muted-foreground">{ha(op.actualAreaHa)} из {ha(limitOf(op))}</p>
            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
              <button type="button" className="button button-primary !min-h-[30px] !px-2.5 text-[11px]" disabled={waiting || op.actualMechanicEmployeeId == null} title={op.actualMechanicEmployeeId == null ? "Агроном должен указать механизатора в сведениях о работе" : undefined} onClick={() => setModal({ k: "daily", op, report: null, title })} data-testid={`button-dispatch-daily-${op.id}`}><CalendarPlus size={12} />За день</button>
              <button type="button" className="button button-secondary !min-h-[30px] !px-2.5 text-[11px]" disabled={waiting || !(op.actualAreaHa > 0)} onClick={() => setModal({ k: "complete", op, title })} data-testid={`button-dispatch-complete-${op.id}`}><Flag size={12} />Завершить</button>
            </div>
          </div>
        </div>
        <div className="mt-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1"><DailyHistory op={op} lockedThrough={locked} onEdit={waiting ? undefined : (r) => setModal({ k: "daily", op, report: r, title })} /></div>
      </li>;
    })}</ul>
    {modal?.k === "daily" && <DispatcherDailyForm op={modal.op} report={modal.report} title={modal.title} today={today} onClose={() => setModal(null)} onDone={done} />}
    {modal?.k === "complete" && <LifecycleDialog op={modal.op} action="request_completion" title={modal.title} today={today} onClose={() => setModal(null)} onDone={done} />}
  </>;
}
