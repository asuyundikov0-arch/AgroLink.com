import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { getListFinancialEntriesQueryKey, useCreateFinancialEntry, useUpdateFinancialEntry, type FinancialEntry, type FinancialEntryFields } from "@workspace/api-client-react";
import { businessToday, errorInfo } from "../../engineering/repairs/shared";
import { BOOK_LABEL, BUDGET_CATEGORIES, CASH_EXPENSE_CATEGORIES, CASH_INCOME_CATEGORIES, type Book } from "./shared";

type Props = { book: Book; entry?: FinancialEntry; year: number; defaultUnit: string; units: string[]; onClose: () => void; onSaved: (msg: string, entry: FinancialEntry) => void };

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `fin-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function EntryForm({ book, entry, year, defaultUnit, units, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const create = useCreateFinancialEntry();
  const update = useUpdateFinancialEntry();
  const today = businessToday();
  const [requestId, setRequestId] = useState(newId);
  const [f, setF] = useState<FinancialEntryFields>(() => entry ? {
    book: entry.book, basis: entry.basis, direction: entry.direction, date: entry.date.slice(0, 10), unit: entry.unit, category: entry.category,
    counterparty: entry.counterparty ?? "", description: entry.description ?? "", amountKzt: entry.amountKzt,
  } : { book, basis: "plan", direction: "expense", date: today.startsWith(String(year)) ? today : `${year}-01-01`, unit: defaultUnit, category: "", counterparty: "", description: "", amountKzt: 0 });
  const [amount, setAmount] = useState(entry ? String(entry.amountKzt) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FinancialEntryFields>(k: K, v: FinancialEntryFields[K]) => setF((p) => ({ ...p, [k]: v }));
  const editing = !!entry;
  const suggestions = f.book === "budget" ? BUDGET_CATEGORIES : f.direction === "income" ? CASH_INCOME_CATEGORIES : CASH_EXPENSE_CATEGORIES;

  function validate(): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || Number.isNaN(Date.parse(f.date))) return "Укажите корректную дату.";
    const y = Number(f.date.slice(0, 4)); if (y < 2000 || y > 2100) return "Год даты должен быть от 2000 до 2100.";
    if (!f.unit.trim() || f.unit.trim().length > 120) return "Укажите подразделение (до 120 символов).";
    if (!f.category.trim() || f.category.trim().length > 120) return "Укажите статью (до 120 символов).";
    if ((f.counterparty ?? "").length > 200) return "Контрагент — до 200 символов.";
    if ((f.description ?? "").length > 1000) return "Описание — до 1000 символов.";
    const normalized = amount.replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return "Сумма — положительное число, не более двух знаков после запятой.";
    const n = Number(normalized); if (n <= 0 || n > 99999999999.99) return "Сумма должна быть больше нуля и не более 99 999 999 999,99 ₸.";
    return null;
  }

  async function submit() {
    if (busy || create.isPending || update.isPending) return;
    const v = validate(); if (v) { setError(v); return; }
    const data: FinancialEntryFields = { ...f, direction: f.book === "budget" ? "expense" : f.direction, unit: f.unit.trim(), category: f.category.trim(), counterparty: (f.counterparty ?? "").trim(), description: (f.description ?? "").trim(), amountKzt: Number(amount.replace(/\s/g, "").replace(",", ".")) };
    setBusy(true); setError("");
    try {
      const saved = entry
        ? await update.mutateAsync({ id: entry.id, data: { ...data, version: entry.version } })
        : await create.mutateAsync({ data: { ...data, clientRequestId: requestId } });
      if (!entry) setRequestId(newId());
      await qc.invalidateQueries({ queryKey: getListFinancialEntriesQueryKey() });
      onSaved(entry ? "Запись обновлена." : data.book === "cash_flow" && data.basis === "actual" ? "Записано. Фактическое движение ожидает отметки о проведении и пока не входит в итоги." : "Запись добавлена и учтена в таблице.", saved);
    } catch (err) {
      const info = errorInfo(err);
      setError(info.status === 409 ? `${info.message} Данные обновлены — проверьте актуальную запись.` : info.message);
      void qc.invalidateQueries({ queryKey: getListFinancialEntriesQueryKey() });
    } finally { setBusy(false); }
  }

  return <div className="fin-modal-back" role="dialog" aria-modal="true">
    <form className="fin-modal" data-testid="finance-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div><p className="eyebrow">{BOOK_LABEL[f.book]}</p><h3>{editing ? `Запись №${entry.id}` : f.book === "budget" ? "Новая статья затрат" : "Новое денежное движение"}</h3></div>
        <button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={16} /></button>
      </div>
      <div className="fin-form-grid">
        <label>Вид<div className="fin-seg" data-testid="finance-basis">{(["plan", "actual"] as const).map((b) => <button type="button" key={b} disabled={editing} className={f.basis === b ? "on" : ""} onClick={() => set("basis", b)} data-testid={`finance-basis-${b}`}>{b === "plan" ? "План" : "Факт"}</button>)}</div></label>
        {f.book === "cash_flow" ? <label>Направление<div className="fin-seg" data-testid="finance-direction">{(["income", "expense"] as const).map((d) => <button type="button" key={d} disabled={editing} className={f.direction === d ? "on" : ""} onClick={() => set("direction", d)} data-testid={`finance-direction-${d}`}>{d === "income" ? "Поступление" : "Выплата"}</button>)}</div></label>
          : <label>Направление<div className="fin-seg"><button type="button" disabled className="on">Затраты</button></div></label>}
        {editing && <small className="full">Книга, вид и направление после создания не меняются.</small>}
        <label>Дата<input className="text-input" type="date" min="2000-01-01" max="2100-12-31" value={f.date} onChange={(e) => set("date", e.target.value)} data-testid="finance-date" /></label>
        <label>Сумма, ₸<input className="text-input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="finance-amount" /></label>
        <label>Подразделение<input className="text-input" list="fin-units" maxLength={120} value={f.unit} onChange={(e) => set("unit", e.target.value)} data-testid="finance-unit-input" /><datalist id="fin-units">{units.map((u) => <option key={u} value={u} />)}</datalist></label>
        <label>Статья<input className="text-input" list="fin-cats" maxLength={120} placeholder="Выберите или впишите свою" value={f.category} onChange={(e) => set("category", e.target.value)} data-testid="finance-category" /><datalist id="fin-cats">{suggestions.map((c) => <option key={c} value={c} />)}</datalist><small>Свободная статья: подсказки можно не использовать.</small></label>
        <label className="full">Контрагент<input className="text-input" maxLength={200} value={f.counterparty ?? ""} onChange={(e) => set("counterparty", e.target.value)} data-testid="finance-counterparty" /></label>
        <label className="full">Описание<textarea className="text-input" rows={3} maxLength={1000} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} data-testid="finance-description" /></label>
      </div>
      {!editing && f.book === "cash_flow" && f.basis === "actual" && <p className="fin-note" style={{ marginTop: 12 }}>Фактическое движение создаётся со статусом «Ожидает оплаты» и попадёт в итоги только после отметки о проведении.</p>}
      {error && <p className="fin-err" role="alert">{error}</p>}
      <div className="fin-modal-foot"><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Отмена</button><button type="submit" className="button button-primary" disabled={busy} data-testid="finance-save">{busy ? "Сохраняем…" : "Сохранить"}</button></div>
    </form>
  </div>;
}
