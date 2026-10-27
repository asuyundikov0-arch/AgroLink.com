import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, PackagePlus, Plus, RefreshCw, Search, Send, Trash2 } from "lucide-react";
import {
  type ChemicalBatch,
  type ChemicalInvoiceLineUnit,
  getGetChemicalWarehouseQueryKey,
  getListEmployeesQueryKey,
  useCreateChemicalInvoice,
  useCreateChemicalIssue,
  useGetChemicalWarehouse,
  useListEmployees,
} from "@workspace/api-client-react";
import { Drawer, Field, POLL_MS, UNITS, cx, dateFmt, errorInfo } from "./grain/shared";
import { businessToday } from "../engineering/repairs/shared";

const CHEM_UNITS: ChemicalInvoiceLineUnit[] = ["л", "кг", "шт"];
export const canManageChemicals = (r: string) => r === "grain_manager" || r === "general_director";

const nf3 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const nf2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: number) => nf3.format(v);
const money = (v: number) => `${nf2.format(v)} ₸`;
const parseNum = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
const QTY_RE = /^\d+([.,]\d{1,3})?$/;
const PRICE_RE = /^\d+([.,]\d{1,2})?$/;

type View = "stock" | "journal" | "cost";
type Line = { key: string; name: string; unit: ChemicalInvoiceLineUnit; quantity: string; unitPrice: string };
const newLine = (): Line => ({ key: crypto.randomUUID(), name: "", unit: "л", quantity: "", unitPrice: "" });
const newInvoice = () => ({ requestId: crypto.randomUUID(), number: "", occurredOn: businessToday(), supplier: "", farm: UNITS[0] as string, lines: [newLine()] });
const newIssue = (batchId = "") => ({ requestId: crypto.randomUUID(), batchId, seasonId: "", employeeId: "", quantity: "", occurredOn: businessToday(), notes: "" });

