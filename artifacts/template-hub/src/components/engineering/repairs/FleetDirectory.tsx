import { type FormEvent, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Truck } from "lucide-react";
import {
  type FleetEquipment,
  type RepairEntry,
  type RepairExpense,
  useCreateFleetEquipment,
  useDeleteFleetEquipment,
  useUpdateFleetEquipment,
} from "@workspace/api-client-react";
import { CONFLICT_TEXT, ConfirmDialog, Drawer, Field, SaveError, UNITS, type Unit, canManageFleet, dateFmt, errorInfo, isDirector, useInvalidateRepairs } from "./shared";

type Form = { kind: string; registrationNumber: string; unit: Unit };

export default function FleetDirectory({ role, fleet, plan, expenses }: { role: string; fleet: FleetEquipment[]; plan: RepairEntry[]; expenses: RepairExpense[] }) {
  const canEdit = canManageFleet(role);
  const canDelete = isDirector(role);
  const invalidate = useInvalidateRepairs();
  const create = useCreateFleetEquipment();
  const update = useUpdateFleetEquipment();
  const remove = useDeleteFleetEquipment();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ id: number | null; version: number } | null>(null);
  const [form, setForm] = useState<Form>({ kind: "", registrationNumber: "", unit: UNITS[0] });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [toDelete, setToDelete] = useState<FleetEquipment | null>(null);
  const [delError, setDelError] = useState("");
  const [notice, setNotice] = useState("");

  const usage = useMemo(() => {
    const m = new Map<number, { plan: boolean; exp: number }>();
    for (const p of plan) m.set(p.fleetId, { plan: true, exp: m.get(p.fleetId)?.exp ?? 0 });
    for (const e of expenses) { const u = m.get(e.fleetId) ?? { plan: false, exp: 0 }; u.exp += 1; m.set(e.fleetId, u); }
    return m;
  }, [plan, expenses]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return fleet.filter((f) => !t || `${f.kind} ${f.registrationNumber ?? ""}`.toLowerCase().includes(t));
  }, [fleet, q]);

  const open = (f: FleetEquipment | null) => {
    setForm(f ? { kind: f.kind, registrationNumber: f.registrationNumber ?? "", unit: f.unit } : { kind: "", registrationNumber: "", unit: UNITS[0] });
    setEditing(f ? { id: f.id, version: f.version } : { id: null, version: 0 });
    setErrors({}); setSaveError(""); setConflict(false);
  };
  const pending = create.isPending || update.isPending;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!editing || conflict) return;
    const errs: typeof errors = {};
    const kind = form.kind.trim(); const reg = form.registrationNumber.trim().toUpperCase();
    if (!kind) errs.kind = "Укажите вид техники"; else if (kind.length > 200) errs.kind = "Не более 200 символов";
    if (!reg) errs.registrationNumber = "Госномер обязателен"; else if (reg.length > 40) errs.registrationNumber = "Не более 40 символов";
    const dup = fleet.find((f) => f.id !== editing.id && (f.registrationNumber ?? "").toUpperCase() === reg);
    if (reg && dup) errs.registrationNumber = `Уже есть в справочнике: ${dup.kind}`;
    setErrors(errs); setSaveError("");
    if (Object.keys(errs).length) return;
    const data = { kind, registrationNumber: reg, unit: form.unit };
    try {
      if (editing.id === null) await create.mutateAsync({ data });
      else await update.mutateAsync({ id: editing.id, data: { ...data, version: editing.version } });
      await invalidate();
      setNotice(editing.id === null ? `«${kind} · ${reg}» добавлена в справочник.` : `Карточка «${kind} · ${reg}» обновлена.`);
      setEditing(null);
    } catch (err) {
      const info = errorInfo(err);
      if (info.status === 409 && editing.id !== null) { setConflict(true); setSaveError(CONFLICT_TEXT); } else setSaveError(info.message);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDelError("");
    try { await remove.mutateAsync({ id: toDelete.id }); await invalidate(); setNotice(`«${toDelete.kind}» удалена из справочника.`); setToDelete(null); }
    catch (err) { setDelError(errorInfo(err).message); }
  };

  return (
    <section className="surface-card overflow-hidden" data-testid="section-fleet">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div><h2 className="text-sm font-bold">Справочник техники</h2>
          <p className="text-[11px] text-muted-foreground">{canEdit ? "Ведёт главный инженер. Хозяйство карточки определяет фильтр плана и затрат." : "Только просмотр. Изменения вносит главный инженер."}</p></div>
        <div className="flex gap-2">
          <input type="search" className="text-input !min-h-[36px] sm:w-56" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск по справочнику" data-testid="input-fleet-search" />
          {canEdit && <button type="button" className="button button-primary whitespace-nowrap" onClick={() => open(null)} data-testid="button-create-fleet"><Plus size={14} />Техника</button>}
        </div>
      </div>
      {notice && <div className="notice-banner m-4" role="status" data-testid="text-fleet-notice">{notice}</div>}
      {fleet.length === 0 ? (
        <div className="empty-state" data-testid="status-fleet-empty"><div className="empty-icon"><Truck size={20} /></div>
          <h3 className="mt-4 text-sm font-bold">Справочник пуст</h3>
          <p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{canEdit ? "Добавьте технику с видом, госномером и хозяйством — затем её можно включить в план и указать затраты." : "Главный инженер ещё не внёс технику."}</p></div>
      ) : rows.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">Ничего не найдено.</p> : (
        <ul className="divide-y divide-border/70">
          {rows.map((f) => {
            const u = usage.get(f.id);
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5" data-testid={`row-fleet-${f.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{f.kind}</p>
                  <p className="text-[11px] text-muted-foreground"><span className="font-mono">{f.registrationNumber ?? <span className="text-amber-700">госномер не указан</span>}</span> · {f.unit}</p>
                </div>
                <div className="text-[10.5px] text-muted-foreground">{u?.plan ? "в плане" : "не в плане"} · затрат: {u?.exp ?? 0}<br />изм. {dateFmt(f.updatedAt)} · {f.updatedBy}</div>
                {canEdit && <button type="button" className="button button-secondary !min-h-[32px] !px-2.5" onClick={() => open(f)} aria-label={`Изменить ${f.kind}`} data-testid={`button-edit-fleet-${f.id}`}><Pencil size={13} /></button>}
                {canDelete && <button type="button" className="button button-danger border !min-h-[32px] !px-2.5" disabled={!!u} title={u ? "Используется в плане или затратах" : undefined} onClick={() => { setDelError(""); setToDelete(f); }} aria-label={`Удалить ${f.kind}`} data-testid={`button-delete-fleet-${f.id}`}><Trash2 size={13} /></button>}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <form onSubmit={submit} noValidate>
          <Drawer title={editing.id === null ? "Новая техника" : "Карточка техники"} eyebrow={editing.id === null ? "Справочник" : `№${editing.id} · версия ${editing.version}`} onClose={() => !pending && setEditing(null)} testId="form-fleet"
            footer={<><button type="button" className="button button-ghost" onClick={() => setEditing(null)} disabled={pending} data-testid="button-cancel-fleet">Отмена</button>
              <button type="submit" className="button button-primary" disabled={pending || conflict} data-testid="button-save-fleet">{pending ? "Сохраняем..." : "Сохранить"}</button></>}>
            <SaveError message={saveError} conflict={conflict} testId="text-fleet-save-error" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Вид техники *" error={errors.kind} htmlFor="fleet-kind" wide><input id="fleet-kind" className="text-input" maxLength={200} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="Трактор John Deere 8R 410" data-testid="input-fleet-kind" /></Field>
              <Field label="Госномер *" error={errors.registrationNumber} htmlFor="fleet-reg"><input id="fleet-reg" className="text-input font-mono" maxLength={40} value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} placeholder="123 ABC 11" data-testid="input-fleet-registration" /></Field>
              <Field label="Хозяйство" htmlFor="fleet-unit"><select id="fleet-unit" className="text-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })} data-testid="select-fleet-unit">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
            </div>
          </Drawer>
        </form>
      )}
      {toDelete && <ConfirmDialog title="Удалить технику из справочника?" testId="dialog-delete-fleet" error={delError} pending={remove.isPending}
        body={<>«{toDelete.kind} · {toDelete.registrationNumber ?? "без госномера"}» будет удалена. Удаление возможно только для техники без плана и затрат.</>}
        onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />}
    </section>
  );
}
