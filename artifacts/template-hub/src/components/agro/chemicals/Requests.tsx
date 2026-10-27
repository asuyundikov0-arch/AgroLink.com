import { type FormEvent, type KeyboardEvent, type ReactNode, useState } from "react";
import { FlaskConical, Send } from "lucide-react";
import { getGetChemicalWarehouseQueryKey, useCreateChemicalRequest, useGetChemicalWarehouse } from "@workspace/api-client-react";
import { POLL_MS, errorInfo } from "../grain/shared";
import { ChemError, cqty, parseQty, useChemicalWorkflow, useInvalidateChemicals, validQty } from "./Workflow";

const blank = () => ({ requestId: crypto.randomUUID(), batchId: "", quantity: "", notes: "" });

/**
 * Agronomist entry: request chemicals from the warehouse for one planned chemical operation.
 * Shows only own requests for this operation; requester identity is derived by the server.
 */
export function ChemicalOperationRequests({ operationId, compact, embedded, onSaved }: { operationId: number; compact?: boolean; embedded?: boolean; onSaved?: () => void }) {
  const flow = useChemicalWorkflow();
  const wh = useGetChemicalWarehouse({ query: { queryKey: getGetChemicalWarehouseQueryKey(), refetchInterval: POLL_MS } });
  const m = useCreateChemicalRequest();
  const invalidate = useInvalidateChemicals();
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const op = flow.data?.operations.find((o) => o.id === operationId);
  const mine = (flow.data?.requests ?? []).filter((r) => r.operationId === operationId && r.isMine);
  const batches = (wh.data?.batches ?? []).filter((b) => b.remaining > 0 && !!op && b.farm === op.farm).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const batch = batches.find((b) => String(b.id) === f.batchId);

  const submit = (ev?: FormEvent) => {
    ev?.preventDefault();
    ev?.stopPropagation();
    const e: Record<string, string> = {};
    if (!batch) e.batchId = "Выберите препарат со склада";
    if (!validQty(f.quantity)) e.quantity = "Больше 0, до 3 знаков";
    else if (batch && parseQty(f.quantity) > batch.remaining) e.quantity = `На складе ${cqty(batch.remaining)} ${batch.unit}`;
    setFieldErr(e); setErr("");
    if (Object.keys(e).length) return;
    m.mutate({ data: { requestId: f.requestId, operationId, batchId: Number(f.batchId), quantity: parseQty(f.quantity), notes: f.notes.trim() } }, {
      onSuccess: () => { setF(blank()); setNotice("Заявка отправлена на склад."); void invalidate(); onSaved?.(); window.setTimeout(() => setNotice(""), 4000); },
      onError: (x) => setErr(errorInfo(x).message),
    });
  };

  if (flow.isLoading || wh.isLoading) return <div className="skeleton h-24 rounded-lg" data-testid={`status-chem-req-loading-${operationId}`} />;
  if (flow.isError) return <p className="text-[11px] text-destructive">Заявки на химию не загрузились. <button type="button" className="font-bold underline" onClick={() => void flow.refetch()}>Повторить</button></p>;

  return <div className={compact ? "space-y-2" : "space-y-2 rounded-lg border border-[hsl(200_40%_82%)] bg-[hsl(200_45%_97%)] p-3"} data-testid={`chem-op-requests-${operationId}`}>
    <div className="flex items-center gap-1.5 text-[11px] font-bold"><FlaskConical size={13} />Заявка на химию со склада{op ? ` · ${op.farm}` : ""}</div>
    {mine.length > 0 ? <ul className="space-y-1" data-testid={`list-chem-my-requests-${operationId}`}>{mine.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-card px-2 py-1.5 text-[11px]" data-testid={`row-chem-my-request-${r.id}`}>
      <span className="font-semibold">{r.name}</span>
      <span className="font-mono">{cqty(r.quantity)} {r.unit} · выдано {cqty(r.issuedQuantity)}{r.issuedQuantity >= r.quantity ? " · закрыта" : ""}</span>
    </li>)}</ul> : <p className="text-[10.5px] text-muted-foreground" data-testid={`text-chem-no-requests-${operationId}`}>Ваших заявок по этой операции пока нет. Без заявки начать химобработку нельзя.</p>}
    {!op ? <p className="text-[11px] text-muted-foreground" data-testid={`text-chem-op-unknown-${operationId}`}>Операция не найдена среди химобработок. Обновите данные позже.</p> : op.actualEnd ? <p className="text-[10.5px] text-muted-foreground" data-testid={`text-chem-op-closed-${operationId}`}>Операция завершена, новые заявки не принимаются.</p> : wh.isError ? <p className="text-[11px] text-destructive">Склад химии не загрузился: {errorInfo(wh.error).message}</p> : <Wrap embedded={embedded} onSubmit={submit}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
        <select className="text-input" value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })} aria-label="Препарат" data-testid={`select-chem-request-batch-${operationId}`}>
          <option value="">{batches.length ? "Препарат и партия" : "На складе хозяйства нет остатков"}</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name} · накл. № {b.invoiceNumber} · ост. {cqty(b.remaining)} {b.unit}</option>)}
        </select>
        <input className="text-input font-mono" inputMode="decimal" placeholder={batch ? `Кол-во, ${batch.unit}` : "Кол-во"} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} aria-label="Количество" data-testid={`input-chem-request-qty-${operationId}`} />
      </div>
      {(fieldErr.batchId || fieldErr.quantity) && <p className="text-[10px] font-semibold text-destructive">{[fieldErr.batchId, fieldErr.quantity].filter(Boolean).join(" · ")}</p>}
      <div className="flex gap-2">
        <input className="text-input flex-1" maxLength={1000} placeholder="Примечание" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid={`input-chem-request-notes-${operationId}`} />
        <button type={embedded ? "button" : "submit"} onClick={embedded ? () => submit() : undefined} className="button button-primary shrink-0 text-[11px]" disabled={m.isPending} data-testid={`button-chem-request-submit-${operationId}`}><Send size={12} />{m.isPending ? "Отправляем..." : "Заявить"}</button>
      </div>
      <ChemError msg={err} />
      {notice && <p className="text-[11px] font-semibold text-[hsl(161_45%_26%)]" role="status">{notice}</p>}
    </Wrap>}
  </div>;
}

/** True when the current user already has at least one request for the operation. */
export function useHasOwnChemicalRequest(operationId: number) {
  const flow = useChemicalWorkflow();
  return { loading: flow.isLoading, has: (flow.data?.requests ?? []).some((r) => r.operationId === operationId && r.isMine) };
}

/** Embedded mode renders a div (no nested form inside a parent form); Enter in its inputs submits only the request. */
function Wrap({ embedded, onSubmit, children }: { embedded?: boolean; onSubmit: (ev?: FormEvent) => void; children: ReactNode }) {
  if (!embedded) return <form onSubmit={onSubmit} noValidate className="space-y-2">{children}</form>;
  return <div className="space-y-2" onKeyDown={(ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === "Enter" && ev.target instanceof HTMLInputElement) { ev.preventDefault(); ev.stopPropagation(); onSubmit(); }
  }}>{children}</div>;
}