export default function ChemicalWarehouse({ role, onOpenFields }: { role: string; onOpenFields?: () => void }) {
  const canEdit = canManageChemicals(role);
  const qc = useQueryClient();
  const q = useGetChemicalWarehouse({ query: { queryKey: getGetChemicalWarehouseQueryKey(), refetchInterval: POLL_MS } });
  const [view, setView] = useState<View>("stock");
  const [farm, setFarm] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const data = q.data;
  const s = search.trim().toLowerCase();
  const years = useMemo(() => Array.from(new Set([...(data?.fields ?? []).map((f) => f.year), ...(data?.issues ?? []).map((i) => i.year)])).sort((a, b) => b - a), [data]);
  const batches = useMemo(() => (data?.batches ?? []).filter((b) => (farm === "all" || b.farm === farm) && (showEmpty || b.remaining > 0) && (!s || `${b.name} ${b.supplier} ${b.invoiceNumber}`.toLowerCase().includes(s))).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id), [data, farm, showEmpty, s]);
  const issues = useMemo(() => (data?.issues ?? []).filter((i) => (farm === "all" || i.farm === farm) && (year === "all" || String(i.year) === year) && (!s || `${i.name} ${i.fieldNumber} ${i.employeeName} ${i.invoiceNumber}`.toLowerCase().includes(s))).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id), [data, farm, year, s]);
  const fields = useMemo(() => (data?.fields ?? []).filter((f) => (farm === "all" || f.farm === farm) && (year === "all" || String(f.year) === year) && (!s || `${f.fieldNumber} ${f.cropName}`.toLowerCase().includes(s))).sort((a, b) => b.year - a.year || a.farm.localeCompare(b.farm) || a.fieldNumber.localeCompare(b.fieldNumber, "ru", { numeric: true })), [data, farm, year, s]);

  const stockTotal = batches.reduce((a, b) => a + b.remainingAmount, 0);
  const issuedTotal = issues.reduce((a, b) => a + b.amount, 0);
  const costTotal = fields.reduce((a, f) => a + f.chemicalAmount, 0);
  const sownTotal = fields.reduce((a, f) => a + (f.costPerHa === null ? 0 : f.sownAreaHa), 0);
  const costWithSowing = fields.reduce((a, f) => a + (f.costPerHa === null ? 0 : f.chemicalAmount), 0);

  const done = (msg: string) => { setNotice(msg); void qc.invalidateQueries({ queryKey: getGetChemicalWarehouseQueryKey() }); window.setTimeout(() => setNotice(""), 5000); };

  if (q.isLoading) return <div className="space-y-3" data-testid="status-chem-loading"><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-12 rounded-lg" /><div className="skeleton h-64 rounded-xl" /></div>;
  if (q.isError) {
    const e = errorInfo(q.error);
    return <div className="surface-card empty-state" data-testid="status-chem-error">
      <h2 className="text-sm font-bold">{e.status === 403 ? "Нет доступа к складу химии" : "Склад химии не загрузился"}</h2>
      <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">{e.message}</p>
      {e.status !== 403 && <button type="button" className="button button-secondary mt-4" onClick={() => void q.refetch()} data-testid="button-chem-retry"><RefreshCw size={14} />Повторить</button>}
    </div>;
  }

  return <div className="space-y-5" data-testid="chem-warehouse">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Склад химии · СЗР и удобрения</div>
        <h2 className="mt-1 text-lg font-bold">Остатки по накладным и списание на поля</h2>
        {!canEdit && <p className="mt-1 text-xs text-muted-foreground" data-testid="text-chem-readonly">Только просмотр. Приход и выдачу оформляют заведующий током и генеральный директор.</p>}
      </div>
      {canEdit && <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-secondary" onClick={() => setIssueFor("")} data-testid="button-chem-issue-open"><Send size={14} />Выдать на поле</button>
        <button type="button" className="button button-primary" onClick={() => setInvoiceOpen(true)} data-testid="button-chem-invoice-open"><PackagePlus size={14} />Приход по накладной</button>
      </div>}
    </div>
    {notice && <div className="rounded-lg border border-[hsl(157_45%_70%)] bg-[hsl(157_45%_94%)] px-3 py-2 text-xs font-semibold text-[hsl(161_45%_26%)]" role="status" data-testid="status-chem-notice">{notice}</div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <Kpi label="Остаток на складе" value={money(stockTotal)} sub={`${batches.filter((b) => b.remaining > 0).length} партий в выборке`} testId="kpi-chem-stock" />
      <Kpi label="Выдано по журналу" value={money(issuedTotal)} sub={`${issues.length} выдач`} testId="kpi-chem-issued" />
      <Kpi label="Химия на 1 га посева" value={sownTotal > 0 ? money(costWithSowing / sownTotal) : "—"} sub={`${qty(sownTotal)} га фактического сева`} testId="kpi-chem-perha" />
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1" role="tablist">
        {([["stock", "Остатки"], ["journal", "Журнал выдачи"], ["cost", "Затраты по полям"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={cx("rounded-md px-3 py-1.5 text-xs font-bold", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setView(k)} data-testid={`tab-chem-${k}`}>{l}</button>)}
      </div>
      <select className="text-input !w-auto !min-h-[34px]" value={farm} onChange={(e) => setFarm(e.target.value)} data-testid="select-chem-farm"><option value="all">Все хозяйства</option>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
      {view !== "stock" && <select className="text-input !w-auto !min-h-[34px]" value={year} onChange={(e) => setYear(e.target.value)} data-testid="select-chem-year"><option value="all">Все годы</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
      <div className="relative min-w-[200px] flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="text-input !min-h-[34px] !pl-8" placeholder="Препарат, поставщик, поле, сотрудник" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-chem-search" /></div>
      {view === "stock" && <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} data-testid="checkbox-chem-empty" />Показать израсходованные</label>}
    </div>

    {view === "stock" && <div className="surface-card overflow-x-auto" data-testid="table-chem-stock">
      {batches.length === 0 ? <Empty title="Партий нет" text={canEdit ? "Оформите приход по накладной — каждая строка накладной станет отдельной партией со своей ценой." : "Пока нет партий химии на складе по выбранным условиям."} /> :
        <table className="w-full min-w-[860px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><Th>Накладная</Th><Th>Поставщик / хозяйство</Th><Th>Препарат</Th><Th right>Получено</Th><Th right>Остаток</Th><Th right>Цена ед.</Th><Th right>Сумма остатка</Th>{canEdit && <Th />}</tr></thead>
          <tbody className="divide-y divide-border/70">{batches.map((b) => <tr key={b.id} className={cx(b.remaining <= 0 && "opacity-55")} data-testid={`row-chem-batch-${b.id}`}>
            <Td><div className="font-bold">№ {b.invoiceNumber}</div><div className="text-[10px] text-muted-foreground">{dateFmt(b.occurredOn)}</div></Td>
            <Td><div className="font-semibold">{b.supplier}</div><div className="text-[10px] text-muted-foreground">{b.farm}</div></Td>
            <Td><span className="font-bold">{b.name}</span></Td>
            <Td right mono>{qty(b.quantity)} {b.unit}</Td>
            <Td right mono><span className="font-bold" data-testid={`text-chem-remaining-${b.id}`}>{qty(b.remaining)} {b.unit}</span></Td>
            <Td right mono>{money(b.unitPrice)}</Td>
            <Td right mono><span className="font-bold">{money(b.remainingAmount)}</span></Td>
            {canEdit && <Td right>{b.remaining > 0 && <button type="button" className="button button-ghost !min-h-[30px] !px-2 text-[11px]" onClick={() => setIssueFor(String(b.id))} data-testid={`button-chem-issue-${b.id}`}><Send size={12} />Выдать</button>}</Td>}
          </tr>)}</tbody></table>}
    </div>}

    {view === "journal" && <div className="surface-card overflow-x-auto" data-testid="table-chem-journal">
      {issues.length === 0 ? <Empty title="Выдач нет" text="Здесь появятся списания химии на поля: кто получил, на какое поле и сезон, сколько и на какую сумму." /> :
        <table className="w-full min-w-[900px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><Th>Дата</Th><Th>Препарат / партия</Th><Th>Поле · год</Th><Th>Получатель</Th><Th right>Количество</Th><Th right>Сумма</Th><Th>Примечание</Th></tr></thead>
          <tbody className="divide-y divide-border/70">{issues.map((i) => <tr key={i.id} data-testid={`row-chem-issue-${i.id}`}>
            <Td mono>{dateFmt(i.occurredOn)}</Td>
            <Td><div className="font-bold">{i.name}</div><div className="text-[10px] text-muted-foreground">накл. № {i.invoiceNumber} · {i.farm}</div></Td>
            <Td><span className="font-semibold">Поле {i.fieldNumber}</span> · {i.year}</Td>
            <Td><div>{i.employeeName}</div><div className="text-[10px] text-muted-foreground">внёс: {i.createdBy}</div></Td>
            <Td right mono>{qty(i.quantity)} {i.unit}</Td>
            <Td right mono><span className="font-bold">{money(i.amount)}</span></Td>
            <Td><span className="text-muted-foreground">{i.notes || "—"}</span></Td>
          </tr>)}</tbody></table>}
    </div>}

    {view === "cost" && <div className="surface-card overflow-x-auto" data-testid="table-chem-cost">
      <div className="border-b border-border px-4 py-2.5 text-[11px] text-muted-foreground">Затраты только на химию (не все агрозатраты). Стоимость на 1 га считается по фактически засеянной площади (повторный сев не увеличивает площадь сверх площади поля в сезоне), а не по плановой площади.</div>
      {fields.length === 0 ? <Empty title="Нет сезонов" text="Сезоны полей создаются во вкладке «Полевые работы»." action={onOpenFields} /> :
        <table className="w-full min-w-[760px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><Th>Поле</Th><Th>Хозяйство</Th><Th>Год · культура</Th><Th right>Факт. сев, га</Th><Th right>Химия, сумма</Th><Th right>Химия на 1 га</Th></tr></thead>
          <tbody className="divide-y divide-border/70">{fields.map((f) => <tr key={f.seasonId} data-testid={`row-chem-cost-${f.seasonId}`}>
            <Td><span className="font-bold">Поле {f.fieldNumber}</span></Td>
            <Td>{f.farm}</Td>
            <Td>{f.year} · {f.cropName}</Td>
            <Td right mono>{qty(f.sownAreaHa)}</Td>
            <Td right mono>{money(f.chemicalAmount)}</Td>
            <Td right mono>{f.costPerHa === null ? <span className="text-muted-foreground" title="Сев по сезону не внесён">нет сева</span> : <span className="font-bold">{money(f.costPerHa)}</span>}</Td>
          </tr>)}</tbody>
          <tfoot><tr className="border-t border-border font-bold"><Td>Итого</Td><Td /><Td /><Td right mono>{qty(sownTotal)}</Td><Td right mono>{money(costTotal)}</Td><Td right mono>{sownTotal > 0 ? money(costWithSowing / sownTotal) : "—"}</Td></tr></tfoot>
        </table>}
    </div>}

    {canEdit && invoiceOpen && <InvoiceDrawer onClose={() => setInvoiceOpen(false)} onDone={() => done("Накладная проведена, партии добавлены на склад.")} />}
    {canEdit && issueFor !== null && <IssueDrawer batches={data?.batches ?? []} seasons={data?.fields ?? []} initialBatch={issueFor} onClose={() => setIssueFor(null)} onDone={() => done("Выдача записана в журнал, остаток партии уменьшен.")} onOpenFields={onOpenFields} />}
  </div>;
}

function Kpi({ label, value, sub, testId }: { label: string; value: string; sub: string; testId: string }) {
  return <div className="surface-card p-3.5" data-testid={testId}><div className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className="mt-1 font-mono text-xl font-bold">{value}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div></div>;
}
function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) { return <th className={cx("px-3 py-2.5 font-bold", right && "text-right")}>{children}</th>; }
function Td({ children, right, mono }: { children?: React.ReactNode; right?: boolean; mono?: boolean }) { return <td className={cx("px-3 py-2.5 align-top", right && "text-right", mono && "font-mono whitespace-nowrap")}>{children}</td>; }
function Empty({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return <div className="empty-state px-4 py-10"><div className="empty-icon"><FlaskConical size={18} /></div><h3 className="mt-3 text-sm font-bold">{title}</h3><p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{text}</p>{action && <button type="button" className="button button-secondary mt-3" onClick={action} data-testid="button-chem-open-fields">Перейти к полевым работам</button>}</div>;
}
function SubmitError({ msg }: { msg: string }) { return msg ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold leading-5 text-destructive" role="alert" data-testid="status-chem-submit-error">{msg} Данные формы сохранены — можно повторить отправку.</div> : null; }

function InvoiceDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState(newInvoice);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [subErr, setSubErr] = useState("");
  const m = useCreateChemicalInvoice();
  const today = businessToday();
  const setLine = (k: string, patch: Partial<Line>) => setF((p) => ({ ...p, lines: p.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) }));
  const total = f.lines.reduce((a, l) => a + (QTY_RE.test(l.quantity) && PRICE_RE.test(l.unitPrice) ? parseNum(l.quantity) * parseNum(l.unitPrice) : 0), 0);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!f.number.trim()) e.number = "Укажите номер накладной";
    if (!f.supplier.trim()) e.supplier = "Укажите поставщика";
    if (!f.occurredOn) e.occurredOn = "Укажите дату"; else if (f.occurredOn > today) e.occurredOn = "Дата не может быть позже сегодняшней";
    f.lines.forEach((l) => {
      if (!l.name.trim()) e[`${l.key}.name`] = "Наименование";
      if (!QTY_RE.test(l.quantity.trim()) || parseNum(l.quantity) <= 0 || parseNum(l.quantity) > 1_000_000) e[`${l.key}.quantity`] = "> 0, до 3 знаков";
      if (!PRICE_RE.test(l.unitPrice.trim()) || parseNum(l.unitPrice) > 10_000_000) e[`${l.key}.unitPrice`] = "≥ 0, до 2 знаков";
    });
    setErrs(e); setSubErr("");
    if (Object.keys(e).length) return;
    m.mutate({ data: { requestId: f.requestId, number: f.number.trim(), occurredOn: f.occurredOn, supplier: f.supplier.trim(), farm: f.farm, lines: f.lines.map((l) => ({ name: l.name.trim(), unit: l.unit, quantity: parseNum(l.quantity), unitPrice: parseNum(l.unitPrice) })) } }, {
      onSuccess: () => { setF(newInvoice()); onDone(); onClose(); },
      onError: (err) => { const i = errorInfo(err); setSubErr(i.status === 409 ? "Накладная с таким номером, датой, поставщиком и хозяйством уже проведена. Проверьте журнал остатков." : i.message); },
    });
  };

  return <Drawer title="Приход по накладной" eyebrow="Склад химии" onClose={onClose} testId="drawer-chem-invoice" footer={<div className="flex justify-between gap-2"><span className="self-center font-mono text-sm font-bold" data-testid="text-chem-invoice-total">{money(total)}</span><div className="flex gap-2"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="submit" form="chem-invoice-form" className="button button-primary" disabled={m.isPending} data-testid="button-chem-invoice-submit">{m.isPending ? "Проводим…" : "Провести накладную"}</button></div></div>}>
    <form id="chem-invoice-form" onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Номер накладной" error={errs.number} htmlFor="ci-number"><input id="ci-number" className="text-input" maxLength={100} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} data-testid="input-chem-invoice-number" /></Field>
        <Field label="Дата прихода" error={errs.occurredOn} htmlFor="ci-date"><input id="ci-date" type="date" max={today} className="text-input" value={f.occurredOn} onChange={(e) => setF({ ...f, occurredOn: e.target.value })} data-testid="input-chem-invoice-date" /></Field>
        <Field label="Поставщик" error={errs.supplier} htmlFor="ci-supplier"><input id="ci-supplier" className="text-input" maxLength={200} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} data-testid="input-chem-invoice-supplier" /></Field>
        <Field label="Хозяйство" htmlFor="ci-farm"><select id="ci-farm" className="text-input" value={f.farm} onChange={(e) => setF({ ...f, farm: e.target.value })} data-testid="select-chem-invoice-farm">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between"><span className="form-label">Строки накладной ({f.lines.length})</span><button type="button" className="button button-ghost !min-h-[30px] text-[11px]" disabled={f.lines.length >= 100} onClick={() => setF({ ...f, lines: [...f.lines, newLine()] })} data-testid="button-chem-line-add"><Plus size={12} />Строка</button></div>
        <div className="space-y-2">{f.lines.map((l, i) => <div key={l.key} className="rounded-lg border border-border p-2.5" data-testid={`row-chem-line-${i}`}>
          <div className="flex gap-2"><input className={cx("text-input flex-1", errs[`${l.key}.name`] && "border-destructive")} placeholder="Наименование препарата" maxLength={200} value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} data-testid={`input-chem-line-name-${i}`} />
            <button type="button" className="button button-ghost !px-2" aria-label="Удалить строку" disabled={f.lines.length === 1} onClick={() => setF({ ...f, lines: f.lines.filter((x) => x.key !== l.key) })} data-testid={`button-chem-line-remove-${i}`}><Trash2 size={14} /></button></div>
          <div className="mt-2 grid grid-cols-[1fr_80px_1fr] gap-2">
            <input inputMode="decimal" className={cx("text-input font-mono", errs[`${l.key}.quantity`] && "border-destructive")} placeholder="Кол-во" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} data-testid={`input-chem-line-qty-${i}`} />
            <select className="text-input" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value as ChemicalInvoiceLineUnit })} data-testid={`select-chem-line-unit-${i}`}>{CHEM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            <input inputMode="decimal" className={cx("text-input font-mono", errs[`${l.key}.unitPrice`] && "border-destructive")} placeholder="Цена за ед., ₸" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} data-testid={`input-chem-line-price-${i}`} />
          </div>
          {(errs[`${l.key}.name`] || errs[`${l.key}.quantity`] || errs[`${l.key}.unitPrice`]) && <p className="mt-1 text-[10px] font-semibold text-destructive">{[errs[`${l.key}.name`], errs[`${l.key}.quantity`] && `Количество: ${errs[`${l.key}.quantity`]}`, errs[`${l.key}.unitPrice`] && `Цена: ${errs[`${l.key}.unitPrice`]}`].filter(Boolean).join(" · ")}</p>}
        </div>)}</div>
      </div>
      <SubmitError msg={subErr} />
    </form>
  </Drawer>;
}

