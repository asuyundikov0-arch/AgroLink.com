import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Coins, Lock, Pencil, Plus, RefreshCw, Users, X } from "lucide-react";
import {
  getListEmployeesQueryKey,
  getListPayrollAccrualsQueryKey,
  getListTokPayrollEntriesQueryKey,
  type TokPayrollEntry,
  type TokPayrollInputPayBasis,
  useCreateTokPayrollEntry,
  useListEmployees,
  useListTokPayrollEntries,
  useUpdateTokPayrollEntry,
} from "@workspace/api-client-react";
import { UNITS, dateFmt, errorInfo, Field } from "./grain/shared";

const BASIS: Record<TokPayrollInputPayBasis, { label: string; unit: string; rate: string }> = {
  shift: { label: "Смена", unit: "смен", rate: "₸ за смену" },
  hour: { label: "Час", unit: "ч", rate: "₸ за час" },
  ton: { label: "Тонна", unit: "т", rate: "₸ за тонну" },
  fixed: { label: "Фиксированно", unit: "×", rate: "₸ сумма" },
};
const WORK_PRESETS = ["Погрузка зерна", "Приёмка и разгрузка", "Подработка на ЗАВ", "Сушка", "Охрана тока", "Уборка площадки"];
const moneyFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (v: number) => `${moneyFmt.format(v)} ₸`;
const round2 = (v: number) => Math.round(v * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));

type Form = { workDate: string; unit: string; employeeId: string; workType: string; payBasis: TokPayrollInputPayBasis; quantity: string; rateKzt: string; notes: string };
const blank = (unit: string, date: string): Form => ({ workDate: date, unit, employeeId: "", workType: "", payBasis: "shift", quantity: "1", rateKzt: "", notes: "" });
const decimals = (s: string) => (s.split(/[.,]/)[1] ?? "").length;
const num = (s: string) => Number(s.replace(",", "."));

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.workDate)) e.workDate = "Укажите дату работы.";
  if (!UNITS.includes(f.unit as (typeof UNITS)[number])) e.unit = "Выберите подразделение.";
  if (!f.employeeId) e.employeeId = "Выберите сотрудника из справочника.";
  if (f.workType.trim().length < 2) e.workType = "Опишите работу (минимум 2 символа).";
  const q = num(f.quantity), r = num(f.rateKzt);
  if (f.payBasis === "fixed") { if (q !== 1) e.quantity = "Для фиксированной оплаты количество = 1."; }
  else if (!f.quantity || !Number.isFinite(q) || q <= 0) e.quantity = "Количество должно быть больше нуля.";
  else if (q > 1e6) e.quantity = "Не более 1 000 000.";
  else if (decimals(f.quantity) > 3) e.quantity = "Не более 3 знаков после запятой.";
  if (!f.rateKzt || !Number.isFinite(r) || r <= 0) e.rateKzt = "Ставка должна быть больше нуля.";
  else if (r > 1e9) e.rateKzt = "Не более 1 000 000 000 ₸.";
  else if (decimals(f.rateKzt) > 2) e.rateKzt = "Не более 2 знаков после запятой.";
  if (f.notes.length > 2000) e.notes = "Не более 2000 символов.";
  return e;
}

