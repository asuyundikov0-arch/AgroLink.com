import { type FormEvent, type InputHTMLAttributes, type ReactNode, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CircleHelp, Gauge, Pencil, Plus, RefreshCw, Trash2, Wallet, Wrench, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  type RepairEntry,
  type RepairInput,
  type RepairInputUnit,
  getListEngineeringRepairsQueryKey,
  listEngineeringRepairs,
  useCreateEngineeringRepair,
  useDeleteEngineeringRepair,
  useListEngineeringRepairs,
  useUpdateEngineeringRepair,
} from "@workspace/api-client-react";

const UNITS: RepairInputUnit[] = ["АПК Арыстан Grain", "АФ Веденовка"];
const TOP_N = 10;
const statusMeta: Record<RepairEntry["status"], { label: string; cls: string }> = {
  planned: { label: "Запланирован", cls: "bg-[hsl(205_28%_92%)] text-[hsl(207_30%_32%)]" },
  in_progress: { label: "В работе", cls: "bg-[hsl(203_87%_33%/.12)] text-[hsl(203_87%_26%)]" },
  overdue: { label: "Просрочен", cls: "bg-[hsl(2_68%_52%/.12)] text-[hsl(2_57%_40%)]" },
  completed: { label: "Завершён", cls: "bg-[hsl(157_45%_90%)] text-[hsl(161_45%_26%)]" },
};

