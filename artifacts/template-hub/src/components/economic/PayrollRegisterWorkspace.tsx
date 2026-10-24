import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  Plus,
  Send,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import {
  getListPayrollRegistersQueryKey,
  type PayrollRegister,
  type PayrollRegisterCreateInput,
  type PayrollRegisterEntry,
  type PayrollRegisterUpdateInput,
  useCreatePayrollRegister,
  useListPayrollRegisters,
  useSendPayrollRegister,
  useUpdatePayrollRegister,
} from "@workspace/api-client-react";
import { errorInfo, money } from "../engineering/repairs/shared";

type EntryDraft = {
  key: string;
  employeeName: string;
  workType: string;
  details: string;
  amountKzt: string;
};

type RegisterDraft = {
  id: number | null;
  version: number | null;
  workDate: string;
  unit: string;
  entries: EntryDraft[];
};

const units = ["АПК Арыстан Grain", "АФ Веденовка"];

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function newEntry(): EntryDraft {
  return { key: `${Date.now()}-${Math.random()}`, employeeName: "", workType: "", details: "", amountKzt: "" };
}

function emptyDraft(): RegisterDraft {
  return { id: null, version: null, workDate: today(), unit: units[0], entries: [newEntry()] };
}

function entryDraft(entry: PayrollRegisterEntry): EntryDraft {
  return {
    key: `entry-${entry.id}`,
    employeeName: entry.employeeName,
    workType: entry.workType,
    details: entry.details,
    amountKzt: String(entry.amountKzt),
  };
}

function amountValue(value: string) {
  return Number(value.trim().replace(",", "."));
}

