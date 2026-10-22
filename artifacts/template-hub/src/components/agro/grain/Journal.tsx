import { useState } from "react";
import { Ban } from "lucide-react";
import { useVoidGrainMovement, type GrainCrop, type GrainLocation, type GrainMovement } from "@workspace/api-client-react";
import { ErrorBox, OP_LABEL, STOCK_LABEL, cx, dateFmt, errorInfo, isGD, kg, n0, pct, tonsKg, useInvalidateGrain } from "./shared";

export default function Journal({ role, movements, crops, locations }: { role: string; movements: GrainMovement[]; crops: GrainCrop[]; locations: GrainLocation[] }) {
  const [voiding, setVoiding] = useState<GrainMovement | null>(null);
  const cn = (id: number) => crops.find((c) => c.id === id)?.name ?? `#${id}`;
  const ln = (id: number | null) => (id === null ? "" : locations.find((l) => l.id === id)?.name ?? `#${id}`);
  const rows = [...movements].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id);
  return (
    <section className="surface-card p-4" data-testid="section-grain-journal">
      <p className="eyebrow">Журнал операций ({rows.length})</p>
      {!rows.length ? <p className="py-8 text-center text-xs text-muted-foreground" data-testid="status-journal-empty">Записей по выбранным фильтрам нет.</p> : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((m) => (
            <li key={m.id} className={cx("flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center", m.voidedAt && "opacity-60")} data-testid={`row-movement-${m.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span>{dateFmt(m.occurredOn)}</span><span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{OP_LABEL[m.operation]}</span><span>{cn(m.cropId)}</span>{m.stockKind === "grain_waste" && <span className="rounded bg-[hsl(39_100%_52%/.18)] px-1.5 py-0.5 text-[10px]" data-testid={`text-movement-kind-${m.id}`}>{STOCK_LABEL.grain_waste}</span>}
                  {m.voidedAt && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive" data-testid={`status-voided-${m.id}`}>Отменено — не в остатках</span>}
                </div>
                <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                  {[m.unit, m.fromLocationId !== null && `из: ${ln(m.fromLocationId)}`, m.toLocationId !== null && `в: ${ln(m.toLocationId)}`, m.fieldName && `поле: ${m.fieldName}`, m.counterparty && `покупатель: ${m.counterparty}`, m.notes, `внёс: ${m.createdBy}`].filter(Boolean).join(" · ")}
                </p>
                {(m.operation === "drying" || m.operation === "cleaning") && <ProcDetails m={m} ln={ln} />}
                {m.voidedAt && <p className="text-[11px] text-destructive">Отменил {m.voidedBy} {dateFmt(m.voidedAt)}: {m.voidReason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={cx("font-mono text-sm font-bold", m.voidedAt && "line-through")} data-testid={`text-movement-qty-${m.id}`}>{m.operation === "sale" ? "−" : m.operation === "transfer" || m.operation === "drying" || m.operation === "cleaning" ? "↔ " : "+"}{tonsKg(kg(m.quantityTons))}</span>
                {isGD(role) && !m.voidedAt && <button type="button" className="button button-danger !min-h-[30px] border" onClick={() => setVoiding(m)} data-testid={`button-void-${m.id}`}><Ban size={13} />Отменить</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {voiding && <VoidDialog m={voiding} onClose={() => setVoiding(null)} />}
    </section>
  );
}

function VoidDialog({ m, onClose }: { m: GrainMovement; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const mut = useVoidGrainMovement();
  const invalidate = useInvalidateGrain();
  const go = () => {
    if (reason.trim().length < 3) { setErr("Причина — минимум 3 символа"); return; }
    setErr("");
    mut.mutate({ id: m.id, data: { reason: reason.trim() } }, { onSuccess: () => { invalidate(); onClose(); }, onError: (e) => setErr(errorInfo(e).message) });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(210_43%_17%/.4)] p-4" role="alertdialog" aria-modal="true" aria-label="Отмена операции" data-testid="dialog-void">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
        <h2 className="text-base font-bold">Отменить операцию №{m.id}?</h2>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Запись останется в журнале для аудита, но перестанет учитываться в остатках. Если отмена приведёт к отрицательному остатку позже, сервер её отклонит.</p>
        <label className="form-label mt-3" htmlFor="void-reason">Причина</label>
        <textarea id="void-reason" className="text-input mt-1.5" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-void-reason" />
        <div className="mt-2"><ErrorBox message={err} testId="error-void" /></div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={mut.isPending} data-testid="button-void-cancel">Назад</button>
          <button type="button" className="button !bg-destructive text-white" onClick={go} disabled={mut.isPending} data-testid="button-void-confirm">{mut.isPending ? "Отменяем..." : "Отменить операцию"}</button>
        </div>
      </div>
    </div>
  );
}

function ProcDetails({ m, ln }: { m: GrainMovement; ln: (id: number | null) => string }) {
  const i = kg(m.quantityTons), o = kg(n0(m.outputTons)), d = kg(n0(m.deadWasteTons)), g = kg(n0(m.grainWasteTons)), w = kg(n0(m.moistureLossTons));
  const items: [string, string, number][] = [["input", "подано", i], ["output", "выход", o], ["dead", "мёртвый сор", d], ["grainwaste", "зерн. отходы", g], ["moisture", "усушка", w]];
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px]" data-testid={`details-processing-${m.id}`}>
      {items.map(([k, l, v]) => <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono" data-testid={`text-movement-${k}-${m.id}`}>{l}: {tonsKg(v)}{k !== "input" ? ` (${pct(v, i)})` : ""}</span>)}
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">разница зерна: {tonsKg(i - o)} ({pct(i - o, i)})</span>
      <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive">безвозвр. убыль: {tonsKg(d + w)} ({pct(d + w, i)})</span>
      {g > 0 && m.wasteToLocationId != null && <span className="text-muted-foreground">отходы в: {ln(m.wasteToLocationId)}</span>}
    </div>
  );
}