export default function TokPayrollWorkspace({ demo = false }: { demo?: boolean }) {
  const qc = useQueryClient();
  const entriesQuery = useListTokPayrollEntries({ query: { queryKey: getListTokPayrollEntriesQueryKey(), enabled: !demo, refetchInterval: demo ? false : 15000 } });
  const employeesQuery = useListEmployees({ query: { queryKey: getListEmployeesQueryKey(), enabled: !demo } });
  const create = useCreateTokPayrollEntry();
  const update = useUpdateTokPayrollEntry();

  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [form, setForm] = useState<Form>(() => blank(UNITS[0], today()));
  const [editing, setEditing] = useState<TokPayrollEntry | null>(null);
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [conflict, setConflict] = useState(false);
  const requestId = useRef(uuid());
  const busy = create.isPending || update.isPending;

  const employees = useMemo(() => (employeesQuery.data ?? []).filter((e) => e.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")), [employeesQuery.data]);
  const entries = entriesQuery.data ?? [];
  const filtered = useMemo(() => entries.filter((e) => (unitFilter === "all" || e.unit === unitFilter) && (!from || e.workDate >= from) && (!to || e.workDate.slice(0, 10) <= to))
    .sort((a, b) => b.workDate.localeCompare(a.workDate) || a.employeeName.localeCompare(b.employeeName, "ru") || a.id - b.id), [entries, unitFilter, from, to]);
  const days = useMemo(() => {
    const m = new Map<string, { key: string; date: string; unit: string; total: number; rows: TokPayrollEntry[] }>();
    filtered.forEach((e) => { const key = `${e.workDate.slice(0, 10)}|${e.unit}`; const d = m.get(key) ?? { key, date: e.workDate.slice(0, 10), unit: e.unit, total: 0, rows: [] }; d.total = round2(d.total + e.amountKzt); d.rows.push(e); m.set(key, d); });
    return [...m.values()];
  }, [filtered]);
  const savedTotal = round2(filtered.filter((e) => !e.locked).reduce((s, e) => s + e.amountKzt, 0));
  const sentTotal = round2(filtered.filter((e) => e.locked).reduce((s, e) => s + e.amountKzt, 0));
  const people = new Set(filtered.map((e) => e.employeeId)).size;

  const errs = validate(form);
  const q = num(form.quantity), r = num(form.rateKzt);
  const preview = Number.isFinite(q) && Number.isFinite(r) && q > 0 && q <= 1e6 && r > 0 && r <= 1e9
    ? Number((BigInt(Math.round((form.payBasis === "fixed" ? 1 : q) * 1000)) * BigInt(Math.round(r * 100)) + 500n) / 1000n) / 100
    : null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const invalidate = () => Promise.all([
    qc.invalidateQueries({ queryKey: getListTokPayrollEntriesQueryKey() }),
    qc.invalidateQueries({ queryKey: getListPayrollAccrualsQueryKey({ sourceGroup: "tok" }) }),
  ]);

  const startEdit = (e: TokPayrollEntry) => {
    if (e.locked || demo) return;
    setEditing(e); setTouched(false); setError(""); setConflict(false); setNotice("");
    setForm({ workDate: e.workDate.slice(0, 10), unit: e.unit, employeeId: String(e.employeeId), workType: e.workType, payBasis: e.payBasis, quantity: String(e.quantity), rateKzt: String(e.rateKzt), notes: e.notes ?? "" });
  };
  const cancelEdit = () => { setEditing(null); setTouched(false); setError(""); setConflict(false); setForm((f) => blank(f.unit, f.workDate)); };

  const submit = async () => {
    setTouched(true);
    if (demo) { setNotice("Демо-режим: строка не сохранена, запросы к серверу не отправляются."); return; }
    if (busy || Object.keys(errs).length) return;
    setError(""); setConflict(false); setNotice("");
    const data = { workDate: form.workDate, unit: form.unit, employeeId: Number(form.employeeId), workType: form.workType.trim(), payBasis: form.payBasis, quantity: form.payBasis === "fixed" ? 1 : q, rateKzt: r, notes: form.notes.trim() };
    try {
      if (editing) {
        const saved = await update.mutateAsync({ id: editing.id, data: { ...data, version: editing.version } });
        setNotice(`Строка изменена: ${saved.employeeName} · ${saved.workType} · ${money(saved.amountKzt)}.`);
        setEditing(null);
      } else {
        const saved = await create.mutateAsync({ data: { ...data, requestId: requestId.current } });
        requestId.current = uuid();
        setNotice(`Сохранено: ${saved.employeeName} · ${saved.workType} · ${money(saved.amountKzt)}. Это подготовка начисления, а не выплата.`);
      }
      setForm((f) => ({ ...blank(f.unit, f.workDate), payBasis: f.payBasis, workType: editing ? "" : f.workType, rateKzt: editing ? "" : f.rateKzt }));
      setTouched(false);
      await invalidate();
    } catch (err) {
      const info = errorInfo(err);
      if (info.status === 409) { setConflict(true); setError("Строка изменилась или уже отправлена в отдел кадров. Данные обновлены — форма сохранена, проверьте и повторите."); void invalidate(); }
      else setError(info.status === 409 ? info.message : info.message);
    }
  };

  const show = (k: keyof Form) => (touched ? errs[k] : undefined);

  return <section className="space-y-4" data-testid="tok-payroll-workspace">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="eyebrow">Заведующий током · подготовка начислений</p><h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Зарплата тока</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Записывайте работу каждого сотрудника за день: смена, час, тонна или фиксированная сумма. Сумма = количество × ставка (фикс — ставка). Это не выплата: начисления уходят нарядом в отдел кадров на вкладке «Наряды тока».</p></div>
      {!demo && <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><Clock3 size={12} />Обновление каждые 15 секунд</span>}
    </header>

    {demo && <p className="notice-banner" role="status" data-testid="tok-payroll-demo-notice"><Lock size={15} />Демо-режим просмотра: данные не загружаются и не сохраняются, запросы к серверу не выполняются.</p>}

    <div className="grid gap-3 sm:grid-cols-3">
      <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon setting-icon-yellow"><Coins size={17} /></div><div><p className="eyebrow">Сохранено, не отправлено</p><p className="mt-1 font-mono text-lg font-bold" data-testid="tok-summary-saved">{entriesQuery.isLoading ? "…" : money(savedTotal)}</p></div></article>
      <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon"><Lock size={17} /></div><div><p className="eyebrow">Отправлено в отдел кадров</p><p className="mt-1 font-mono text-lg font-bold" data-testid="tok-summary-sent">{entriesQuery.isLoading ? "…" : money(sentTotal)}</p></div></article>
      <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon"><Users size={17} /></div><div><p className="eyebrow">Сотрудников · строк</p><p className="mt-1 text-lg font-bold" data-testid="tok-summary-count">{entriesQuery.isLoading ? "…" : `${people} · ${filtered.length}`}</p></div></article>
    </div>

    <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
      <section className="surface-card h-fit p-4 sm:p-5 xl:sticky xl:top-4" data-testid="tok-payroll-form">
        <div className="flex items-start justify-between gap-2"><div><p className="eyebrow">{editing ? `Строка № ${editing.id} · версия ${editing.version}` : "Новая строка"}</p><h2 className="mt-1 text-lg font-bold">{editing ? "Изменить начисление" : "Добавить работу"}</h2></div>
          {editing && <button type="button" className="icon-button" onClick={cancelEdit} aria-label="Отменить изменение" data-testid="button-tok-cancel-edit"><X size={15} /></button>}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Дата работы" error={show("workDate")} htmlFor="tok-date"><input id="tok-date" type="date" className="text-input" value={form.workDate} onChange={(e) => set("workDate", e.target.value)} data-testid="input-tok-date" /></Field>
          <Field label="Подразделение" error={show("unit")} htmlFor="tok-unit"><select id="tok-unit" className="text-input" value={form.unit} onChange={(e) => set("unit", e.target.value)} data-testid="select-tok-unit">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
          <Field wide label="Сотрудник (справочник)" error={show("employeeId") ?? (employeesQuery.isError ? "Справочник не загрузился." : undefined)} htmlFor="tok-emp" hint={!demo && !employeesQuery.isLoading && employees.length === 0 ? "Активных сотрудников нет — добавьте их в разделе «Сотрудники»." : undefined}>
            <select id="tok-emp" className="text-input" value={form.employeeId} disabled={employeesQuery.isLoading || demo} onChange={(e) => set("employeeId", e.target.value)} data-testid="select-tok-employee">
              <option value="">{employeesQuery.isLoading ? "Загрузка…" : "Выберите сотрудника"}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.position ? ` — ${e.position}` : ""}</option>)}
              {editing && !employees.some((e) => e.id === editing.employeeId) && <option value={editing.employeeId}>{editing.employeeName} (неактивен)</option>}
            </select></Field>
          <Field wide label="Вид работы" error={show("workType")} htmlFor="tok-work"><input id="tok-work" className="text-input" list="tok-work-presets" maxLength={200} value={form.workType} onChange={(e) => set("workType", e.target.value)} placeholder="Например, погрузка зерна" data-testid="input-tok-worktype" /><datalist id="tok-work-presets">{WORK_PRESETS.map((w) => <option key={w} value={w} />)}</datalist></Field>
          <div className="sm:col-span-2"><p className="form-label">Основание оплаты</p>
            <div className="mt-1.5 grid grid-cols-4 rounded-lg border border-border bg-card p-0.5" role="radiogroup">{(Object.keys(BASIS) as TokPayrollInputPayBasis[]).map((b) => <button key={b} type="button" role="radio" aria-checked={form.payBasis === b} onClick={() => setForm((f) => ({ ...f, payBasis: b, quantity: b === "fixed" ? "1" : f.quantity }))} className={`rounded-md px-2 py-1.5 text-[11px] font-bold ${form.payBasis === b ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`} data-testid={`button-tok-basis-${b}`}>{BASIS[b].label}</button>)}</div></div>
          <Field label={`Количество, ${BASIS[form.payBasis].unit}`} error={show("quantity")} htmlFor="tok-q"><input id="tok-q" inputMode="decimal" className="text-input font-mono" value={form.quantity} disabled={form.payBasis === "fixed"} onChange={(e) => set("quantity", e.target.value)} data-testid="input-tok-quantity" /></Field>
          <Field label={`Ставка, ${BASIS[form.payBasis].rate}`} error={show("rateKzt")} htmlFor="tok-r"><input id="tok-r" inputMode="decimal" className="text-input font-mono" value={form.rateKzt} onChange={(e) => set("rateKzt", e.target.value)} data-testid="input-tok-rate" /></Field>
          <Field wide label="Примечание (необязательно)" error={show("notes")} htmlFor="tok-notes"><textarea id="tok-notes" className="text-input min-h-[60px]" maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} data-testid="input-tok-notes" /></Field>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5"><span className="text-[11px] text-muted-foreground">{form.payBasis === "fixed" ? "Фиксированная сумма" : `${form.quantity || "0"} ${BASIS[form.payBasis].unit} × ${form.rateKzt || "0"} ₸`}</span><span className="font-mono text-base font-bold" data-testid="text-tok-preview">{preview === null ? "—" : money(preview)}</span></div>
        {error && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-semibold text-destructive" role="alert" data-testid="tok-mutation-error"><span>{error}</span>{conflict && <button type="button" className="button button-secondary min-h-7 px-2.5 text-[11px]" onClick={() => void invalidate()} data-testid="button-tok-refresh-conflict"><RefreshCw size={12} />Обновить</button>}</div>}
        {notice && <p className="notice-banner mt-3" role="status" data-testid="tok-notice"><Check size={15} />{notice}</p>}
        <button type="button" className="button button-primary mt-4 w-full text-xs" disabled={busy} onClick={() => void submit()} data-testid="button-tok-submit">{busy ? "Сохраняем…" : editing ? <><Pencil size={13} />Сохранить изменения</> : <><Plus size={13} />Сохранить строку</>}</button>
      </section>

      <section className="surface-card p-4 sm:p-5" data-testid="tok-entries-section">
        <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Журнал начислений по дням</p><h2 className="mt-1 text-lg font-bold">Работы на току</h2></div>
          <div className="flex flex-wrap gap-2">
            <select className="text-input !w-auto text-xs" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} aria-label="Подразделение" data-testid="select-tok-filter-unit"><option value="all">Все подразделения</option>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            <input type="date" className="text-input !w-auto text-xs" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" data-testid="input-tok-filter-from" />
            <input type="date" className="text-input !w-auto text-xs" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По дату" data-testid="input-tok-filter-to" />
            {(unitFilter !== "all" || from || to) && <button type="button" className="button button-secondary text-xs" onClick={() => { setUnitFilter("all"); setFrom(""); setTo(""); }} data-testid="button-tok-filter-reset">Сбросить</button>}
          </div></header>
        {demo ? <div className="flex flex-col items-center py-12 text-center" data-testid="tok-entries-demo"><div className="empty-icon"><Lock size={20} /></div><p className="mt-3 text-sm font-semibold">В демо-режиме журнал не загружается</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Войдите под своей ролью, чтобы увидеть реальные начисления тока.</p></div>
          : entriesQuery.isLoading ? <div className="mt-4 space-y-3"><div className="skeleton h-28 rounded-lg" /><div className="skeleton h-28 rounded-lg" /></div>
          : entriesQuery.isError ? <div className="mt-4" role="alert"><p className="text-sm font-semibold text-destructive">{errorInfo(entriesQuery.error).message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={() => void entriesQuery.refetch()} data-testid="button-tok-retry"><RefreshCw size={12} />Повторить</button></div>
          : days.length === 0 ? <div className="flex flex-col items-center py-12 text-center" data-testid="tok-entries-empty"><div className="empty-icon"><Coins size={20} /></div><p className="mt-3 text-sm font-semibold">{entries.length ? "По фильтру строк нет" : "Начислений пока нет"}</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Добавьте первую работу слева — у одного сотрудника может быть несколько строк за день.</p></div>
          : <div className="mt-3 divide-y divide-border">{days.map((d) => <article key={d.key} className="py-4" data-testid={`tok-day-${d.date}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{dateFmt(d.date)}</h3><span className="meta-chip">{d.unit}</span><span className="text-[10px] text-muted-foreground">{d.rows.length} строк</span></div><span className="font-mono text-sm font-bold">{money(d.total)}</span></div>
            <div className="mt-2 overflow-hidden rounded-lg border border-border/80">{d.rows.map((e) => <div key={e.id} className={`grid items-center gap-1 border-t border-border/70 px-3 py-2 text-[11px] first:border-t-0 sm:grid-cols-[minmax(130px,1.1fr)_minmax(120px,1.2fr)_140px_110px_auto] sm:gap-3 ${editing?.id === e.id ? "bg-muted/50" : ""}`} data-testid={`tok-row-${e.id}`}>
              <span className="font-bold">{e.employeeName}</span>
              <span><span className="font-semibold">{e.workType}</span>{e.notes && <span className="block text-muted-foreground">{e.notes}</span>}</span>
              <span className="font-mono text-muted-foreground">{e.payBasis === "fixed" ? `фикс ${money(e.rateKzt)}` : `${moneyFmt.format(e.quantity)} ${BASIS[e.payBasis].unit} × ${money(e.rateKzt)}`}</span>
              <span className="font-mono font-bold sm:text-right">{money(e.amountKzt)}</span>
              <span className="flex items-center gap-2 sm:justify-end">{e.locked
                ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground" data-testid={`status-tok-sent-${e.id}`}><Lock size={10} />В отделе кадров</span>
                : <><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800" data-testid={`status-tok-saved-${e.id}`}>Сохранено</span><button type="button" className="icon-button" disabled={busy} onClick={() => startEdit(e)} aria-label="Изменить" data-testid={`button-tok-edit-${e.id}`}><Pencil size={13} /></button></>}</span>
            </div>)}</div>
          </article>)}</div>}
      </section>
    </div>
  </section>;
}