const kzt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const kztCompact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${kzt.format(v)} ₸`);
const dateFmt = (v: string | null) => {
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  return `${d}.${m}.${y}`;
};
const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

type FormState = {
  equipment: string; responsible: string; unit: RepairInputUnit;
  plannedStart: string; plannedEnd: string; actualStart: string; actualEnd: string;
  readiness: string; capitalCost: string; currentCost: string; tiresCost: string; oilsCost: string; serviceCost: string; notes: string;
};
const numericKeys = ["readiness", "capitalCost", "currentCost", "tiresCost", "oilsCost", "serviceCost"] as const;
const dateKeys = ["plannedStart", "plannedEnd", "actualStart", "actualEnd"] as const;

const blankForm = (unit: RepairInputUnit): FormState => ({
  equipment: "", responsible: "", unit, plannedStart: "", plannedEnd: "", actualStart: "", actualEnd: "",
  readiness: "", capitalCost: "", currentCost: "", tiresCost: "", oilsCost: "", serviceCost: "", notes: "",
});
const toStr = (v: number | string | null) => (v === null ? "" : String(v));
const fromEntry = (e: RepairEntry): FormState => ({
  equipment: e.equipment, responsible: e.responsible, unit: e.unit,
  plannedStart: toStr(e.plannedStart), plannedEnd: toStr(e.plannedEnd), actualStart: toStr(e.actualStart), actualEnd: toStr(e.actualEnd),
  readiness: toStr(e.readiness), capitalCost: toStr(e.capitalCost), currentCost: toStr(e.currentCost),
  tiresCost: toStr(e.tiresCost), oilsCost: toStr(e.oilsCost), serviceCost: toStr(e.serviceCost), notes: e.notes,
});
const parseNum = (s: string): number | null | "invalid" => {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "invalid";
};

function validate(f: FormState): { payload: RepairInput | null; errors: Partial<Record<keyof FormState, string>> } {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.equipment.trim()) errors.equipment = "Укажите технику";
  if (!f.responsible.trim()) errors.responsible = "Укажите ответственного";
  const nums: Record<string, number | null> = {};
  for (const k of numericKeys) {
    const v = parseNum(f[k]);
    if (v === "invalid") errors[k] = "Введите число";
    else if (v !== null && v < 0) errors[k] = "Не может быть отрицательным";
    else if (k === "readiness" && v !== null && v > 100) errors[k] = "От 0 до 100";
    else nums[k] = v;
  }
  if (f.plannedStart && f.plannedEnd && f.plannedEnd < f.plannedStart) errors.plannedEnd = "Раньше планового начала";
  if (f.actualEnd && !f.actualStart) errors.actualEnd = "Сначала укажите фактическое начало";
  if (f.actualStart && f.actualEnd && f.actualEnd < f.actualStart) errors.actualEnd = "Раньше фактического начала";
  const toMinor = (value: number | null | undefined) => Math.round((value ?? 0) * 100);
  const detail = toMinor(nums.tiresCost) + toMinor(nums.oilsCost) + toMinor(nums.serviceCost);
  const anyDetail = nums.tiresCost != null || nums.oilsCost != null || nums.serviceCost != null;
  if (anyDetail && !errors.currentCost && !errors.tiresCost && !errors.oilsCost && !errors.serviceCost) {
    if (detail > toMinor(nums.currentCost)) errors.currentCost = `Детализация (${kzt.format(detail / 100)} ₸) превышает текущие затраты`;
  }
  if (Object.keys(errors).length) return { payload: null, errors };
  return {
    errors,
    payload: {
      equipment: f.equipment.trim(), responsible: f.responsible.trim(), unit: f.unit,
      plannedStart: f.plannedStart || null, plannedEnd: f.plannedEnd || null, actualStart: f.actualStart || null, actualEnd: f.actualEnd || null,
      readiness: nums.readiness ?? null, capitalCost: nums.capitalCost ?? null, currentCost: nums.currentCost ?? null,
      tiresCost: nums.tiresCost ?? null, oilsCost: nums.oilsCost ?? null, serviceCost: nums.serviceCost ?? null, notes: f.notes,
    },
  };
}

function errorInfo(err: unknown): { status?: number; message: string } {
  const e = err as { status?: number; data?: unknown; message?: string } | null;
  const status = typeof e?.status === "number" ? e.status : undefined;
  const d = e?.data as { error?: unknown } | null | undefined;
  const serverText = d && typeof d === "object" && typeof d.error === "string" ? d.error : undefined;
  if (status === 403) return { status, message: serverText ? `Недостаточно прав: ${serverText}` : "Недостаточно прав для этого действия. Обратитесь к руководителю." };
  if (status === 401) return { status, message: "Сессия истекла. Войдите снова." };
  return { status, message: serverText ?? e?.message ?? "Не удалось выполнить запрос. Повторите попытку." };
}

const effReadiness = (e: RepairEntry) => (e.actualEnd ? 100 : e.readiness);

function ReadinessBar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">не указана</span>;
  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
        <div className="h-full rounded-full bg-[#61A9BD] transition-transform duration-500 origin-left" style={{ transform: `scaleX(${value / 100})` }} />
      </div>
      <span className="w-9 text-right font-mono text-[11px] font-bold">{kzt.format(value)}%</span>
    </div>
  );
}

function StatusBadge({ entry }: { entry: RepairEntry }) {
  const m = statusMeta[entry.status];
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold", m.cls)}>{m.label}{entry.status === "overdue" && entry.overdueDays > 0 ? ` · ${entry.overdueDays} дн.` : ""}</span>;
}

function Field({ label, error, hint, children, wide }: { label: string; error?: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={cx("form-label", wide && "sm:col-span-2")}>
      {label}
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="mt-1 text-[10px] font-medium text-amber-700">{hint}</p>}
      {error && <p className="mt-1 text-[10px] font-semibold text-destructive">{error}</p>}
    </label>
  );
}

export default function RepairDashboard({ role }: { role: string }) {
  const queryClient = useQueryClient();
  const canDelete = role === "general_director";
  const [unit, setUnit] = useState<RepairInputUnit | "all">("all");
  const params = unit === "all" ? undefined : { unit };
  const query = useListEngineeringRepairs(params, { query: { queryKey: getListEngineeringRepairsQueryKey(params), refetchInterval: 30000 } });
  const create = useCreateEngineeringRepair();
  const update = useUpdateEngineeringRepair();
  const remove = useDeleteEngineeringRepair();

  const [editing, setEditing] = useState<{ id: number | null; version: number } | null>(null);
  const [form, setForm] = useState<FormState>(blankForm(UNITS[0]));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [serverSnap, setServerSnap] = useState<FormState | null>(null);
  const [reloading, setReloading] = useState(false);
  const [toDelete, setToDelete] = useState<RepairEntry | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const [showFormula, setShowFormula] = useState(false);

  const data = query.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const chartData = useMemo(() => {
    const priced = items.filter((e) => e.totalCost !== null);
    const sorted = [...priced].sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0));
    return { pricedCount: priced.length, rows: sorted.slice(0, TOP_N).map((e) => ({ name: e.equipment, current: e.currentCost, capital: e.capitalCost, total: e.totalCost })) };
  }, [items]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [getListEngineeringRepairsQueryKey()[0]] });
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    setForm(blankForm(unit === "all" ? UNITS[0] : unit)); setEditing({ id: null, version: 0 });
    setErrors({}); setSaveError(""); setConflict(false); setServerSnap(null);
  };
  const openEdit = (e: RepairEntry) => {
    setForm(fromEntry(e)); setEditing({ id: e.id, version: e.version });
    setErrors({}); setSaveError(""); setConflict(false); setServerSnap(null);
  };
  const close = () => { if (!create.isPending && !update.isPending) setEditing(null); };

  const reloadCurrent = async () => {
    if (!editing?.id) return;
    setReloading(true);
    try {
      await invalidate();
      const fresh = await queryClient.fetchQuery({ queryKey: getListEngineeringRepairsQueryKey(), queryFn: () => listEngineeringRepairs(), staleTime: 0 });
      const cur = fresh.items.find((i) => i.id === editing.id);
      if (!cur) { setSaveError("Запись удалена другим пользователем. Сохранить изменения нельзя."); return; }
      setServerSnap(fromEntry(cur)); setEditing({ id: cur.id, version: cur.version });
      setConflict(false); setSaveError("");
      setNotice("Загружена актуальная версия. Сверьте подсвеченные поля и сохраните снова.");
    } catch (err) { setSaveError(errorInfo(err).message); } finally { setReloading(false); }
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!editing || conflict) return;
    const { payload, errors: errs } = validate(form);
    setErrors(errs); setSaveError("");
    if (!payload) return;
    try {
      if (editing.id === null) await create.mutateAsync({ data: payload });
      else await update.mutateAsync({ id: editing.id, data: { ...payload, version: editing.version } });
      await invalidate();
      setNotice(editing.id === null ? `Ремонт «${payload.equipment}» добавлен.` : `Изменения по «${payload.equipment}» сохранены.`);
      setEditing(null); setServerSnap(null);
    } catch (err) {
      const info = errorInfo(err);
      if (info.status === 409) { setConflict(true); setSaveError("Запись уже изменил другой пользователь. Ваши поля сохранены в форме — загрузите актуальную версию, сверьте данные и сохраните повторно."); }
      else setSaveError(info.message);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleteError("");
    try {
      await remove.mutateAsync({ id: toDelete.id });
      await invalidate();
      setNotice(`Запись «${toDelete.equipment}» удалена.`); setToDelete(null);
    } catch (err) { setDeleteError(errorInfo(err).message); }
  };

  const s = data?.summary;
  const knownAmount = (key: "capitalCost" | "currentCost" | "tiresCost" | "oilsCost" | "serviceCost") =>
    money(items.some((entry) => entry[key] !== null) ? s?.[key] ?? null : null);
  const saving = create.isPending || update.isPending;
  const diffHint = (k: keyof FormState) => serverSnap && serverSnap[k] !== form[k] ? `На сервере: ${serverSnap[k] === "" ? "пусто" : serverSnap[k]}` : undefined;

  const input = (k: keyof FormState, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className={cx("text-input", errors[k] && "!border-destructive")} value={form[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k]} data-testid={`input-repair-${k}`} {...extra} />
  );

  return (
    <div className="space-y-5" data-testid="repair-dashboard">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Инженерная служба · ремонт техники</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Ремонты и готовность</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {data ? <>Данные на {dateFmt(data.asOfDate)} · суммы в тенге · обновление каждые 30 с</> : "Затраты и сроки ремонта по каждой единице техники"}
            {query.isFetching && data && <span className="ml-2 inline-flex items-center gap-1 text-[hsl(203_87%_33%)]"><RefreshCw size={11} className="animate-spin" />синхронизация</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Подразделение">
            {(["all", ...UNITS] as const).map((u) => (
              <button key={u} type="button" role="tab" aria-selected={unit === u} onClick={() => setUnit(u)} data-testid={`tab-repair-unit-${u === "all" ? "all" : UNITS.indexOf(u)}`}
                className={cx("rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors", unit === u ? "bg-[hsl(203_87%_33%)] text-white" : "text-muted-foreground hover:text-foreground")}>
                {u === "all" ? "Все хозяйства" : u}
              </button>
            ))}
          </div>
          <button type="button" className="button button-primary" onClick={openCreate} data-testid="button-create-repair"><Plus size={15} />Добавить ремонт</button>
        </div>
      </header>

      {notice && <div className="notice-banner" role="status">{notice}<button type="button" aria-label="Закрыть" onClick={() => setNotice("")}><X size={14} /></button></div>}

      {query.isLoading ? (
        <div className="space-y-4" data-testid="status-loading">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[92px] rounded-xl" />)}</div>
          <div className="skeleton h-64 rounded-xl" /><div className="skeleton h-48 rounded-xl" />
        </div>
      ) : query.isError ? (
        <div className="surface-card empty-state" data-testid="status-error">
          <div className="empty-icon empty-icon-error"><AlertTriangle size={20} /></div>
          <h3 className="mt-4 text-sm font-bold">Реестр ремонтов не загрузился</h3>
          <p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{errorInfo(query.error).message}</p>
          <button type="button" className="button button-secondary mt-4" onClick={() => query.refetch()}>Повторить</button>
        </div>
      ) : s && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Сводка">
            <Kpi icon={<Wrench size={16} />} label="Ремонтов в реестре" value={String(s.total)} sub={`${s.inProgress} в работе · ${s.completed} завершено`} />
            <Kpi icon={<AlertTriangle size={16} />} label="Просрочено" value={String(s.overdue)} sub={`${s.planned} запланировано`} tone={s.overdue > 0 ? "danger" : undefined} />
            <Kpi icon={<Wallet size={16} />} label="Затраты всего" value={chartData.pricedCount > 0 ? money(s.totalCost) : "—"} sub={s.unpricedCount ? `затраты заполнены не полностью: ${s.unpricedCount}` : s.total ? "все записи с суммами" : "затраты ещё не внесены"} mono />
            <Kpi icon={<Gauge size={16} />} label="Средняя готовность" value={s.averageReadiness === null ? "—" : `${kzt.format(s.averageReadiness)}%`} sub="завершённые считаются 100%" mono />
          </section>

          {s.total > 0 && (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
              <div className="surface-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h2 className="text-sm font-bold">Затраты по технике</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Текущие и капитальные затраты, ₸. {chartData.pricedCount > TOP_N ? `Показаны ${TOP_N} крупнейших из ${chartData.pricedCount}.` : `Записей с суммами: ${chartData.pricedCount}.`}{items.length > chartData.pricedCount ? ` Без сумм не показаны: ${items.length - chartData.pricedCount}.` : ""} Учитываются только внесённые суммы.</p></div>
                </div>
                {chartData.rows.length === 0 ? <p className="py-14 text-center text-xs text-muted-foreground">Ни у одной записи пока нет сумм затрат.</p> : (
                  <div style={{ height: Math.max(160, chartData.rows.length * 38 + 60) }} className="mt-3" data-testid="chart-repair-costs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barCategoryGap={8}>
                        <CartesianGrid horizontal={false} stroke="hsl(205 21% 90%)" />
                        <XAxis type="number" domain={[0, "auto"]} tickFormatter={(v: number) => kztCompact.format(v)} tick={{ fontSize: 10, fill: "hsl(207 18% 45%)" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: "hsl(210 43% 17%)" }} tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: "hsl(203 55% 96%)" }} content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const r = payload[0].payload as (typeof chartData.rows)[number];
                          return <div className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] shadow-lg"><p className="mb-1 max-w-[240px] font-bold">{r.name}</p><p>Текущие: <b className="font-mono">{money(r.current)}</b></p><p>Капитальные: <b className="font-mono">{money(r.capital)}</b></p><p className="mt-1 border-t border-border pt-1">Итого: <b className="font-mono">{money(r.total)}</b></p></div>;
                        }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="current" name="Текущие" stackId="c" fill="#61A9BD" />
                        <Bar dataKey="capital" name="Капитальные" stackId="c" fill="#CED14E" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="surface-card p-4 sm:p-5">
                <h2 className="text-sm font-bold">Структура затрат</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Шины, масла и сервис — часть текущих, не прибавляются к итогу.</p>
                <dl className="mt-4 space-y-2.5 text-xs">
                  <Row label="Текущие" value={knownAmount("currentCost")} swatch="#61A9BD" />
                  <div className="ml-4 space-y-1.5 border-l border-border pl-3 text-muted-foreground">
                    <Row label="в т.ч. шины" value={knownAmount("tiresCost")} />
                    <Row label="в т.ч. масла" value={knownAmount("oilsCost")} />
                    <Row label="в т.ч. сервис" value={knownAmount("serviceCost")} />
                  </div>
                  <Row label="Капитальные" value={knownAmount("capitalCost")} swatch="#CED14E" />
                  <div className="border-t border-border pt-2.5"><Row label="Итого внесено" value={chartData.pricedCount ? money(s.totalCost) : "—"} strong /></div>
                </dl>
                <button type="button" className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-[hsl(203_87%_30%)]" onClick={() => setShowFormula((v) => !v)} aria-expanded={showFormula} data-testid="button-repair-formula"><CircleHelp size={13} />Как считаются показатели</button>
                {showFormula && (
                  <ul className="mt-2 space-y-1.5 rounded-lg bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground">
                    <li>Итого = текущие + капитальные. Суммируются только внесённые затраты; неполные записи отмечены в сводке. Шины, масла и сервис повторно не прибавляются.</li>
                    <li>Плановая длительность = плановое окончание − плановое начало. Фактическая длительность = фактическое окончание − фактическое начало.</li>
                    <li>Отклонение, дн. = фактическая дата завершения − плановая дата завершения. Для расчёта нужны обе даты завершения.</li>
                    <li>Отклонение, % = (фактическая длительность − плановая длительность) / max(1, плановая длительность) × 100. Для этого расчёта нужны все четыре даты; при плане на один день знаменатель равен 1.</li>
                    <li>Без нужных дат отклонение остаётся «—». Просрочка незавершённого ремонта считается отдельно на текущую дату по времени Алматы.</li>
                    <li>Фактическое окончание требует фактического начала и означает готовность 100%.</li>
                  </ul>
                )}
              </div>
            </section>
          )}

          <section className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/25 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-bold">Реестр ремонтов</h2>
              <span className="meta-chip">{items.length} записей</span>
            </div>
            {items.length === 0 ? (
              <div className="empty-state" data-testid="status-empty">
                <div className="empty-icon"><CalendarClock size={20} /></div>
                <h3 className="mt-4 text-sm font-bold">Ремонтов пока нет</h3>
                <p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">Добавьте первую единицу техники — сроки, готовность и затраты появятся здесь и в сводке.</p>
                <button type="button" className="button button-primary mt-4" onClick={openCreate}><Plus size={14} />Добавить ремонт</button>
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {items.map((e) => (
                  <li key={e.id} className="group grid gap-3 px-4 py-3.5 transition-colors hover:bg-[hsl(203_55%_97%)] sm:px-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_140px_minmax(0,1fr)_auto] lg:items-center" data-testid={`row-repair-${e.id}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold" title={e.equipment}>{e.equipment}</h3><StatusBadge entry={e} /></div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{e.responsible} · {e.unit}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 font-mono text-[10.5px] leading-5">
                      <span className="text-muted-foreground">План</span><span>{dateFmt(e.plannedStart)} – {dateFmt(e.plannedEnd)}</span>
                      <span className="text-muted-foreground">Факт</span><span>{dateFmt(e.actualStart)} – {dateFmt(e.actualEnd)}</span>
                      <span className="text-muted-foreground">Откл.</span>
                      <span className={cx(e.deviationDays !== null && e.deviationDays > 0 && "text-destructive")}>{e.deviationDays === null ? "—" : `${e.deviationDays > 0 ? "+" : ""}${e.deviationDays} дн.${e.deviationPercent !== null ? ` (${kzt.format(e.deviationPercent)}%)` : ""}`}</span>
                    </div>
                    <ReadinessBar value={effReadiness(e)} label={`Готовность ${e.equipment}`} />
                    <div className="text-[11px]">
                      <p className="font-mono text-sm font-bold">{e.totalCost === null ? <span className="font-sans text-xs font-semibold text-muted-foreground">без сумм</span> : money(e.totalCost)}</p>
                      <p className="text-muted-foreground">тек. {money(e.currentCost)} · кап. {money(e.capitalCost)}</p>
                    </div>
                    <div className="flex gap-1.5 lg:opacity-60 lg:transition-opacity lg:group-hover:opacity-100">
                      <button type="button" className="button button-secondary !min-h-[32px] !px-2.5" onClick={() => openEdit(e)} aria-label={`Изменить ${e.equipment}`} data-testid={`button-edit-repair-${e.id}`}><Pencil size={13} /></button>
                      {canDelete && <button type="button" className="button button-danger border !min-h-[32px] !px-2.5" onClick={() => { setDeleteError(""); setToDelete(e); }} aria-label={`Удалить ${e.equipment}`} data-testid={`button-delete-repair-${e.id}`}><Trash2 size={13} /></button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[hsl(210_43%_17%/.35)]" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) close(); }}>
          <form onSubmit={submit} noValidate className="flex h-full w-full max-w-[620px] flex-col bg-card shadow-2xl animate-in slide-in-from-right duration-200" data-testid="form-repair" aria-label="Форма ремонта">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div><p className="eyebrow">{editing.id === null ? "Новая запись" : `Запись №${editing.id} · версия ${editing.version}`}</p><h2 className="mt-1 text-lg font-bold tracking-[-0.03em]">{editing.id === null ? "Добавить ремонт" : "Изменить ремонт"}</h2></div>
              <button type="button" className="icon-button" onClick={close} aria-label="Закрыть"><X size={16} /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {saveError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold text-destructive" role="alert" data-testid="text-repair-save-error">
                  {saveError}
                  {conflict && <button type="button" className="button button-secondary mt-2 !min-h-[32px] text-foreground" onClick={reloadCurrent} disabled={reloading} data-testid="button-repair-reload"><RefreshCw size={13} className={cx(reloading && "animate-spin")} />Загрузить актуальную версию</button>}
                </div>
              )}
              <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="eyebrow mb-2">Техника</legend>
                <Field label="Техника (название / госномер) *" error={errors.equipment} hint={diffHint("equipment")} wide>{input("equipment", { maxLength: 200, placeholder: "Например: John Deere 8R 410 · 123 ABC 11" })}</Field>
                <Field label="Ответственный *" error={errors.responsible} hint={diffHint("responsible")}>{input("responsible", { maxLength: 200 })}</Field>
                <Field label="Подразделение" hint={diffHint("unit")}>
                  <select className="text-input" value={form.unit} onChange={(e) => set("unit", e.target.value)} data-testid="select-repair-unit">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                </Field>
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="eyebrow mb-2">Сроки и готовность</legend>
                {dateKeys.map((k) => <Field key={k} label={{ plannedStart: "Плановое начало", plannedEnd: "Плановое окончание", actualStart: "Фактическое начало", actualEnd: "Фактическое окончание" }[k]} error={errors[k]} hint={diffHint(k)}>{input(k, { type: "date" })}</Field>)}
                <Field label="Готовность, %" error={errors.readiness} hint={diffHint("readiness") ?? (form.actualEnd ? "С фактическим окончанием готовность считается 100%" : undefined)}>{input("readiness", { inputMode: "decimal", placeholder: "пусто = не указана" })}</Field>
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="eyebrow mb-2">Затраты, ₸</legend>
                <Field label="Текущие затраты" error={errors.currentCost} hint={diffHint("currentCost")}>{input("currentCost", { inputMode: "decimal" })}</Field>
                <Field label="Капитальные затраты" error={errors.capitalCost} hint={diffHint("capitalCost")}>{input("capitalCost", { inputMode: "decimal" })}</Field>
                <p className="text-[11px] leading-4 text-muted-foreground sm:col-span-2">Детализация ниже входит в текущие затраты и не может их превышать. Пустое поле — «не указано», а не ноль.</p>
                <Field label="в т.ч. шины" error={errors.tiresCost} hint={diffHint("tiresCost")}>{input("tiresCost", { inputMode: "decimal" })}</Field>
                <Field label="в т.ч. масла" error={errors.oilsCost} hint={diffHint("oilsCost")}>{input("oilsCost", { inputMode: "decimal" })}</Field>
                <Field label="в т.ч. сервис" error={errors.serviceCost} hint={diffHint("serviceCost")}>{input("serviceCost", { inputMode: "decimal" })}</Field>
              </fieldset>
              <Field label="Примечания" hint={diffHint("notes")} wide>
                <textarea className="text-input min-h-[80px]" maxLength={3000} value={form.notes} onChange={(e) => set("notes", e.target.value)} data-testid="input-repair-notes" />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
              <button type="button" className="button button-ghost" onClick={close} disabled={saving}>Отмена</button>
              <button type="submit" className="button button-primary" disabled={saving || conflict} data-testid="button-save-repair">{saving ? "Сохраняем..." : "Сохранить"}</button>
            </div>
          </form>
        </div>
      )}

      {toDelete && canDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(210_43%_17%/.4)] p-4" role="alertdialog" aria-modal="true" aria-labelledby="repair-del-title" data-testid="dialog-delete-repair">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="empty-icon empty-icon-error"><Trash2 size={18} /></div>
            <h2 id="repair-del-title" className="mt-4 text-base font-bold">Удалить запись о ремонте?</h2>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">«{toDelete.equipment}» ({toDelete.unit}) будет удалена без возможности восстановления. Сводка пересчитается для всех пользователей.</p>
            {deleteError && <p className="mt-3 rounded-lg bg-destructive/5 p-2.5 text-xs font-semibold text-destructive" role="alert">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="button button-secondary" onClick={() => setToDelete(null)} disabled={remove.isPending}>Отмена</button>
              <button type="button" className="button !bg-destructive text-white" onClick={confirmDelete} disabled={remove.isPending} data-testid="button-confirm-delete-repair">{remove.isPending ? "Удаляем..." : "Удалить навсегда"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone, mono }: { icon: ReactNode; label: string; value: string; sub: string; tone?: "danger"; mono?: boolean }) {
  return (
    <div className="surface-card p-3.5 sm:p-4">
      <div className={cx("flex items-center gap-2 text-[11px] font-semibold", tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{icon}{label}</div>
      <p className={cx("mt-2 truncate text-xl font-bold tracking-[-0.03em]", mono && "font-mono text-lg", tone === "danger" && "text-destructive")} title={value}>{value}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Row({ label, value, swatch, strong }: { label: string; value: string; swatch?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={cx("flex items-center gap-2", strong && "font-bold")}>{swatch && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />}{label}</dt>
      <dd className={cx("font-mono", strong && "font-bold")}>{value}</dd>
    </div>
  );
}
