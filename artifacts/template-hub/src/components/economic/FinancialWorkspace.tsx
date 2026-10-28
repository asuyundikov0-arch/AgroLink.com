import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, History, Plus, Wallet } from "lucide-react";
import { getListFinancialEntriesQueryKey, useCompleteFinancialEntry, useListFinancialEntries, useVoidFinancialEntry, type FinancialEntry } from "@workspace/api-client-react";
import { businessToday, dateFmt, errorInfo, money } from "../engineering/repairs/shared";
import { summarizeFinance } from "./financial-summary";
import MonthlyTable from "./finance/MonthlyTable";
import EntryForm from "./finance/EntryForm";
import Ledger from "./finance/Ledger";
import VoidDialog from "./finance/VoidDialog";
import { BOOK_LABEL, typeLabel, unitSuggestions, type Book } from "./finance/shared";
import "./finance/finance.css";

type FormState = { key: number; entry?: FinancialEntry } | null;

export default function FinancialWorkspace({ canManage, canVoid }: { canManage: boolean; canVoid: boolean }) {
  const qc = useQueryClient();
  const currentYear = Number(businessToday().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [book, setBook] = useState<Book>("budget");
  const [unit, setUnit] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [form, setForm] = useState<FormState>(null);
  const [voiding, setVoiding] = useState<FinancialEntry | null>(null);
  const [voidError, setVoidError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const query = useListFinancialEntries({ year }, { query: { queryKey: getListFinancialEntriesQueryKey({ year }), refetchInterval: 15000 } });
  const complete = useCompleteFinancialEntry();
  const voidEntry = useVoidFinancialEntry();
  const entries = useMemo(() => query.data ?? [], [query.data]);
  const units = useMemo(() => unitSuggestions(entries), [entries]);
  const summary = useMemo(() => summarizeFinance(entries, book, unit), [entries, book, unit]);
  const ledger = useMemo(() => entries.filter((e) => e.book === book && (!unit || e.unit === unit) && (showVoided || e.status !== "voided")).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [entries, book, unit, showVoided]);
  const voidedCount = entries.filter((e) => e.book === book && (!unit || e.unit === unit) && e.status === "voided").length;
  const years = useMemo(() => Array.from({ length: 101 }, (_, index) => 2100 - index), []);
  const refresh = () => qc.invalidateQueries({ queryKey: getListFinancialEntriesQueryKey() });
  const liveEntry = (e: FinancialEntry) => entries.find((x) => x.id === e.id) ?? e;

  async function doComplete(raw: FinancialEntry) {
    const e = liveEntry(raw);
    if (busyId !== null || complete.isPending || e.status !== "pending") return;
    const kind = e.direction === "income" ? "поступление" : "выплату";
    if (!window.confirm(`Отметить ${kind} как проведённое?\n\nТип: ${typeLabel(e)}\nДата: ${dateFmt(e.date)}\nКонтрагент: ${e.counterparty || "не указан"}\nСтатья: ${e.category} · ${e.unit}\nСумма: ${money(e.amountKzt)}\n\nСвязи с банком нет: это учётная отметка о том, что деньги фактически ${e.direction === "income" ? "поступили" : "оплачены"}. После отметки запись нельзя изменить.`)) return;
    setBusyId(e.id); setError(""); setNotice("");
    try {
      await complete.mutateAsync({ id: e.id, data: { version: e.version } });
      await refresh();
      setNotice(`Запись №${e.id} проведена: ${money(e.amountKzt)} учтены в фактическом Cash Flow.`);
    } catch (err) { setError(errorInfo(err).message); void refresh(); } finally { setBusyId(null); }
  }

  async function doVoid(reason: string) {
    if (!voiding || busyId !== null || voidEntry.isPending) return;
    const e = voiding;
    setBusyId(e.id); setVoidError(""); setNotice("");
    try {
      await voidEntry.mutateAsync({ id: e.id, data: { version: e.version, reason } });
      await refresh();
      setVoiding(null); setNotice(`Запись №${e.id} аннулирована и исключена из итогов. История сохранена.`);
    } catch (err) { setVoidError(errorInfo(err).message); void refresh(); } finally { setBusyId(null); }
  }

  const isCash = book === "cash_flow";
  const metrics = isCash ? [
    ["Чистый поток · план", money(summary.planTotal), "Поступления минус выплаты"],
    ["Чистый поток · факт", money(summary.actualTotal), "Только проведённые движения"],
    ["Поступило · факт", money(summary.incomeActual), `Ожидает: ${money(summary.pendingIncome)}`],
    ["Оплачено · факт", money(summary.expenseActual), `Ожидает: ${money(summary.pendingExpense)}`],
  ] : [
    ["Затраты · план", money(summary.planTotal), `${year} год`],
    ["Затраты · факт", money(summary.actualTotal), "Внесено экономистом"],
    ["Отклонение", `${summary.variance > 0 ? "+" : ""}${money(summary.variance)}`, summary.variance > 0 ? "Факт выше плана" : summary.variance < 0 ? "Факт ниже плана" : "Без отклонения"],
  ];

  return <div className="fin animate-page" data-testid="financial-workspace">
    <header className="fin-hero"><div className="fin-hero-grid" />
      <p className="eyebrow">AgroLink operation · Экономика</p>
      <h1>Бюджет и денежный поток</h1>
      <p className="lead">Производственный бюджет — плановые и фактические затраты по статьям. Cash Flow — плановые и фактические поступления и выплаты. Книги считаются независимо и не складываются.</p>
    </header>
    <div className="fin-toolbar">
      <div className="fin-tabs" role="tablist">{(["budget", "cash_flow"] as const).map((b) => <button type="button" role="tab" aria-selected={book === b} key={b} className={book === b ? "on" : ""} onClick={() => setBook(b)} data-testid={`finance-tab-${b}`}>{BOOK_LABEL[b]}</button>)}</div>
      <label>Год<select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="finance-year">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      <label>Подразделение<select value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="finance-unit"><option value="">Все подразделения</option>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
      <span className="grow" />
      {canManage && <button type="button" className="button button-primary" onClick={() => setForm({ key: Date.now() })} data-testid="finance-create"><Plus size={14} />{isCash ? "Денежное движение" : "Статья затрат"}</button>}
    </div>
    {notice && <p className="notice-banner" role="status"><Check size={15} />{notice}</p>}
    {error && <p className="fin-err" role="alert">{error}</p>}
    <div className="fin-metrics">{metrics.map(([l, v, s]) => <article key={l}><span>{l}</span><strong>{query.isLoading || query.isError ? "—" : v}</strong><small>{s}</small></article>)}</div>
    <p className="fin-note"><CircleAlert size={15} />{isCash
      ? "Фактические движения входят в итоги только после отметки «Поступило» / «Оплачено». Оплаченные заявки на запчасти подтягиваются из реестра оплат автоматически — вносить их вручную не нужно. «Чистый денежный поток» — это разница поступлений и выплат, а не остаток на счёте: входящий остаток не ведётся."
      : "Затраты вносятся экономистом вручную и учитываются сразу. Данные из других разделов в бюджет автоматически не попадают."}</p>
    <section className="fin-panel">
      <div className="fin-panel-head"><div><p className="eyebrow">{year} · {unit || "Все подразделения"} · по месяцам</p><h2>{BOOK_LABEL[book]}: план и факт</h2></div><Wallet size={18} /></div>
      {query.isLoading ? <div className="skeleton m-5 h-40 rounded-lg" />
        : query.isError ? <div className="fin-empty" role="alert"><h3>Не удалось загрузить данные</h3><p>{errorInfo(query.error).message}</p><button type="button" className="button button-secondary mt-3" onClick={() => void refresh()}>Повторить</button></div>
        : summary.categories.length === 0 ? <div className="fin-empty"><Wallet size={22} style={{ margin: "0 auto" }} /><h3>За {year} год учтённых записей нет</h3><p>{canManage ? `Добавьте ${isCash ? "плановое или фактическое движение" : "плановые или фактические затраты"}.` : "Записи появятся, когда экономист их внесёт."}</p></div>
        : <MonthlyTable book={book} summary={summary} />}
    </section>
    <section className="fin-panel">
      <div className="fin-panel-head"><div><p className="eyebrow">Журнал записей · {ledger.length}</p><h2>Первичные записи</h2></div>
        <button type="button" className="button button-secondary text-xs" aria-pressed={showVoided} onClick={() => setShowVoided((v) => !v)} data-testid="finance-show-voided"><History size={13} />{showVoided ? "Скрыть аннулированные" : `Показать аннулированные (${voidedCount})`}</button></div>
      {query.isLoading ? <div className="skeleton m-5 h-24 rounded-lg" /> : query.isError ? null
        : ledger.length === 0 ? <div className="fin-empty"><p>Записей по выбранным фильтрам нет.</p></div>
        : <Ledger entries={ledger} canManage={canManage} canVoid={canVoid} busyId={busyId} onEdit={(e) => setForm({ key: Date.now(), entry: liveEntry(e) })} onComplete={(e) => void doComplete(e)} onVoid={(e) => { setVoidError(""); setVoiding(liveEntry(e)); }} />}
    </section>
    {form && canManage && <EntryForm key={form.key} book={form.entry?.book ?? book} entry={form.entry} year={year} defaultUnit={unit} units={units} onClose={() => setForm(null)} onSaved={(m, saved) => { setForm(null); setYear(Number(saved.date.slice(0, 4))); setUnit((previous) => previous && previous !== saved.unit ? saved.unit : previous); setNotice(m); setError(""); }} />}
    {voiding && canVoid && <VoidDialog entry={voiding} busy={busyId !== null} error={voidError} onCancel={() => setVoiding(null)} onConfirm={(r) => void doVoid(r)} />}
  </div>;
}
