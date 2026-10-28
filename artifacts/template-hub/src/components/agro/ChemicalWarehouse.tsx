import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, FlaskConical, PackagePlus, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  type ChemicalBatch,
  type ChemicalInvoiceLineUnit,
  getGetChemicalWarehouseQueryKey,
  useCreateChemicalInvoice,
  useUpdateChemicalBatchPackaging,
  useGetChemicalWarehouse,
} from "@workspace/api-client-react";
import { Drawer, Field, POLL_MS, UNITS, cx, dateFmt, errorInfo } from "./grain/shared";
import { businessToday } from "../engineering/repairs/shared";
import { CustodyList, WarehouseRequests } from "./chemicals/Custody";
import { useChemicalWorkflow, useInvalidateChemicals } from "./chemicals/Workflow";
import { WarehouseReturns } from "./chemicals/Returns";

const CHEM_UNITS: ChemicalInvoiceLineUnit[] = ["л", "кг", "шт"];
export const canManageChemicals = (r: string) => r === "grain_manager" || r === "general_director";

const nf3 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const nf2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: number) => nf3.format(v);
const money = (v: number) => `${nf2.format(v)} ₸`;
const parseNum = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
const QTY_RE = /^\d+([.,]\d{1,3})?$/;
const PRICE_RE = /^\d+([.,]\d{1,2})?$/;
const INT_RE = /^\d+$/;
const milli = (v: number) => Math.round(v * 1000);
/** Exact total in milli-units: capacity × count, or null when inputs invalid. */
const lineTotal = (vol: string, count: string) => QTY_RE.test(vol.trim()) && parseNum(vol) > 0 && INT_RE.test(count.trim()) && Number(count) > 0 ? milli(parseNum(vol)) * Number(count) : null;

