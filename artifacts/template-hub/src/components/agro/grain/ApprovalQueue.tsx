import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { type GrainCrop, type GrainLocation, type GrainMovement, useReviewGrainMovement } from "@workspace/api-client-react";
import { ErrorBox, OP_LABEL, dateFmt, errorInfo, tonsKg, useInvalidateGrain } from "./shared";

export default function ApprovalQueue({ movements, crops, locations }: {
  movements: GrainMovement[];
  crops: GrainCrop[];
  locations: GrainLocation[];
}) {
  const pending = movements.filter((movement) => movement.approvalStatus === "pending" && !movement.voidedAt)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id - b.id);
  const cropName = (id: number) => crops.find((crop) => crop.id === id)?.name ?? `#${id}`;
  const placeName = (id: number | null) => id === null ? "—" : locations.find((place) => place.id === id)?.name ?? `#${id}`;
  const review = useReviewGrainMovement();
  const invalidate = useInvalidateGrain();
  const [returning, setReturning] = useState<GrainMovement | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const decide = async (movement: GrainMovement, decision: "approved" | "returned", reviewComment: string) => {
    setError("");
    setNotice("");
    try {
      await review.mutateAsync({ id: movement.id, data: { decision, reviewComment } });
      await invalidate();
      setReturning(null);
      setComment("");
      setNotice(decision === "approved" ? "Операция согласована и учтена в балансе." : "Операция возвращена весовщице.");
    } catch (err) {
      setError(errorInfo(err).message);
    }
  };

  return (
    <section className="surface-card p-4" data-testid="section-grain-approval">
      <p className="eyebrow">Очередь заведующего током ({pending.length})</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Согласованная запись попадёт в остатки и дашборд. Возвращённые записи в балансе не учитываются.</p>
      {notice && <p className="notice-banner mt-3" role="status">{notice}</p>}
      <ErrorBox message={error} testId="error-grain-review" />
      {pending.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground" data-testid="status-grain-approval-empty">Новых операций на согласование нет.</p> : (
        <ul className="mt-3 divide-y divide-border">
          {pending.map((movement) => (
            <li key={movement.id} className="py-4" data-testid={`row-grain-approval-${movement.id}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span>{dateFmt(movement.occurredOn)}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{OP_LABEL[movement.operation]}</span>
                    <span>{cropName(movement.cropId)}</span>
                    <span className="font-mono">{tonsKg(Math.round(movement.quantityTons * 1000))}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[movement.unit, movement.fromLocationId !== null && `из: ${placeName(movement.fromLocationId)}`,
                      movement.toLocationId !== null && `в: ${placeName(movement.toLocationId)}`,
                      movement.fieldName && `поле: ${movement.fieldName}`, `внёс: ${movement.createdBy}`,
                      movement.notes].filter(Boolean).join(" · ")}
                  </p>
                  {movement.operation === "drying" || movement.operation === "cleaning" ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Выход: {tonsKg(Math.round((movement.outputTons ?? 0) * 1000))} · мёртвый сор: {tonsKg(Math.round((movement.deadWasteTons ?? 0) * 1000))} · зерновые отходы: {tonsKg(Math.round((movement.grainWasteTons ?? 0) * 1000))}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="button button-primary !min-h-[32px] text-xs" disabled={review.isPending}
                    onClick={() => void decide(movement, "approved", "")} data-testid={`button-approve-grain-${movement.id}`}>
                    <Check size={13} />Согласовать
                  </button>
                  <button type="button" className="button button-secondary !min-h-[32px] text-xs" disabled={review.isPending}
                    onClick={() => { setReturning(movement); setComment(""); setError(""); }} data-testid={`button-return-grain-${movement.id}`}>
                    <RotateCcw size={13} />Вернуть
                  </button>
                </div>
              </div>
              {returning?.id === movement.id && (
                <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
                  <label className="form-label" htmlFor={`grain-review-comment-${movement.id}`}>Причина возврата</label>
                  <textarea id={`grain-review-comment-${movement.id}`} className="text-input mt-1.5" rows={2} maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} data-testid={`input-grain-review-comment-${movement.id}`} />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" className="button button-secondary !min-h-[30px] text-xs" onClick={() => setReturning(null)}>Отмена</button>
                    <button type="button" className="button button-primary !min-h-[30px] text-xs" disabled={review.isPending || comment.trim().length < 3}
                      onClick={() => void decide(movement, "returned", comment.trim())} data-testid={`button-confirm-return-grain-${movement.id}`}>Вернуть весовщице</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