export default function PayrollRegisterWorkspace({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const query = useListPayrollRegisters({
    query: { queryKey: getListPayrollRegistersQueryKey(), refetchInterval: 15000 },
  });
  const createRegister = useCreatePayrollRegister();
  const updateRegister = useUpdatePayrollRegister();
  const sendRegister = useSendPayrollRegister();
  const [draft, setDraft] = useState<RegisterDraft | null>(null);
  const [formError, setFormError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sendingId, setSendingId] = useState<number | null>(null);

  const registers = query.data ?? [];
  const visibleRegisters = canManage
    ? registers
    : registers.filter((register) => register.status === "sent_to_economist");
  const sentCount = registers.filter((register) => register.status === "sent_to_economist").length;
  const draftCount = canManage ? registers.filter((register) => register.status === "draft").length : 0;
  const totalVisible = visibleRegisters.reduce((sum, register) => sum + register.totalAmount, 0);
  const pending = createRegister.isPending || updateRegister.isPending || sendRegister.isPending;

  const openNew = () => {
    setDraft(emptyDraft());
    setFormError("");
    setError("");
    setNotice("");
  };

  const openEdit = (register: PayrollRegister) => {
    if (!canManage || register.status !== "draft") return;
    setDraft({
      id: register.id,
      version: register.version,
      workDate: register.workDate.slice(0, 10),
      unit: register.unit,
      entries: register.entries.map(entryDraft),
    });
    setFormError("");
    setError("");
    setNotice("");
  };

  const updateLine = (key: string, field: keyof Omit<EntryDraft, "key">, value: string) => {
    setDraft((current) => current
      ? { ...current, entries: current.entries.map((entry) => entry.key === key ? { ...entry, [field]: value } : entry) }
      : current);
    setFormError("");
  };

  const prepareInput = (): PayrollRegisterCreateInput | null => {
    if (!draft) return null;
    if (!draft.workDate) {
      setFormError("Укажите дату выполнения работ.");
      return null;
    }
    if (!draft.unit.trim()) {
      setFormError("Выберите подразделение.");
      return null;
    }
    if (draft.entries.length === 0) {
      setFormError("Добавьте хотя бы одну строку начисления.");
      return null;
    }
    const entries: PayrollRegisterCreateInput["entries"] = [];
    for (const [index, entry] of draft.entries.entries()) {
      const employeeName = entry.employeeName.trim();
      const workType = entry.workType.trim();
      const amount = amountValue(entry.amountKzt);
      if (!employeeName || !workType) {
        setFormError(`Строка ${index + 1}: укажите сотрудника и вид работы.`);
        return null;
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999_999.99) {
        setFormError(`Строка ${index + 1}: сумма должна быть больше нуля.`);
        return null;
      }
      entries.push({
        employeeName,
        workType,
        details: entry.details.trim(),
        amountKzt: Math.round((amount + Number.EPSILON) * 100) / 100,
      });
    }
    const totalAmount = entries.reduce((sum, entry) => sum + Math.round(entry.amountKzt * 100), 0) / 100;
    if (totalAmount > 999_999_999_999.99) {
      setFormError("Общая сумма реестра превышает допустимый предел.");
      return null;
    }
    return { workDate: draft.workDate, unit: draft.unit.trim(), entries };
  };

  const saveDraft = async () => {
    if (!canManage || !draft) return;
    const input = prepareInput();
    if (!input) return;
    setError("");
    setNotice("");
    try {
      if (draft.id === null) {
        await createRegister.mutateAsync({ data: input });
        setNotice("Черновик реестра сохранён.");
      } else {
        const data: PayrollRegisterUpdateInput = { ...input, version: draft.version ?? 1 };
        await updateRegister.mutateAsync({ id: draft.id, data });
        setNotice("Изменения черновика сохранены.");
      }
      await queryClient.invalidateQueries({ queryKey: getListPayrollRegistersQueryKey() });
      setDraft(null);
    } catch (err) {
      setError(errorInfo(err).message);
    }
  };

  const sendToEconomist = async (register: PayrollRegister) => {
    if (!canManage || register.status !== "draft") return;
    setSendingId(register.id);
    setError("");
    setNotice("");
    try {
      await sendRegister.mutateAsync({ id: register.id, data: { version: register.version } });
      await queryClient.invalidateQueries({ queryKey: getListPayrollRegistersQueryKey() });
      setNotice(`Реестр за ${formatDate(register.workDate)} передан экономисту.`);
    } catch (err) {
      setError(errorInfo(err).message);
    } finally {
      setSendingId(null);
    }
  };

  if (query.isLoading) {
    return (
      <section className="surface-card space-y-4 p-5" data-testid="payroll-register-loading">
        <div className="skeleton h-7 w-56 rounded-lg" />
        <div className="skeleton h-20 rounded-lg" />
        <div className="skeleton h-32 rounded-lg" />
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="surface-card p-5" role="alert" data-testid="payroll-register-error">
        <p className="text-sm font-semibold text-destructive">{errorInfo(query.error).message}</p>
        <button type="button" className="button button-secondary mt-3 text-xs" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-retry-payroll-register">
          {query.isFetching ? "Загружаем…" : "Повторить"}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="payroll-register-workspace">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Экономический блок · ежедневные начисления</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Реестр начислений</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {canManage
              ? "Соберите выполненные работы и передайте готовый реестр экономисту. Суммы остаются начислениями — отметки об оплате здесь нет."
              : "Здесь отображаются только реестры, переданные диспетчером для проверки начислений."}
          </p>
        </div>
        {canManage && !draft && (
          <button type="button" className="button button-primary shrink-0" onClick={openNew} data-testid="button-new-payroll-register">
            <Plus size={15} /> Новый реестр
          </button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Сводка реестров">
        <article className="surface-card flex items-center gap-3 p-4" data-testid="payroll-summary-register-count">
          <div className="setting-icon"><ClipboardList size={17} /></div>
          <div><p className="eyebrow">В реестре</p><p className="mt-1 text-xl font-bold">{visibleRegisters.length}</p></div>
        </article>
        <article className="surface-card flex items-center gap-3 p-4" data-testid="payroll-summary-total">
          <div className="setting-icon setting-icon-yellow"><Wallet size={17} /></div>
          <div><p className="eyebrow">Сумма начислений</p><p className="mt-1 text-lg font-bold font-mono">{money(totalVisible)}</p></div>
        </article>
        <article className="surface-card flex items-center gap-3 p-4" data-testid="payroll-summary-status-count">
          <div className="setting-icon"><Users size={17} /></div>
          <div>
            <p className="eyebrow">{canManage ? "Черновики · переданы" : "Передано диспетчером"}</p>
            <p className="mt-1 text-xl font-bold">{canManage ? `${draftCount} · ${sentCount}` : sentCount}</p>
          </div>
        </article>
      </div>

      {notice && <p className="notice-banner" role="status" data-testid="payroll-register-notice"><Check size={15} />{notice}</p>}
      {error && <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-semibold text-destructive" role="alert" data-testid="payroll-register-mutation-error">{error}</p>}

      {draft && canManage && (
        <section className="surface-card overflow-hidden" data-testid="payroll-register-editor">
          <div className="border-b border-border bg-muted/25 px-4 py-4 sm:px-5">
            <p className="eyebrow">{draft.id === null ? "Новая запись" : `Редактирование · реестр №${draft.id}`}</p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.03em]">{draft.id === null ? "Составить дневной реестр" : "Изменить черновик"}</h2>
          </div>
          <div className="space-y-5 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(180px,240px)_minmax(220px,1fr)]">
              <label className="form-label">Дата работ
                <span className="relative mt-1 block"><CalendarDays size={15} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" /><input className="text-input pr-9" type="date" value={draft.workDate} onChange={(event) => setDraft({ ...draft, workDate: event.target.value })} data-testid="input-payroll-work-date" /></span>
              </label>
              <label className="form-label">Подразделение
                <select className="text-input mt-1" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} data-testid="select-payroll-unit">
                  {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div><p className="eyebrow">Рабочие строки</p><p className="mt-1 text-xs text-muted-foreground">Добавляйте отдельную строку для каждого вида работы сотрудника.</p></div>
                <button type="button" className="button button-secondary min-h-8 text-[11px]" onClick={() => setDraft({ ...draft, entries: [...draft.entries, newEntry()] })} disabled={draft.entries.length >= 1000} data-testid="button-add-payroll-line"><Plus size={14} /> Добавить строку</button>
              </div>
              <div className="space-y-3">
                {draft.entries.map((entry, index) => (
                  <article key={entry.key} className="rounded-xl border border-border/80 bg-background/70 p-3 transition-colors hover:border-primary/30 sm:p-4" data-testid={`payroll-line-${index + 1}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="meta-chip">Строка {String(index + 1).padStart(2, "0")}</span>
                      <button type="button" aria-label={`Удалить строку ${index + 1}`} className="icon-button" onClick={() => setDraft({ ...draft, entries: draft.entries.filter((item) => item.key !== entry.key) })} disabled={draft.entries.length <= 1} data-testid={`button-remove-payroll-line-${index + 1}`}><Trash2 size={15} /></button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.05fr_1fr_1.25fr_170px]">
                      <label className="form-label">Сотрудник<input className="text-input mt-1" value={entry.employeeName} maxLength={200} onChange={(event) => updateLine(entry.key, "employeeName", event.target.value)} placeholder="Фамилия Имя" data-testid={`input-payroll-employee-${index + 1}`} /></label>
                      <label className="form-label">Вид работы<input className="text-input mt-1" value={entry.workType} maxLength={160} onChange={(event) => updateLine(entry.key, "workType", event.target.value)} placeholder="Например, перевозка зерна" data-testid={`input-payroll-work-type-${index + 1}`} /></label>
                      <label className="form-label">Детали <span className="font-normal text-muted-foreground">(необязательно)</span><input className="text-input mt-1" value={entry.details} maxLength={500} onChange={(event) => updateLine(entry.key, "details", event.target.value)} placeholder="Маршрут, поле, смена…" data-testid={`input-payroll-details-${index + 1}`} /></label>
                       <label className="form-label">Сумма, ₸<input className="text-input mt-1 font-mono" type="number" min="0.01" max="999999999999.99" step="0.01" inputMode="decimal" value={entry.amountKzt} onChange={(event) => updateLine(entry.key, "amountKzt", event.target.value)} placeholder="0,00" data-testid={`input-payroll-amount-${index + 1}`} /></label>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Итого по реестру <strong className="ml-2 font-mono text-base text-foreground">{money(draft.entries.reduce((sum, entry) => sum + (Number.isFinite(amountValue(entry.amountKzt)) ? amountValue(entry.amountKzt) : 0), 0))}</strong></p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="button button-secondary" onClick={() => { setDraft(null); setFormError(""); }} disabled={pending} data-testid="button-cancel-payroll-edit">Закрыть</button>
                <button type="button" className="button button-primary" onClick={() => void saveDraft()} disabled={pending} data-testid="button-save-payroll-draft">
                  {pending ? "Сохраняем…" : "Сохранить черновик"}
                </button>
              </div>
            </div>
            {formError && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="payroll-register-validation-error">{formError}</p>}
          </div>
        </section>
      )}

      <section className="surface-card p-4 sm:p-5" data-testid="payroll-register-list-section">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">{canManage ? "Журнал начислений" : "Полученные реестры"}</p><h2 className="mt-1 text-lg font-bold">Дневные реестры</h2></div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground" data-testid="payroll-register-polling"><Clock3 size={12} />Обновление каждые 15 секунд</span>
        </header>
        {visibleRegisters.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center" data-testid="payroll-register-empty">
            <div className="empty-icon"><ClipboardList size={20} /></div>
            <p className="mt-3 text-sm font-semibold">{canManage ? "Реестров пока нет" : "Переданных реестров пока нет"}</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{canManage ? "Создайте дневной реестр и внесите сотрудников, виды работ и суммы начислений." : "Когда диспетчер направит дневной реестр, он появится здесь для проверки."}</p>
            {canManage && <button type="button" className="button button-primary mt-4 text-xs" onClick={openNew} data-testid="button-create-first-payroll-register"><Plus size={14} /> Создать реестр</button>}
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border" data-testid="payroll-register-list">
            {visibleRegisters.map((register) => (
              <RegisterCard
                key={register.id}
                register={register}
                canManage={canManage}
                sending={sendingId === register.id}
                mutationPending={pending}
                onEdit={() => openEdit(register)}
                onSend={() => void sendToEconomist(register)}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function RegisterCard({
  register,
  canManage,
  sending,
  mutationPending,
  onEdit,
  onSend,
}: {
  register: PayrollRegister;
  canManage: boolean;
  sending: boolean;
  mutationPending: boolean;
  onEdit: () => void;
  onSend: () => void;
}) {
  const employeeTotals = new Map<string, number>();
  for (const entry of register.entries) {
    employeeTotals.set(entry.employeeName, (employeeTotals.get(entry.employeeName) ?? 0) + entry.amountKzt);
  }
  const isSent = register.status === "sent_to_economist";

  return (
    <article className="py-4 first:pt-3 last:pb-1" data-testid={`payroll-register-card-${register.id}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold">{formatDate(register.workDate)}</h3>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isSent ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-900"}`} data-testid={`payroll-register-status-${register.id}`}>
              {isSent ? "Передан экономисту" : "Черновик"}
            </span>
            <span className="text-[10px] text-muted-foreground">№ {register.id} · версия {register.version}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{register.unit} · {register.entries.length} {register.entries.length === 1 ? "строка" : "строк"} · создан {formatDateTime(register.createdAt)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Составил: {register.createdByName || "—"}{isSent ? ` · Передал: ${register.submittedByName || "—"} · ${formatDateTime(register.submittedAt)}` : ""}</p>

          <div className="mt-3 overflow-hidden rounded-lg border border-border/80">
            <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(130px,1fr)_minmax(140px,1.2fr)_130px] gap-3 bg-muted/55 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
              <span>Сотрудник</span><span>Вид работы</span><span>Детали</span><span className="text-right">Начислено</span>
            </div>
            {register.entries.map((entry) => (
              <div key={entry.id} className="grid gap-1 border-t border-border/70 px-3 py-2.5 first:border-t-0 sm:grid-cols-[minmax(150px,1fr)_minmax(130px,1fr)_minmax(140px,1.2fr)_130px] sm:items-center sm:gap-3" data-testid={`payroll-register-entry-${entry.id}`}>
                <div><span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Сотрудник · </span><span className="text-xs font-semibold">{entry.employeeName}</span></div>
                <div><span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Работа · </span><span className="text-xs">{entry.workType}</span></div>
                <div className="text-[11px] text-muted-foreground">{entry.details || "—"}</div>
                <div className="text-xs font-bold font-mono sm:text-right">{money(entry.amountKzt)}</div>
              </div>
            ))}
          </div>

          <details open className="group mt-2">
            <summary className="cursor-pointer list-none text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground" data-testid={`payroll-register-employee-summary-${register.id}`}>
              Сводка по сотрудникам · {employeeTotals.size}
              <span className="ml-1 inline-block transition-transform group-open:rotate-90"><ArrowRight size={11} className="inline" /></span>
            </summary>
            <div className="mt-2 flex flex-wrap gap-2" data-testid={`payroll-register-employee-totals-${register.id}`}>
              {[...employeeTotals.entries()].map(([name, amount]) => (
                <span key={name} className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[10px]" data-testid={`payroll-employee-total-${register.id}-${name.replace(/\s+/g, "-")}`}>
                  <strong>{name}</strong><span className="ml-2 font-mono text-muted-foreground">{money(amount)}</span>
                </span>
              ))}
            </div>
          </details>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border/70 pt-3 xl:min-w-[210px] xl:flex-col xl:items-end xl:border-0 xl:pt-0">
          <div className="text-left xl:text-right">
            <p className="eyebrow">Всего по реестру</p>
            <p className="mt-1 font-mono text-lg font-bold tracking-tight" data-testid={`payroll-register-total-${register.id}`}>{money(register.totalAmount)}</p>
          </div>
          {canManage && !isSent && (
            <div className="flex gap-2">
              <button type="button" className="button button-secondary min-h-8 px-3 text-[11px]" onClick={onEdit} disabled={mutationPending} data-testid={`button-edit-payroll-register-${register.id}`}>Изменить</button>
              <button type="button" className="button button-primary min-h-8 px-3 text-[11px]" onClick={onSend} disabled={mutationPending} data-testid={`button-send-payroll-register-${register.id}`}>
                {sending ? "Передаём…" : <><Send size={13} /> Передать</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