type View = "stock" | "requests" | "custody" | "returns" | "journal" | "cost";
type Line = { key: string; name: string; unit: ChemicalInvoiceLineUnit; containerVolume: string; containerCount: string; unitPrice: string };
const newLine = (): Line => ({ key: crypto.randomUUID(), name: "", unit: "л", containerVolume: "", containerCount: "", unitPrice: "" });
const newInvoice = () => ({ requestId: crypto.randomUUID(), number: "", occurredOn: businessToday(), supplier: "", farm: UNITS[0] as string, lines: [newLine()] });

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
  const flow = useChemicalWorkflow();
  const openReq = (flow.data?.requests ?? []).filter((r) => r.issuedQuantity < r.quantity).length;
  const custodyAmount = (flow.data?.custody ?? []).reduce((a, c) => a + (c.remaining > 0 ? c.remainingAmount : 0), 0);
  const [notice, setNotice] = useState("");
  const [packTarget, setPackTarget] = useState<ChemicalBatch | null>(null);
  const pendingReturns = (flow.data?.containerReturns ?? []).filter((r) => r.consumptionId == null).length;

  const data = q.data;
  const s = search.trim().toLowerCase();
  const years = useMemo(() => Array.from(new Set([...(data?.fields ?? []).map((f) => f.year), ...(data?.issues ?? []).map((i) => i.year)])).sort((a, b) => b - a), [data]);
  const batches = useMemo(() => (data?.batches ?? []).filter((b) => (farm === "all" || b.farm === farm) && (showEmpty || b.remaining > 0) && (!s || `${b.name} ${b.supplier} ${b.invoiceNumber}`.toLowerCase().includes(s))).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id), [data, farm, showEmpty, s]);
  const issues = useMemo(() => (data?.issues ?? []).filter((i) => (farm === "all" || i.farm === farm) && (year === "all" || String(i.year) === year) && (!s || `${i.name} ${i.fieldNumber} ${i.employeeName} ${i.invoiceNumber}`.toLowerCase().includes(s))).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id), [data, farm, year, s]);
  const fields = useMemo(() => (data?.fields ?? []).filter((f) => (farm === "all" || f.farm === farm) && (year === "all" || String(f.year) === year) && (!s || `${f.fieldNumber} ${f.cropName}`.toLowerCase().includes(s))).sort((a, b) => b.year - a.year || a.farm.localeCompare(b.farm) || a.fieldNumber.localeCompare(b.fieldNumber, "ru", { numeric: true })), [data, farm, year, s]);

  const stockTotal = batches.reduce((a, b) => a + b.remainingAmount, 0);
  const stockLitres = batches.reduce((total, batch) => total + (batch.unit === "л" ? Math.round(batch.remaining * 1000) : 0), 0) / 1000;
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
        {!canEdit && <p className="mt-1 text-xs text-muted-foreground" data-testid="text-chem-readonly">Только просмотр. Приход и выдачу по заявкам агрономов оформляют заведующий током и генеральный директор.</p>}
      </div>
      {canEdit && <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-secondary" onClick={() => setView("requests")} data-testid="button-chem-issue-open">Заявки агрономов ({openReq})</button>
        <button type="button" className="button button-primary" onClick={() => setInvoiceOpen(true)} data-testid="button-chem-invoice-open"><PackagePlus size={14} />Приход по накладной</button>
      </div>}
    </div>
    {notice && <div className="rounded-lg border border-[hsl(157_45%_70%)] bg-[hsl(157_45%_94%)] px-3 py-2 text-xs font-semibold text-[hsl(161_45%_26%)]" role="status" data-testid="status-chem-notice">{notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi label="Остаток на складе" value={money(stockTotal)} sub={`${batches.filter((b) => b.remaining > 0).length} партий в выборке`} testId="kpi-chem-stock" />
      <Kpi label="Остаток в литрах" value={`${qty(stockLitres)} л`} sub="По выбранным партиям · без кг и шт" testId="kpi-chem-stock-litres" />
      <Kpi label="На подотчёте агрономов" value={money(custodyAmount)} sub="Ожидает подтверждения расхода" testId="kpi-chem-custody" danger={custodyAmount > 0} />
      <Kpi label="Выдано по журналу" value={money(issuedTotal)} sub={`${issues.length} выдач`} testId="kpi-chem-issued" />
      <Kpi label="Химия на 1 га посева" value={sownTotal > 0 ? money(costWithSowing / sownTotal) : "—"} sub={`${qty(sownTotal)} га фактического сева`} testId="kpi-chem-perha" />
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1" role="tablist">
        {([["stock", "Остатки"], ["requests", `Заявки (${openReq})`], ["custody", "Подотчёт"], ["returns", `Пустая тара (${pendingReturns})`], ["journal", "Журнал выдачи"], ["cost", "Затраты по полям"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={cx("rounded-md px-3 py-1.5 text-xs font-bold", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setView(k)} data-testid={`tab-chem-${k}`}>{l}</button>)}
      </div>
      <select className="text-input !w-auto !min-h-[34px]" value={farm} onChange={(e) => setFarm(e.target.value)} data-testid="select-chem-farm"><option value="all">Все хозяйства</option>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
      {view !== "stock" && <select className="text-input !w-auto !min-h-[34px]" value={year} onChange={(e) => setYear(e.target.value)} data-testid="select-chem-year"><option value="all">Все годы</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
      <div className="relative min-w-[200px] flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="text-input !min-h-[34px] !pl-8" placeholder="Препарат, поставщик, поле, сотрудник" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-chem-search" /></div>
      {view === "stock" && <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} data-testid="checkbox-chem-empty" />Показать израсходованные</label>}
    </div>

    {view === "stock" && <div className="surface-card overflow-x-auto" data-testid="table-chem-stock">
      {batches.length === 0 ? <Empty title="Партий нет" text={canEdit ? "Оформите приход по накладной — каждая строка накладной станет отдельной партией со своей ценой." : "Пока нет партий химии на складе по выбранным условиям."} /> :
        <table className="w-full min-w-[860px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><Th>Накладная</Th><Th>Поставщик / хозяйство</Th><Th>Препарат</Th><Th right>Получено</Th><Th right>Тара</Th><Th right>Остаток</Th><Th right>Цена ед.</Th><Th right>Сумма остатка</Th></tr></thead>
          <tbody className="divide-y divide-border/70">{batches.map((b) => <tr key={b.id} className={cx(b.remaining <= 0 && "opacity-55")} data-testid={`row-chem-batch-${b.id}`}>
            <Td><div className="font-bold">№ {b.invoiceNumber}</div><div className="text-[10px] text-muted-foreground">{dateFmt(b.occurredOn)}</div></Td>
            <Td><div className="font-semibold">{b.supplier}</div><div className="text-[10px] text-muted-foreground">{b.farm}</div></Td>
            <Td><span className="font-bold">{b.name}</span></Td>
            <Td right mono>{qty(b.quantity)} {b.unit}</Td>
            <Td right mono>{b.containerVolume ? <span data-testid={`text-chem-packaging-${b.id}`}>{b.containerCount ?? "?"} × {qty(b.containerVolume)} {b.unit}</span> : canEdit ? <button type="button" className="button button-ghost !min-h-[26px] !px-2 text-[11px] text-destructive" onClick={() => setPackTarget(b)} data-testid={`button-chem-packaging-${b.id}`}><Boxes size={12} />Указать тару</button> : <span className="text-muted-foreground">не указана</span>}</Td>
            <Td right mono><span className="font-bold" data-testid={`text-chem-remaining-${b.id}`}>{qty(b.remaining)} {b.unit}</span></Td>
            <Td right mono>{money(b.unitPrice)}</Td>
            <Td right mono><span className="font-bold">{money(b.remainingAmount)}</span></Td>
          </tr>)}</tbody></table>}
    </div>}

    {view === "requests" && <WarehouseRequests canEdit={canEdit} onDone={done} />}
    {view === "custody" && <div className="surface-card" data-testid="section-chem-custody"><div className="border-b border-border px-4 py-2.5 text-[11px] font-semibold text-destructive">Химия на подотчёте агрономов, не подтверждённая диспетчером как дневной расход. Сданная тара показана отдельно и до подтверждения не уменьшает остаток.</div><CustodyList testId="table-chem-custody" /></div>}
    {view === "returns" && <WarehouseReturns canEdit={canEdit} onDone={done} />}
    {view === "journal" && <div className="surface-card overflow-x-auto" data-testid="table-chem-journal">
      {issues.length === 0 ? <Empty title="Выдач нет" text="Здесь появятся списания химии на поля: кто получил, на какое поле и сезон, сколько и на какую сумму." /> :
        <table className="w-full min-w-[900px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><Th>Дата</Th><Th>Препарат / партия</Th><Th>Поле · год</Th><Th>Получатель</Th><Th right>Количество</Th><Th right>Сумма</Th><Th>Примечание</Th></tr></thead>
          <tbody className="divide-y divide-border/70">{issues.map((i) => <tr key={i.id} data-testid={`row-chem-issue-${i.id}`}>
            <Td mono>{dateFmt(i.occurredOn)}</Td>
            <Td><div className="font-bold">{i.name}</div><div className="text-[10px] text-muted-foreground">накл. № {i.invoiceNumber} · {i.farm}</div></Td>
            <Td><span className="font-semibold">Поле {i.fieldNumber}</span> · {i.year}</Td>
            <Td><div>{i.employeeName}</div>{i.chemicalRequestId == null && <div className="text-[10px] text-muted-foreground">прежняя выдача · затраты учтены</div>}<div className="text-[10px] text-muted-foreground">внёс: {i.createdBy}</div></Td>
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

    {canEdit && packTarget && <PackagingDrawer batch={packTarget} onClose={() => setPackTarget(null)} onDone={() => { setPackTarget(null); done("Фасовка партии сохранена."); }} />}
    {canEdit && invoiceOpen && <InvoiceDrawer onClose={() => setInvoiceOpen(false)} onDone={() => done("Накладная проведена, партии добавлены на склад.")} />}
  </div>;
}

function Kpi({ label, value, sub, testId, danger }: { label: string; value: string; sub: string; testId: string; danger?: boolean }) {
  return <div className={cx("surface-card p-3.5", danger && "border-destructive/40 text-destructive")} data-testid={testId}><div className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className="mt-1 font-mono text-xl font-bold">{value}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div></div>;
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
  const total = f.lines.reduce((a, l) => { const t = lineTotal(l.containerVolume, l.containerCount); return a + (t !== null && PRICE_RE.test(l.unitPrice) ? (t / 1000) * parseNum(l.unitPrice) : 0); }, 0);
  const litres = f.lines.reduce((a, l) => a + (l.unit === "л" ? lineTotal(l.containerVolume, l.containerCount) ?? 0 : 0), 0) / 1000;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!f.number.trim()) e.number = "Укажите номер накладной";
    if (!f.supplier.trim()) e.supplier = "Укажите поставщика";
    if (!f.occurredOn) e.occurredOn = "Укажите дату"; else if (f.occurredOn > today) e.occurredOn = "Дата не может быть позже сегодняшней";
    f.lines.forEach((l) => {
      if (!l.name.trim()) e[`${l.key}.name`] = "Наименование";
      if (!QTY_RE.test(l.containerVolume.trim()) || parseNum(l.containerVolume) <= 0) e[`${l.key}.quantity`] = "объём тары > 0, до 3 знаков";
      else if (!INT_RE.test(l.containerCount.trim()) || Number(l.containerCount) < 1) e[`${l.key}.quantity`] = "число ёмкостей — целое > 0";
      else if ((lineTotal(l.containerVolume, l.containerCount) ?? 0) > 1_000_000_000) e[`${l.key}.quantity`] = "итог больше 1 000 000";
      if (!PRICE_RE.test(l.unitPrice.trim()) || parseNum(l.unitPrice) > 10_000_000) e[`${l.key}.unitPrice`] = "≥ 0, до 2 знаков";
    });
    setErrs(e); setSubErr("");
    if (Object.keys(e).length) return;
    m.mutate({ data: { requestId: f.requestId, number: f.number.trim(), occurredOn: f.occurredOn, supplier: f.supplier.trim(), farm: f.farm, lines: f.lines.map((l) => ({ name: l.name.trim(), unit: l.unit, quantity: lineTotal(l.containerVolume, l.containerCount)! / 1000, containerVolume: parseNum(l.containerVolume), containerCount: Number(l.containerCount), unitPrice: parseNum(l.unitPrice) })) } }, {
      onSuccess: () => { setF(newInvoice()); onDone(); onClose(); },
      onError: (err) => { const i = errorInfo(err); setSubErr(i.status === 409 ? "Накладная с таким номером, датой, поставщиком и хозяйством уже проведена. Проверьте журнал остатков." : i.message); },
    });
  };

  return <Drawer title="Приход по накладной" eyebrow="Склад химии" onClose={onClose} testId="drawer-chem-invoice" footer={<div className="flex justify-between gap-2"><span className="self-center font-mono text-sm font-bold" data-testid="text-chem-invoice-total">{money(total)}<span className="block text-[10px] font-normal text-muted-foreground" data-testid="text-chem-invoice-litres">{qty(litres)} л по строкам</span></span><div className="flex gap-2"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="submit" form="chem-invoice-form" className="button button-primary" disabled={m.isPending} data-testid="button-chem-invoice-submit">{m.isPending ? "Проводим…" : "Провести накладную"}</button></div></div>}>
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
          <div className="mt-2 grid grid-cols-[80px_1fr_1fr] gap-2">
            <select className="text-input" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value as ChemicalInvoiceLineUnit })} data-testid={`select-chem-line-unit-${i}`}>{CHEM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            <input inputMode="decimal" className={cx("text-input font-mono", errs[`${l.key}.quantity`] && "border-destructive")} placeholder={`Объём тары, ${l.unit}`} value={l.containerVolume} onChange={(e) => setLine(l.key, { containerVolume: e.target.value })} data-testid={`input-chem-line-volume-${i}`} />
            <input inputMode="numeric" className={cx("text-input font-mono", errs[`${l.key}.quantity`] && "border-destructive")} placeholder="Ёмкостей, шт." value={l.containerCount} onChange={(e) => setLine(l.key, { containerCount: e.target.value })} data-testid={`input-chem-line-count-${i}`} />
          </div>
          <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2">
            <div className="flex items-center rounded-lg bg-muted/40 px-3 font-mono text-xs" data-testid={`text-chem-line-qty-${i}`}>{(() => { const t = lineTotal(l.containerVolume, l.containerCount); return t === null ? <span className="text-muted-foreground">Итого = тара × шт.</span> : <span>{l.containerCount} × {qty(parseNum(l.containerVolume))} = <b>{qty(t / 1000)} {l.unit}</b></span>; })()}</div>
            <input inputMode="decimal" className={cx("text-input font-mono", errs[`${l.key}.unitPrice`] && "border-destructive")} placeholder={`Цена за ${l.unit}, ₸`} value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} data-testid={`input-chem-line-price-${i}`} />
          </div>
          {(errs[`${l.key}.name`] || errs[`${l.key}.quantity`] || errs[`${l.key}.unitPrice`]) && <p className="mt-1 text-[10px] font-semibold text-destructive">{[errs[`${l.key}.name`], errs[`${l.key}.quantity`] && `Количество: ${errs[`${l.key}.quantity`]}`, errs[`${l.key}.unitPrice`] && `Цена: ${errs[`${l.key}.unitPrice`]}`].filter(Boolean).join(" · ")}</p>}
        </div>)}</div>
      </div>
      <SubmitError msg={subErr} />
    </form>
  </Drawer>;
}

function PackagingDrawer({ batch, onClose, onDone }: { batch: ChemicalBatch; onClose: () => void; onDone: () => void }) {
  const [vol, setVol] = useState("");
  const [count, setCount] = useState("");
  const [err, setErr] = useState("");
  const [subErr, setSubErr] = useState("");
  const m = useUpdateChemicalBatchPackaging();
  const invalidate = useInvalidateChemicals();
  const t = lineTotal(vol, count);
  const target = milli(batch.quantity);
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setSubErr("");
    if (t === null) { setErr("Объём тары > 0 (до 3 знаков) и целое число ёмкостей"); return; }
    if (t !== target) { setErr(`Тара × шт. должно точно равняться полученному количеству ${qty(batch.quantity)} ${batch.unit}`); return; }
    setErr("");
    m.mutate({ id: batch.id, data: { containerVolume: parseNum(vol), containerCount: Number(count) } }, {
      onSuccess: () => { void invalidate(); onDone(); },
      onError: (x) => { const i = errorInfo(x); setSubErr(i.status === 409 ? "По партии уже есть сданная тара, фасовку изменить нельзя." : i.message); },
    });
  };
  return <Drawer title="Фасовка партии" eyebrow="Склад химии" onClose={onClose} testId="drawer-chem-packaging" footer={<div className="flex justify-end gap-2"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="submit" form="chem-packaging-form" className="button button-primary" disabled={m.isPending} data-testid="button-chem-packaging-submit">{m.isPending ? "Сохраняем..." : "Сохранить фасовку"}</button></div>}>
    <form id="chem-packaging-form" onSubmit={submit} noValidate className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5"><div className="font-bold">{batch.name}</div><div>накл. № {batch.invoiceNumber} · {dateFmt(batch.occurredOn)} · {batch.farm}</div><div className="font-mono">Получено {qty(batch.quantity)} {batch.unit}. Количество, остаток и цена не меняются.</div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Объём тары, ${batch.unit}`} htmlFor="cp-vol"><input id="cp-vol" inputMode="decimal" className="text-input font-mono" value={vol} onChange={(e) => setVol(e.target.value)} data-testid="input-chem-packaging-volume" /></Field>
        <Field label="Ёмкостей, шт." htmlFor="cp-count"><input id="cp-count" inputMode="numeric" className="text-input font-mono" value={count} onChange={(e) => setCount(e.target.value)} data-testid="input-chem-packaging-count" /></Field>
      </div>
      <div className={cx("rounded-lg border px-3 py-2 font-mono text-xs", t !== null && t !== target ? "border-destructive/40 text-destructive" : "border-border")} data-testid="text-chem-packaging-check">{t === null ? "тара × шт." : `${count} × ${qty(parseNum(vol))} = ${qty(t / 1000)}`} {batch.unit} / нужно {qty(batch.quantity)} {batch.unit}</div>
      {err && <p className="text-[11px] font-semibold text-destructive" role="alert">{err}</p>}
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