function IssueDrawer({ batches, seasons, initialBatch, onClose, onDone, onOpenFields }: { batches: ChemicalBatch[]; seasons: { seasonId: number; fieldNumber: string; farm: string; year: number; cropName: string }[]; initialBatch: string; onClose: () => void; onDone: () => void; onOpenFields?: () => void }) {
  const [f, setF] = useState(() => newIssue(initialBatch));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [subErr, setSubErr] = useState("");
  const m = useCreateChemicalIssue();
  const empQ = useListEmployees({ query: { queryKey: getListEmployeesQueryKey(), staleTime: 30_000 } });
  const employees = (empQ.data ?? []).filter((e) => e.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  const today = businessToday();
  const available = batches.filter((b) => b.remaining > 0 || String(b.id) === f.batchId);
  const batch = batches.find((b) => String(b.id) === f.batchId);
  const farmSeasons = batch ? seasons.filter((s) => s.farm === batch.farm).sort((a, b) => b.year - a.year || a.fieldNumber.localeCompare(b.fieldNumber, "ru", { numeric: true })) : [];
  const season = farmSeasons.find((x) => String(x.seasonId) === f.seasonId);
  const amount = batch && batch.remaining > 0 && QTY_RE.test(f.quantity)
    ? Math.round(batch.remainingAmount * 100 * parseNum(f.quantity) / batch.remaining) / 100 : 0;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!batch) e.batchId = "Выберите партию";
    if (!f.seasonId || !farmSeasons.some((s) => String(s.seasonId) === f.seasonId)) e.seasonId = "Выберите поле и сезон того же хозяйства";
    if (!f.employeeId || !employees.some((x) => String(x.id) === f.employeeId)) e.employeeId = "Выберите активного сотрудника";
    if (!QTY_RE.test(f.quantity.trim()) || parseNum(f.quantity) <= 0) e.quantity = "Больше нуля, до 3 знаков после запятой";
    else if (batch && parseNum(f.quantity) > batch.remaining) e.quantity = `В партии осталось ${qty(batch.remaining)} ${batch.unit}`;
    if (!f.occurredOn) e.occurredOn = "Укажите дату";
    else if (f.occurredOn > today) e.occurredOn = "Дата не может быть позже сегодняшней";
    else if (batch && f.occurredOn < batch.occurredOn.slice(0, 10)) e.occurredOn = `Не раньше даты прихода ${dateFmt(batch.occurredOn)}`;
    else if (season && Number(f.occurredOn.slice(0, 4)) !== season.year) e.occurredOn = `Дата должна быть в ${season.year} году — году выбранного сезона`;
    setErrs(e); setSubErr("");
    if (Object.keys(e).length) return;
    m.mutate({ data: { requestId: f.requestId, batchId: Number(f.batchId), seasonId: Number(f.seasonId), employeeId: Number(f.employeeId), quantity: parseNum(f.quantity), occurredOn: f.occurredOn, notes: f.notes.trim() } }, {
      onSuccess: () => { setF(newIssue()); onDone(); onClose(); },
      onError: (err) => setSubErr(errorInfo(err).message),
    });
  };

  return <Drawer title="Выдача химии на поле" eyebrow="Склад химии" onClose={onClose} testId="drawer-chem-issue" footer={<div className="flex justify-between gap-2"><span className="self-center font-mono text-sm font-bold" data-testid="text-chem-issue-amount">{money(amount)}</span><div className="flex gap-2"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="submit" form="chem-issue-form" className="button button-primary" disabled={m.isPending} data-testid="button-chem-issue-submit">{m.isPending ? "Записываем…" : "Записать выдачу"}</button></div></div>}>
    <form id="chem-issue-form" onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Партия (накладная)" error={errs.batchId} htmlFor="cs-batch" hint={batch ? `Остаток ${qty(batch.remaining)} ${batch.unit} · ${money(batch.unitPrice)} за ${batch.unit} · приход ${dateFmt(batch.occurredOn)}` : available.length === 0 ? "На складе нет остатков — сначала оформите приход." : undefined}>
        <select id="cs-batch" className="text-input" value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value, seasonId: "" })} data-testid="select-chem-issue-batch"><option value="">Выберите партию</option>{available.map((b) => <option key={b.id} value={b.id}>{b.name} — накл. № {b.invoiceNumber} от {dateFmt(b.occurredOn)} · {b.farm} · ост. {qty(b.remaining)} {b.unit}</option>)}</select>
      </Field>
      <Field label="Поле и сезон" error={errs.seasonId} htmlFor="cs-season" hint={batch && farmSeasons.length === 0 ? <span>Нет сезонов полей хозяйства {batch.farm}. Создайте их во вкладке «Полевые работы».{onOpenFields && <> <button type="button" className="font-bold underline" onClick={() => { onClose(); onOpenFields(); }}>Открыть</button></>}</span> : !batch ? "Сначала выберите партию — список ограничен её хозяйством." : undefined}>
        <select id="cs-season" className="text-input" disabled={!batch} value={f.seasonId} onChange={(e) => setF({ ...f, seasonId: e.target.value })} data-testid="select-chem-issue-season"><option value="">Выберите поле</option>{farmSeasons.map((s) => <option key={s.seasonId} value={s.seasonId}>Поле {s.fieldNumber} · {s.year} · {s.cropName}</option>)}</select>
      </Field>
      <Field label="Получатель" error={errs.employeeId} htmlFor="cs-emp" hint={!empQ.isLoading && !empQ.isError && employees.length === 0 ? "В справочнике нет активных сотрудников. Добавьте их в разделе «Сотрудники»." : undefined}>
        {empQ.isLoading ? <div className="skeleton h-10 rounded-lg" /> : empQ.isError ? <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">Справочник сотрудников не загрузился. <button type="button" className="font-bold underline" onClick={() => void empQ.refetch()}>Повторить</button></div> :
          <select id="cs-emp" className="text-input" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} data-testid="select-chem-issue-employee"><option value="">Выберите сотрудника</option>{employees.map((x) => <option key={x.id} value={x.id}>{x.fullName}{x.position ? ` — ${x.position}` : ""}</option>)}</select>}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Количество${batch ? `, ${batch.unit}` : ""}`} error={errs.quantity} htmlFor="cs-qty"><input id="cs-qty" inputMode="decimal" className="text-input font-mono" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} data-testid="input-chem-issue-qty" /></Field>
        <Field label="Дата выдачи" error={errs.occurredOn} htmlFor="cs-date"><input id="cs-date" type="date" min={batch?.occurredOn.slice(0, 10)} max={today} className="text-input" value={f.occurredOn} onChange={(e) => setF({ ...f, occurredOn: e.target.value })} data-testid="input-chem-issue-date" /></Field>
      </div>
      <Field label="Примечание" htmlFor="cs-notes"><textarea id="cs-notes" className="text-input min-h-20" maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-chem-issue-notes" /></Field>
      <SubmitError msg={subErr} />
    </form>
  </Drawer>;
}

/** Read-only chemistry cost for one field season; shares the warehouse cache and polling. */
export function ChemicalSeasonCost({ seasonId }: { seasonId: number }) {
  const q = useGetChemicalWarehouse({ query: { queryKey: getGetChemicalWarehouseQueryKey(), refetchInterval: POLL_MS } });
  if (q.isLoading) return <div className="skeleton h-8 rounded-lg" />;
  if (q.isError) return errorInfo(q.error).status === 403 ? null : <p className="text-[10.5px] text-muted-foreground">Затраты на химию не загрузились. <button type="button" className="font-bold underline" onClick={() => void q.refetch()}>Повторить</button></p>;
  const c = q.data?.fields.find((x) => x.seasonId === seasonId);
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-[11px]" data-testid={`chem-season-cost-${seasonId}`}>
    <span className="flex items-center gap-1.5 font-bold"><FlaskConical size={13} />Химия (только выдачи со склада)</span>
    <span>Сумма: <b className="font-mono" data-testid={`text-chem-season-amount-${seasonId}`}>{money(c?.chemicalAmount ?? 0)}</b></span>
    <span>Факт. сев: <b className="font-mono">{qty(c?.sownAreaHa ?? 0)} га</b></span>
    <span>На 1 га: <b className="font-mono" data-testid={`text-chem-season-perha-${seasonId}`}>{c && c.costPerHa !== null ? money(c.costPerHa) : "нет сева"}</b></span>
  </div>;
}
