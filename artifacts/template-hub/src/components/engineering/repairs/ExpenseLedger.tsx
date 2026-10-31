import { type FormEvent, useMemo, useState } from "react";
import { Pencil, Receipt, Trash2 } from "lucide-react";
import { type FleetEquipment, type RepairExpense, useDeleteRepairExpense, useUpdateRepairExpense } from "@workspace/api-client-react";
import { CATEGORY_LABEL, CATEGORY_ORDER, CONFLICT_TEXT, ConfirmDialog, Drawer, Field, FleetPicker, OverlayForm, SaveError, businessToday, dateFmt, errorInfo, fleetLabel, isDirector, money, useInvalidateRepairs } from "./shared";

type Form = { fleetId: number | null; incurredOn: string; category: RepairExpense["category"]; amount: string; description: string };
const today = businessToday;

export default function ExpenseLedger({ role, expenses, fleet, fleetById }: { role: string; expenses: RepairExpense[]; fleet: FleetEquipment[]; fleetById: Map<number, FleetEquipment> }) {
  const canEdit = isDirector(role);
  const canDelete = isDirector(role);
  const invalidate = useInvalidateRepairs();
  const update = useUpdateRepairExpense();
  const remove = useDeleteRepairExpense();
  const [fleetFilter, setFleetFilter] = useState<number | "">("");
  const [editing, setEditing] = useState<RepairExpense | null>(null);
  const [form, setForm] = useState<Form>({ fleetId: null, incurredOn: today(), category: "current", amount: "", description: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [toDelete, setToDelete] = useState<RepairExpense | null>(null);
  const [delError, setDelError] = useState("");
  const [notice, setNotice] = useState("");

  const rows = useMemo(() => [...expenses].filter((e) => fleetFilter === "" || e.fleetId === fleetFilter)
    .sort((a, b) => (b.incurredOn ?? "").localeCompare(a.incurredOn ?? "") || b.id - a.id), [expenses, fleetFilter]);
  const label = (id: number) => { const f = fleetById.get(id); return f ? fleetLabel(f) : `Техника №${id}`; };

  const open = (e: RepairExpense) => {
    setEditing(e);
    setForm({ fleetId: e.fleetId, incurredOn: e.incurredOn ?? "", category: e.category, amount: String(e.amount), description: e.description });
    setErrors({}); setSaveError(""); setConflict(false);
  };
  const pending = update.isPending;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!editing || conflict) return;
    const errs: typeof errors = {};
    if (!form.fleetId) errs.fleetId = "Выберите технику из справочника";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.incurredOn)) errs.incurredOn = editing.incurredOn === null ? "Для перенесённой записи укажите фактическую дату" : "Укажите дату";
    const raw = form.amount.replace(/\s/g, "").replace(",", ".");
    const amount = Number(raw);
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) errs.amount = "Сумма в тенге, не более 2 знаков после запятой";
    else if (amount <= 0) errs.amount = "Сумма должна быть больше нуля";
    else if (amount > 1e12) errs.amount = "Не более 1 000 000 000 000 ₸";
    if (form.description.length > 3000) errs.description = "Не более 3000 символов";
    setErrors(errs); setSaveError("");
    if (Object.keys(errs).length || !form.fleetId) return;
    const data = { fleetId: form.fleetId, incurredOn: form.incurredOn, category: form.category, amount, description: form.description.trim() };
    try {
      await update.mutateAsync({ id: editing.id, data: { ...data, version: editing.version } });
      await invalidate();
      setNotice(`Затрата обновлена: ${label(data.fleetId)}, ${money(amount)}.`); setEditing(null);
    } catch (err) {
      const info = errorInfo(err);
      if (info.status === 409) { setConflict(true); setSaveError(CONFLICT_TEXT); } else setSaveError(info.message);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDelError("");
    try { await remove.mutateAsync({ id: toDelete.id }); await invalidate(); setNotice("Затрата удалена."); setToDelete(null); }
    catch (err) { setDelError(errorInfo(err).message); }
  };
  const legacyEdit = editing !== null && editing.incurredOn === null;

  return (
    <section className="surface-card overflow-hidden" data-testid="section-expenses">
      <div className="flex flex-col gap-2 border-b border-border bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div><h2 className="text-sm font-bold">Затраты на ремонт</h2><p className="text-[11px] text-muted-foreground">Новые затраты формируются по списаниям со склада запчастей. Прежние записи сохранены.</p></div>
        <div className="flex gap-2">
          <select className="text-input !min-h-[36px] sm:w-56" value={fleetFilter} onChange={(e) => setFleetFilter(e.target.value ? Number(e.target.value) : "")} aria-label="Фильтр по технике" data-testid="select-expense-fleet-filter">
            <option value="">Вся техника</option>{fleet.map((f) => <option key={f.id} value={f.id}>{fleetLabel(f)}</option>)}
          </select>
        </div>
      </div>
      {notice && <div className="notice-banner m-4" role="status" data-testid="text-expense-notice">{notice}</div>}
      {rows.length === 0 ? (
        <div className="empty-state" data-testid="status-expense-empty"><div className="empty-icon"><Receipt size={20} /></div>
          <h3 className="mt-4 text-sm font-bold">Затрат пока нет</h3>
          <p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{fleet.length === 0 ? "Сначала добавьте технику в справочник." : "Списание запчасти на технику со склада автоматически появится в этом отчёте."}</p></div>
      ) : (
        <ul className="divide-y divide-border/70">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5" data-testid={`row-expense-${e.id}`}>
              <div className="w-24 font-mono text-[11px]">{e.incurredOn ? dateFmt(e.incurredOn) : <span className="font-sans text-amber-700">дата неизвестна (перенесено)</span>}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{label(e.fleetId)}</p>
                <p className="truncate text-[11px] text-muted-foreground">{e.source === "warehouse" ? `${e.category === "capital" ? "Капитальный ремонт" : "Текущий ремонт"} · списано со склада` : CATEGORY_LABEL[e.category]}{e.description ? ` · ${e.description}` : ""}{e.source === "legacy" ? " · из прежнего реестра" : ""}</p>
              </div>
              <p className="font-mono text-sm font-bold" data-testid={`text-expense-amount-${e.id}`}>{money(e.amount)}</p>
              <div className="flex gap-1.5">
                {canEdit && e.source !== "warehouse" && <button type="button" className="button button-secondary !min-h-[32px] !px-2.5" onClick={() => open(e)} aria-label="Изменить затрату" data-testid={`button-edit-expense-${e.id}`}><Pencil size={13} /></button>}
                {canDelete && e.source !== "warehouse" && <button type="button" className="button button-danger border !min-h-[32px] !px-2.5" onClick={() => { setDelError(""); setToDelete(e); }} aria-label="Удалить затрату" data-testid={`button-delete-expense-${e.id}`}><Trash2 size={13} /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <OverlayForm onSubmit={submit} noValidate>
        <Drawer title="Изменить затрату" eyebrow={`№${editing.id} · версия ${editing.version}`} onClose={() => !pending && setEditing(null)} testId="form-expense"
            footer={<><button type="button" className="button button-ghost" onClick={() => setEditing(null)} disabled={pending} data-testid="button-cancel-expense">Отмена</button>
              <button type="submit" className="button button-primary" disabled={pending || conflict} data-testid="button-save-expense">{pending ? "Сохраняем..." : "Сохранить"}</button></>}>
            <SaveError message={saveError} conflict={conflict} testId="text-expense-save-error" />
            {legacyEdit && <p className="rounded-lg bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">Запись перенесена из прежнего реестра без даты. Чтобы сохранить изменения, укажите фактическую дату затраты.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Техника *" error={errors.fleetId} htmlFor="exp-fleet" wide><FleetPicker fleet={fleet} value={form.fleetId} onChange={(id) => setForm({ ...form, fleetId: id })} id="exp-fleet" testId="select-expense-fleet" invalid={!!errors.fleetId} /></Field>
              <Field label="Дата *" error={errors.incurredOn} htmlFor="exp-date"><input id="exp-date" type="date" className="text-input" value={form.incurredOn} onChange={(e) => setForm({ ...form, incurredOn: e.target.value })} data-testid="input-expense-date" /></Field>
              <Field label="Категория *" htmlFor="exp-cat"><select id="exp-cat" className="text-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Form["category"] })} data-testid="select-expense-category">{CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></Field>
              <Field label="Сумма, ₸ *" error={errors.amount} htmlFor="exp-amount"><input id="exp-amount" className="text-input font-mono" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="148250.50" data-testid="input-expense-amount" /></Field>
              <Field label="Описание" error={errors.description} htmlFor="exp-desc" wide><textarea id="exp-desc" className="text-input min-h-[80px]" maxLength={3000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-expense-description" /></Field>
            </div>
          </Drawer>
        </OverlayForm>
      )}
      {toDelete && <ConfirmDialog title="Удалить затрату?" testId="dialog-delete-expense" error={delError} pending={remove.isPending}
        body={<>{label(toDelete.fleetId)} · {CATEGORY_LABEL[toDelete.category]} · {money(toDelete.amount)}. Итоги пересчитаются для всех пользователей.</>}
        onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />}
    </section>
  );
}
