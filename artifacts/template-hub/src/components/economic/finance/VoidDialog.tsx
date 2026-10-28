import { useState } from "react";
import type { FinancialEntry } from "@workspace/api-client-react";
import { dateFmt, money } from "../../engineering/repairs/shared";
import { typeLabel } from "./shared";

export default function VoidDialog({ entry, busy, error, onCancel, onConfirm }: { entry: FinancialEntry; busy: boolean; error: string; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3 && reason.trim().length <= 500;
  return <div className="fin-modal-back" role="dialog" aria-modal="true">
    <div className="fin-modal" data-testid="finance-void-dialog">
      <p className="eyebrow">Аннулирование записи №{entry.id}</p>
      <h3>{typeLabel(entry)} · {money(entry.amountKzt)}</h3>
      <p className="fin-note" style={{ marginTop: 12 }}>{dateFmt(entry.date)} · {entry.category} · {entry.counterparty || "без контрагента"}. Запись сохранится в истории с исходной суммой, но перестанет учитываться в итогах. Это учётная отметка, а не возврат средств через банк.</p>
      <label className="form-label" style={{ marginTop: 14 }}>Причина (не менее 3 символов)<textarea className="text-input" style={{ marginTop: 6 }} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="finance-void-reason" /></label>
      {error && <p className="fin-err" role="alert">{error}</p>}
      <div className="fin-modal-foot"><button type="button" className="button button-secondary" onClick={onCancel}>Отмена</button><button type="button" className="button button-danger" disabled={!ok || busy} onClick={() => onConfirm(reason.trim())} data-testid="finance-void-confirm">{busy ? "Аннулируем…" : "Аннулировать"}</button></div>
    </div>
  </div>;
}
