import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Fuel, Link2Off, RefreshCw, X } from "lucide-react";
import {
  type FleetEquipment, type FuelMovement, type FuelWarehouse, FuelReceiptInputFarm,
  getGetFuelWarehouseQueryKey, useCreateFuelIssue, useCreateFuelReceipt, useGetFuelWarehouse,
} from "@workspace/api-client-react";
import { businessToday } from "./repairs/shared";

const POLL = 30000;
const FARMS = Object.values(FuelReceiptInputFarm);
type Farm = (typeof FARMS)[number];
const DEFAULT_FUEL = "Дизельное топливо";
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const lnf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const kzt = (v: number) => `${money.format(v)} ₸`;
const lit = (v: number) => `${lnf.format(v)} л`;
const today = businessToday;
const normFuel = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase().replace(/ё/g, "е");
const dfmt = (v: string) => { const d = new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("ru-RU"); };
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const num = (s: string) => { const n = Number(s.replace(",", ".").replace(/\s/g, "")); return s.trim() && Number.isFinite(n) ? n : NaN; };
const fleetLabel = (f: FleetEquipment) => `${f.kind} · ${f.registrationNumber || "без госномера"}`;
function errText(err: unknown) {
  const e = err as { status?: number; data?: { error?: unknown }; message?: string } | null;
  if (e?.status === 403) return "Недостаточно прав для этого действия.";
  return typeof e?.data?.error === "string" ? e.data.error : e?.message ?? "Не удалось сохранить. Повторите попытку.";
}

export default function FuelDepot({ role, demoActive }: { role: string; demoActive: boolean }) {
  const q = useGetFuelWarehouse({ query: { queryKey: getGetFuelWarehouseQueryKey(), refetchInterval: POLL } });
  const canWrite = (role === "fuel_manager" || role === "general_director") && !demoActive;
  const [form, setForm] = useState<"receipt" | "issue" | null>(null);
  const [farmFilter, setFarmFilter] = useState<"" | Farm>("");
  const [kindFilter, setKindFilter] = useState<"" | "receipt" | "issue">("");

  if (q.isLoading) return <div className="space-y-3" data-testid="status-fuel-loading"><div className="grid gap-3 sm:grid-cols-2"><div className="skeleton h-28 rounded-xl" /><div className="skeleton h-28 rounded-xl" /></div><div className="skeleton h-72 rounded-xl" /></div>;
  if (q.isError || !q.data) return <div className="surface-card empty-state" data-testid="status-fuel-error"><div className="empty-icon empty-icon-error"><X size={20} /></div><h3 className="mt-4 text-sm font-bold">Не удалось загрузить нефтебазу</h3><p className="mt-1 text-xs text-muted-foreground">{errText(q.error)}</p><button type="button" className="button button-secondary mt-4" onClick={() => { void q.refetch(); }} data-testid="button-fuel-retry"><RefreshCw size={14} />Повторить</button></div>;
  const data = q.data;
  const movements = data.movements.filter((m) => (!farmFilter || m.farm === farmFilter) && (!kindFilter || m.kind === kindFilter))
    .slice().sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id);

  return <div className="space-y-6 animate-page" data-testid="section-engineering-petroleum">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="eyebrow">Инженерный блок</p><h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em]">Нефтебаза</h2><p className="mt-1 text-sm text-muted-foreground">Остатки по хозяйствам, приход по накладным и выдача на технику. Проведённые записи не редактируются.</p></div>
      {canWrite ? <div className="flex gap-2"><button type="button" className="button button-secondary" onClick={() => setForm("receipt")} data-testid="button-fuel-receipt"><ArrowDownToLine size={15} />Приход</button><button type="button" className="button button-primary" onClick={() => setForm("issue")} data-testid="button-fuel-issue"><ArrowUpFromLine size={15} />Выдача</button></div>
        : <span className="meta-chip" data-testid="text-fuel-readonly">{demoActive ? "Демо-просмотр: запись отключена" : "Только просмотр"}</span>}
    </div>

    <Stocks data={data} />

    <section className="surface-card overflow-hidden">
      <div className="flex flex-col justify-between gap-3 border-b border-border bg-muted/25 px-5 py-4 sm:flex-row sm:items-center">
        <div><h3 className="text-sm font-bold">Движение топлива</h3><p className="text-[11px] text-muted-foreground">{movements.length} записей</p></div>
        <div className="flex flex-wrap gap-2">
          <select className="text-input !w-auto !py-1.5" value={farmFilter} onChange={(e) => setFarmFilter(e.target.value as "" | Farm)} data-testid="select-fuel-farm-filter"><option value="">Все хозяйства</option>{FARMS.map((f) => <option key={f}>{f}</option>)}</select>
          <select className="text-input !w-auto !py-1.5" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as "" | "receipt" | "issue")} data-testid="select-fuel-kind-filter"><option value="">Приход и выдача</option><option value="receipt">Приход</option><option value="issue">Выдача</option></select>
        </div>
      </div>
      {movements.length === 0 ? <div className="empty-state" data-testid="status-fuel-movements-empty"><div className="empty-icon"><Fuel size={20} /></div><h3 className="mt-4 text-sm font-bold">Движений пока нет</h3><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Первый приход по накладной сформирует остаток нефтебазы.</p></div>
        : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-[.1em] text-muted-foreground"><tr><th className="px-5 py-2.5">Дата</th><th className="px-3 py-2.5">Тип</th><th className="px-3 py-2.5">Хозяйство · топливо</th><th className="px-3 py-2.5 text-right">Литры</th><th className="px-3 py-2.5 text-right">Цена/л</th><th className="px-3 py-2.5 text-right">Сумма</th><th className="px-3 py-2.5">Техника / поле / операция</th><th className="px-5 py-2.5">Документ</th></tr></thead>
          <tbody className="divide-y divide-border/70">{movements.map((m) => <Row key={m.id} m={m} />)}</tbody>
        </table></div>}
    </section>

    {form === "receipt" && <ReceiptForm data={data} onClose={() => setForm(null)} />}
    {form === "issue" && <IssueForm data={data} onClose={() => setForm(null)} />}
  </div>;
}

