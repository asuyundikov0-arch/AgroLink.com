import { useState } from "react";
import { Check, X } from "lucide-react";
import { useReviewSeedMovement, type SeedMovement } from "@workspace/api-client-react";
import { ErrorBox, cx, dateFmt, errorInfo } from "../grain/shared";
import { SEED_KIND_LABEL, SEED_STATUS_LABEL, kzt, tn, useInvalidateSeeds } from "./shared";

type Status = "all" | SeedMovement["approvalStatus"];

export default function SeedJournal({ movements, canReview, placeName, reviewOnly = false }: { movements: SeedMovement[]; canReview: boolean; placeName: (id: number | null) => string; reviewOnly?: boolean }) {
  const [status, setStatus] = useState<Status>("all");
  const selectedStatus = reviewOnly ? "pending" : status;
  const rows = movements.filter((m) => selectedStatus === "all" || m.approvalStatus === selectedStatus)
    .slice().sort((a, b) => (a.approvalStatus === "pending" ? 0 : 1) - (b.approvalStatus === "pending" ? 0 : 1) || b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id);
  const count = (s: Status) => (s === "all" ? movements.length : movements.filter((m) => m.approvalStatus === s).length);
  return (
    <section className="surface-card" data-testid="section-seed-journal">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-bold">{reviewOnly ? "Согласование операций с семенами" : "Журнал склада семян"}</h3>
        {!reviewOnly && <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist">
          {(["all", "pending", "approved", "rejected"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} onClick={() => setStatus(s)} data-testid={`tab-seed-status-${s}`}
              className={cx("rounded-md px-2.5 py-1 text-[10.5px] font-bold", status === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {s === "all" ? "Все" : SEED_STATUS_LABEL[s]} ({count(s)})</button>
          ))}
        </div>}
      </div>
      {rows.length === 0 ? (
        <div className="empty-state !min-h-[160px]" data-testid="status-seed-journal-empty"><p className="text-sm font-bold">Записей нет</p><p className="mt-1 text-xs text-muted-foreground">Покупки, перевод зерна в семена и выдачи на поля появятся здесь.</p></div>
      ) : (
        <ul className="divide-y divide-border/70">{rows.map((m) => <Row key={m.id} m={m} canReview={canReview} placeName={placeName} />)}</ul>
      )}
    </section>
  );
}

function Row({ m, canReview, placeName }: { m: SeedMovement; canReview: boolean; placeName: (id: number | null) => string }) {
  const [open, setOpen] = useState<null | "approved" | "rejected">(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const review = useReviewSeedMovement();
  const invalidate = useInvalidateSeeds();
  const submit = async () => {
    if (!open || review.isPending) return;
    if (open === "rejected" && !note.trim()) { setErr("Укажите причину отклонения"); return; }
    setErr("");
    try { await review.mutateAsync({ id: m.id, data: { decision: open, note: note.trim() || undefined } }); setOpen(null); setNote(""); }
    catch (e) { setErr(errorInfo(e).message); }
    finally { void invalidate(); }
  };
  const tone = m.kind === "issue" ? "text-[hsl(33_76%_62%)]" : "text-[hsl(152_45%_62%)]";
  const detail = [m.unit,
    m.kind === "receipt" && `накладная ${m.invoiceNumber || "—"} · ${m.supplier || "—"}`,
    m.kind === "from_grain" && `из: ${placeName(m.fromLocationId)}`,
    m.kind === "issue" && `поле ${m.fieldNumber || "—"}${m.operationId ? ` · операция #${m.operationId}` : ""}`,
    m.supportingTaskId && `задание №${m.supportingTaskId}`,
    m.truckNumber && `машина ${m.truckNumber} · водитель ${m.driverName || "—"}`,
    `внёс: ${m.createdBy}`, m.reviewedBy && `проверил: ${m.reviewedBy}`].filter(Boolean).join(" · ");
  return (
    <li className="px-4 py-3" data-testid={`row-seed-movement-${m.id}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span>{dateFmt(m.occurredOn)}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{SEED_KIND_LABEL[m.kind]}</span>
            <span>{m.cropName}</span>
            <span className={cx("rounded px-1.5 py-0.5 text-[10px]", m.approvalStatus === "pending" ? "bg-amber-100 text-amber-900" : m.approvalStatus === "rejected" ? "bg-rose-100 text-rose-900" : "bg-[hsl(152_45%_40%/.2)] text-[hsl(152_45%_75%)]")} data-testid={`status-seed-${m.id}`}>{SEED_STATUS_LABEL[m.approvalStatus]}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
          {m.notes && <p className="mt-0.5 text-[11px] text-muted-foreground">{m.notes}</p>}
          {m.reviewNote && <p className="mt-1 text-[11px] text-rose-300" data-testid={`text-seed-review-note-${m.id}`}>Комментарий: {m.reviewNote}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={cx("font-mono text-sm font-bold", tone, m.approvalStatus === "rejected" && "line-through opacity-60")} data-testid={`text-seed-qty-${m.id}`}>{m.kind === "issue" ? "−" : "+"}{tn(m.quantityTons)}</p>
          <p className="font-mono text-[10.5px] text-muted-foreground" data-testid={`text-seed-amount-${m.id}`}>{kzt(m.amount)} · {kzt(m.pricePerTon)}/т{m.kind === "issue" && m.approvalStatus === "pending" ? " · предварительно" : ""}</p>
        </div>
      </div>
      {canReview && m.approvalStatus === "pending" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="button button-primary !min-h-[30px] text-xs" disabled={review.isPending} onClick={() => { setOpen("approved"); setErr(""); }} data-testid={`button-seed-approve-${m.id}`}><Check size={13} />Согласовать</button>
          <button type="button" className="button button-danger !min-h-[30px] border text-xs" disabled={review.isPending} onClick={() => { setOpen("rejected"); setErr(""); }} data-testid={`button-seed-reject-${m.id}`}><X size={13} />Отклонить</button>
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <label className="form-label" htmlFor={`seed-note-${m.id}`}>{open === "approved" ? "Комментарий (необязательно)" : "Причина отклонения"}</label>
          <textarea id={`seed-note-${m.id}`} rows={2} maxLength={1000} className="text-input" value={note} onChange={(e) => setNote(e.target.value)} data-testid={`input-seed-note-${m.id}`} />
          <ErrorBox message={err} testId={`text-seed-review-error-${m.id}`} />
          <div className="flex justify-end gap-2">
            <button type="button" className="button button-ghost !min-h-[30px] text-xs" onClick={() => setOpen(null)} disabled={review.isPending}>Отмена</button>
            <button type="button" className={cx("button !min-h-[30px] text-xs", open === "approved" ? "button-primary" : "button-danger border")} disabled={review.isPending} onClick={() => void submit()} data-testid={`button-seed-confirm-${m.id}`}>
              {review.isPending ? "Сохранение…" : open === "approved" ? "Подтвердить" : "Отклонить"}</button>
          </div>
        </div>
      )}
    </li>
  );
}
