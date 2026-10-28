import { CheckCheck, Lock, Pencil, Ban } from "lucide-react";
import type { FinancialEntry } from "@workspace/api-client-react";
import { dateFmt, money } from "../../engineering/repairs/shared";
import { canCompleteEntry, canEditEntry, canVoidEntry, SOURCE_LABEL, STATUS_LABEL, stamp, typeLabel } from "./shared";

type Props = { entries: FinancialEntry[]; canManage: boolean; canVoid: boolean; busyId: number | null; onEdit: (e: FinancialEntry) => void; onComplete: (e: FinancialEntry) => void; onVoid: (e: FinancialEntry) => void };

export default function Ledger({ entries, canManage, canVoid, busyId, onEdit, onComplete, onVoid }: Props) {
  return <div className="fin-scroll" data-testid="finance-ledger">
    <table className="fin-table fin-ledger">
      <thead><tr><th>Дата</th><th>Тип</th><th>Статья · подразделение</th><th>Контрагент · описание</th><th style={{ textAlign: "right" }}>Сумма</th><th>Статус</th><th>Источник · история</th><th>Действия</th></tr></thead>
      <tbody>{entries.map((e) => {
        const busy = busyId === e.id;
        return <tr key={e.id} className={e.status === "voided" ? "voided" : ""} data-testid={`finance-row-${e.id}`}>
          <td className="num">{dateFmt(e.date)}</td>
          <td>{typeLabel(e)}</td>
          <td><b>{e.category}</b><small>{e.unit}</small></td>
          <td>{e.counterparty || "—"}<small>{e.description || ""}</small></td>
          <td className="num amt" style={{ textAlign: "right" }}>{e.direction === "income" ? "+" : "−"}{money(e.amountKzt)}</td>
          <td><span className={`fin-pill ${e.status}`}>{STATUS_LABEL[e.status]}</span>{e.status === "voided" && <small>Причина: {e.voidReason || "—"}</small>}</td>
          <td>{SOURCE_LABEL[e.source]}<small>Создал: {e.createdBy || "—"} · {stamp(e.createdAt)}</small><small>Изменил: {e.updatedBy || "—"} · {stamp(e.updatedAt)}</small>{e.completedAt && <small>Проведено: {e.completedBy || "—"} · {stamp(e.completedAt)}</small>}</td>
          <td>{e.source === "spare_part" || e.id < 0 ? <span className="fin-pill" title="Строка формируется из реестра оплат запчастей"><Lock size={10} style={{ display: "inline", marginRight: 4 }} />Из реестра</span>
            : <div className="fin-actions">
              {canManage && canEditEntry(e) && <button type="button" className="button button-secondary" disabled={busy} onClick={() => onEdit(e)} data-testid={`finance-edit-${e.id}`}><Pencil size={12} />Изменить</button>}
              {canManage && canCompleteEntry(e) && <button type="button" className="button button-primary" disabled={busy} onClick={() => onComplete(e)} data-testid={`finance-complete-${e.id}`}><CheckCheck size={12} />{e.direction === "income" ? "Поступило" : "Оплачено"}</button>}
              {canVoid && canVoidEntry(e) && <button type="button" className="button button-danger" disabled={busy} onClick={() => onVoid(e)} data-testid={`finance-void-${e.id}`}><Ban size={12} />Аннулировать</button>}
            </div>}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