function Stocks({ data }: { data: FuelWarehouse }) {
  return <div className="grid gap-3 md:grid-cols-2" data-testid="section-fuel-stocks">{FARMS.map((farm) => {
    const rows = data.stocks.filter((s) => s.farm === farm);
    const total = rows.reduce((a, s) => a + s.amount, 0);
    return <section key={farm} className="surface-card p-5" data-testid={`card-fuel-stock-${farm}`}>
      <div className="flex items-baseline justify-between gap-2"><h3 className="text-sm font-bold">{farm}</h3><span className="font-mono text-sm font-bold">{kzt(total)}</span></div>
      {rows.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Остатков нет.</p> : <div className="mt-3 divide-y divide-border/70">{rows.map((s) => <div key={s.fuelType} className="flex items-center justify-between gap-3 py-2 text-xs">
        <span className="font-semibold">{s.fuelType}</span>
        <span className="text-right font-mono"><strong className="text-sm">{lit(s.liters)}</strong><span className="block text-[10px] text-muted-foreground">{kzt(s.amount)} · ср. {money.format(s.averagePricePerLiter)} ₸/л</span></span>
      </div>)}</div>}
    </section>;
  })}</div>;
}

function Row({ m }: { m: FuelMovement }) {
  const issue = m.kind === "issue";
  return <tr className="align-top" data-testid={`row-fuel-movement-${m.id}`}>
    <td className="px-5 py-2.5 font-mono">{dfmt(m.occurredOn)}</td>
    <td className="px-3 py-2.5"><span className={`fuel-pill ${issue ? "fuel-pill-out" : "fuel-pill-in"}`}>{issue ? <ArrowUpFromLine size={10} /> : <ArrowDownToLine size={10} />}{issue ? "Выдача" : "Приход"}</span></td>
    <td className="px-3 py-2.5"><p className="font-semibold">{m.fuelType}</p><p className="text-[10.5px] text-muted-foreground">{m.farm}</p></td>
    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${issue ? "fuel-qty-out" : "fuel-qty-in"}`}>{issue ? "−" : "+"}{lit(m.liters)}</td>
    <td className="px-3 py-2.5 text-right font-mono">{money.format(m.pricePerLiter)} ₸</td>
    <td className="px-3 py-2.5 text-right font-mono font-bold">{kzt(m.amount)}</td>
    <td className="px-3 py-2.5">{issue ? <><p className="font-semibold">{m.equipment || "—"}</p>{m.operationId ? <p className="text-[10.5px] text-muted-foreground">Поле № {m.fieldNumber} · {m.operationName}</p> : <p className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground"><Link2Off size={10} />без привязки к полю</p>}</> : <span className="text-muted-foreground">—</span>}</td>
    <td className="px-5 py-2.5"><p>{issue ? "Выдача" : `Накл. ${m.invoiceNumber}`}{!issue && m.supplier ? ` · ${m.supplier}` : ""}</p><p className="text-[10.5px] text-muted-foreground">{m.createdBy}{m.notes ? ` · ${m.notes}` : ""}</p></td>
  </tr>;
}

function useFuelFormBase(data: FuelWarehouse) {
  const [farm, setFarm] = useState<Farm>(FARMS[0]);
  const [fuelType, setFuelType] = useState(DEFAULT_FUEL);
  const [occurredOn, setOccurredOn] = useState(today());
  const [requestId, setRequestId] = useState(uuid);
  const fuelTypes = useMemo(() => { const seen = new Map<string, string>(); [DEFAULT_FUEL, ...data.stocks.map((s) => s.fuelType), ...data.movements.map((m) => m.fuelType)].forEach((t) => { if (!seen.has(normFuel(t))) seen.set(normFuel(t), t); }); return Array.from(seen.values()); }, [data]);
  const lastDate = data.movements.filter((m) => m.farm === farm && normFuel(m.fuelType) === normFuel(fuelType)).reduce((a, m) => (m.occurredOn > a ? m.occurredOn : a), "");
  const stock = data.stocks.find((s) => s.farm === farm && normFuel(s.fuelType) === normFuel(fuelType));
  return { farm, setFarm, fuelType, setFuelType, occurredOn, setOccurredOn, requestId, setRequestId, fuelTypes, lastDate, stock };
}

function Common({ b, testPrefix }: { b: ReturnType<typeof useFuelFormBase>; testPrefix: string }) {
  return <>
    <label className="form-label">Хозяйство<select className="text-input mt-2" value={b.farm} onChange={(e) => b.setFarm(e.target.value as Farm)} data-testid={`select-${testPrefix}-farm`}>{FARMS.map((f) => <option key={f}>{f}</option>)}</select></label>
    <label className="form-label">Вид топлива<input className="text-input mt-2" list="fuel-types" value={b.fuelType} onChange={(e) => b.setFuelType(e.target.value)} data-testid={`input-${testPrefix}-fuel-type`} /><datalist id="fuel-types">{b.fuelTypes.map((t) => <option key={t} value={t} />)}</datalist></label>
    <label className="form-label">Дата<input type="date" className="text-input mt-2" max={today()} min={b.lastDate || undefined} value={b.occurredOn} onChange={(e) => b.setOccurredOn(e.target.value)} data-testid={`input-${testPrefix}-date`} /></label>
    <p className="text-[11px] leading-5 text-muted-foreground" data-testid={`text-${testPrefix}-hint`}>Остаток: {b.stock ? `${lit(b.stock.liters)} · ${kzt(b.stock.amount)}` : "нет"}. {b.lastDate ? `Последнее движение по этому топливу — ${dfmt(b.lastDate)}; дата не может быть раньше и позже сегодняшней.` : "Дата не может быть позже сегодняшней."}</p>
  </>;
}

function Sheet({ title, onClose, onSubmit, pending, error, submitLabel, children, testId }: { title: string; onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; pending: boolean; error: string; submitLabel: string; children: ReactNode; testId: string }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" data-testid={testId}>
    <form className="flex h-full w-full max-w-md flex-col border-l border-border bg-card" onSubmit={onSubmit}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="eyebrow">Нефтебаза</p><h3 className="mt-1 text-lg font-bold">{title}</h3></div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>
      <div className="border-t border-border px-5 py-4">{error && <p className="fuel-error mb-3" role="alert" data-testid={`${testId}-error`}>{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="submit" className="button button-primary" disabled={pending} data-testid={`${testId}-submit`}>{pending ? "Проводим..." : submitLabel}</button></div></div>
    </form>
  </div>;
}

function useInvalidateFuel() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: getGetFuelWarehouseQueryKey() }),
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("/costs") }),
  ]);
}

function ReceiptForm({ data, onClose }: { data: FuelWarehouse; onClose: () => void }) {
  const b = useFuelFormBase(data);
  const m = useCreateFuelReceipt();
  const invalidate = useInvalidateFuel();
  const [liters, setLiters] = useState("");
  const [price, setPrice] = useState("");
  const [invoice, setInvoice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const l = num(liters), p = num(price);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError("");
    if (!b.fuelType.trim()) return setError("Укажите вид топлива.");
    if (!(l > 0 && l <= 1_000_000)) return setError("Литры: больше 0 и не более 1 000 000.");
    if (!(p > 0 && p <= 1_000_000)) return setError("Цена за литр: больше 0 и не более 1 000 000.");
    if (!invoice.trim()) return setError("Укажите номер накладной.");
    if (b.occurredOn > today()) return setError("Дата не может быть в будущем.");
    m.mutate({ data: { requestId: b.requestId, farm: b.farm, fuelType: b.fuelType.trim(), occurredOn: b.occurredOn, liters: Math.round(l * 1000) / 1000, pricePerLiter: Math.round(p * 100) / 100, invoiceNumber: invoice.trim(), supplier: supplier.trim(), notes: notes.trim() } }, {
      onSuccess: () => { void invalidate(); onClose(); },
      onError: (err) => setError(errText(err)),
    });
  };
  return <Sheet title="Приход топлива" onClose={onClose} onSubmit={submit} pending={m.isPending} error={error} submitLabel="Оприходовать" testId="form-fuel-receipt">
    <Common b={b} testPrefix="fuel-receipt" />
    <div className="grid grid-cols-2 gap-3"><label className="form-label">Литры<input className="text-input mt-2" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} data-testid="input-fuel-receipt-liters" /></label><label className="form-label">Цена за литр, ₸<input className="text-input mt-2" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-fuel-receipt-price" /></label></div>
    {l > 0 && p > 0 && <p className="font-mono text-xs">Сумма ≈ {kzt(Math.round(l * p))}</p>}
    <label className="form-label">Номер накладной<input className="text-input mt-2" value={invoice} onChange={(e) => setInvoice(e.target.value)} data-testid="input-fuel-receipt-invoice" /></label>
    <label className="form-label">Поставщик<input className="text-input mt-2" value={supplier} onChange={(e) => setSupplier(e.target.value)} data-testid="input-fuel-receipt-supplier" /></label>
    <label className="form-label">Примечание<textarea className="text-input mt-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-fuel-receipt-notes" /></label>
  </Sheet>;
}

function IssueForm({ data, onClose }: { data: FuelWarehouse; onClose: () => void }) {
  const b = useFuelFormBase(data);
  const m = useCreateFuelIssue();
  const invalidate = useInvalidateFuel();
  const [fleetId, setFleetId] = useState<number | "">("");
  const [liters, setLiters] = useState("");
  const [opChoice, setOpChoice] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const fleet = data.equipment.filter((f) => f.unit === b.farm);
  const vehicle = fleet.find((f) => f.id === fleetId);
  const matches = useMemo(() => {
    if (!vehicle) return [];
    const label = fleetLabel(vehicle);
    const day = b.occurredOn;
    return data.workAssignments.filter((w) => {
      if (w.farm !== b.farm) return false;
      if (!(w.startDate <= day && (w.endDate === null || w.endDate >= day))) return false;
      const daily = w.assignments.filter((a) => a.date === day);
      return daily.some((a) => a.equipment === label) ||
        ((daily.length === 0 || (day === today() && w.endDate === null)) && w.equipment === label);
    });
  }, [vehicle, b.occurredOn, b.farm, data.workAssignments]);
  const operationId = matches.length === 1 ? matches[0].operationId : matches.some((w) => w.operationId === opChoice) ? (opChoice as number) : null;
  const l = num(liters);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError("");
    if (!vehicle) return setError("Выберите технику.");
    if (!b.fuelType.trim()) return setError("Укажите вид топлива.");
    if (!(l > 0 && l <= 1_000_000)) return setError("Литры: больше 0 и не более 1 000 000.");
    if (b.stock && l > b.stock.liters) return setError(`На остатке только ${lit(b.stock.liters)}.`);
    if (!b.stock) return setError("Этого топлива нет на остатке выбранного хозяйства.");
    if (matches.length > 0 && operationId === null) return setError("Выберите полевую операцию, на которую выдаётся топливо.");
    if (b.occurredOn > today()) return setError("Дата не может быть в будущем.");
    m.mutate({ data: { requestId: b.requestId, farm: b.farm, fuelType: b.fuelType.trim(), occurredOn: b.occurredOn, liters: Math.round(l * 1000) / 1000, fleetId: vehicle.id, operationId, notes: notes.trim() } }, {
      onSuccess: () => { void invalidate(); onClose(); },
      onError: (err) => setError(errText(err)),
    });
  };
  return <Sheet title="Выдача топлива" onClose={onClose} onSubmit={submit} pending={m.isPending} error={error} submitLabel="Выдать" testId="form-fuel-issue">
    <Common b={b} testPrefix="fuel-issue" />
    <label className="form-label">Техника<select className="text-input mt-2" value={fleetId} onChange={(e) => { setFleetId(e.target.value ? Number(e.target.value) : ""); setOpChoice(""); }} data-testid="select-fuel-issue-fleet"><option value="">{fleet.length ? "Выберите технику" : "Нет техники в хозяйстве"}</option>{fleet.map((f) => <option key={f.id} value={f.id}>{fleetLabel(f)}</option>)}</select></label>
    {vehicle && (matches.length === 0
      ? <p className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground" data-testid="text-fuel-issue-no-field"><Link2Off size={12} />На эту дату техника не назначена на полевые работы — выдача без привязки к полю.</p>
      : matches.length === 1
        ? <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px]" data-testid="text-fuel-issue-operation">Операция: <strong>Поле № {matches[0].fieldNumber} · {matches[0].operationName}</strong></p>
        : <label className="form-label">Полевая операция<select className="text-input mt-2" value={opChoice} onChange={(e) => setOpChoice(e.target.value ? Number(e.target.value) : "")} data-testid="select-fuel-issue-operation"><option value="">Выберите операцию</option>{matches.map((w) => <option key={w.operationId} value={w.operationId}>Поле № {w.fieldNumber} · {w.operationName}</option>)}</select></label>)}
    <label className="form-label">Литры<input className="text-input mt-2" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} data-testid="input-fuel-issue-liters" /></label>
    {l > 0 && b.stock && <p className="font-mono text-xs">По средней цене ≈ {kzt(Math.round(l * b.stock.averagePricePerLiter))}</p>}
    <label className="form-label">Примечание<textarea className="text-input mt-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-fuel-issue-notes" /></label>
  </Sheet>;
}
