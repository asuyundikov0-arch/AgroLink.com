import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  FileText,
  History,
  PackageCheck,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  type FleetEquipment,
  type SparePart,
  type SparePartMovement,
  getListEngineeringRepairsQueryKey,
  getListEngineeringSparePartMovementsQueryKey,
  getListEngineeringSparePartsQueryKey,
  getListRepairExpensesQueryKey,
  useCreateEngineeringSparePartIssue,
  useCreateEngineeringSparePartReceipt,
  useListEngineeringSparePartMovements,
  useListEngineeringSpareParts,
} from "@workspace/api-client-react";
import { Drawer, Field, SectionError, businessToday, cx, dateFmt, errorInfo, fleetLabel, money, num } from "./repairs/shared";

type Props = { role: string; fleet: FleetEquipment[]; fleetById: Map<number, FleetEquipment> };
type ReceiptForm = {
  requestId: string;
  name: string;
  articleNumber: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  occurredOn: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplier: string;
  description: string;
};
type IssueForm = { requestId: string; sparePartId: number | null; fleetId: number | null; category: "current" | "capital"; occurredOn: string; quantity: string; description: string };
type View = "stock" | "history";
type MovementFilter = "all" | "receipt" | "issue";

const POLL_MS = 30000;
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const initialReceipt = (): ReceiptForm => ({
  requestId: crypto.randomUUID(), name: "", articleNumber: "", unit: "", quantity: "", unitPrice: "",
  occurredOn: businessToday(), invoiceNumber: "", invoiceDate: businessToday(), supplier: "", description: "",
});
const initialIssue = (partId: number | null = null): IssueForm => ({
  requestId: crypto.randomUUID(), sparePartId: partId, fleetId: null, category: "current", occurredOn: businessToday(), quantity: "", description: "",
});
const decimal = (value: string) => Number(value.trim().replace(/\s/g, "").replace(",", "."));
const amountInput = /^\d+(?:[.,]\d{1,3})?$/;
const priceInput = /^\d+(?:[.,]\d{1,2})?$/;

export default function SparePartsWarehouse({ role, fleet, fleetById }: Props) {
  const qc = useQueryClient();
  const stockQ = useListEngineeringSpareParts({ query: { queryKey: getListEngineeringSparePartsQueryKey(), refetchInterval: POLL_MS } });
  const movementsQ = useListEngineeringSparePartMovements({ query: { queryKey: getListEngineeringSparePartMovementsQueryKey(), refetchInterval: POLL_MS } });
  const receive = useCreateEngineeringSparePartReceipt();
  const issue = useCreateEngineeringSparePartIssue();
  const [view, setView] = useState<View>("stock");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<"receipt" | "issue" | null>(null);
  const [receipt, setReceipt] = useState<ReceiptForm>(initialReceipt);
  const [issueForm, setIssueForm] = useState<IssueForm>(initialIssue());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  const parts = useMemo(() => stockQ.data ?? [], [stockQ.data]);
  const movements = useMemo(
    () => [...(movementsQ.data ?? [])].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id),
    [movementsQ.data],
  );
  const filteredMovements = useMemo(
    () => movementFilter === "all" ? movements : movements.filter((movement) => movement.movementKind === movementFilter),
    [movements, movementFilter],
  );
  const filteredParts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ru");
    return [...parts].filter((part) => !term || `${part.name} ${part.articleNumber}`.toLocaleLowerCase("ru").includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [parts, search]);
  const availableParts = parts.filter((part) => part.quantity > 0).length;
  const totalValue = parts.reduce((sum, part) => sum + part.quantity * part.averageUnitCost, 0);
  const canReceive = ["engineer", "chief_engineer", "storekeeper", "general_director"].includes(role);
  const canIssue = ["engineer", "chief_engineer", "general_director"].includes(role);
  const pending = receive.isPending || issue.isPending;
  const loading = stockQ.isLoading || movementsQ.isLoading;
  const failed = stockQ.isError ? stockQ : movementsQ.isError ? movementsQ : null;
  const refreshAll = () => { void stockQ.refetch(); void movementsQ.refetch(); };

  const invalidateWarehouse = async () => Promise.all([
    qc.invalidateQueries({ queryKey: [getListEngineeringSparePartsQueryKey()[0]] }),
    qc.invalidateQueries({ queryKey: [getListEngineeringSparePartMovementsQueryKey()[0]] }),
    qc.invalidateQueries({ queryKey: [getListRepairExpensesQueryKey()[0]] }),
    qc.invalidateQueries({ queryKey: [getListEngineeringRepairsQueryKey()[0]] }),
  ]);

  const openReceipt = () => {
    setReceipt(initialReceipt()); setErrors({}); setSaveError(""); setDrawer("receipt"); setNotice("");
  };
  const openIssue = (part?: SparePart) => {
    setIssueForm(initialIssue(part?.id ?? null)); setErrors({}); setSaveError(""); setDrawer("issue"); setNotice("");
  };
  const closeDrawer = () => { if (!pending) setDrawer(null); };

  const submitReceipt = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const quantity = decimal(receipt.quantity);
    const unitPrice = decimal(receipt.unitPrice);
    if (!receipt.name.trim()) next.name = "Укажите наименование запчасти";
    if (receipt.name.trim().length > 200) next.name = "Не более 200 символов";
    if (receipt.articleNumber.trim().length > 100) next.articleNumber = "Не более 100 символов";
    if (!receipt.unit.trim()) next.unit = "Укажите единицу измерения";
    if (!amountInput.test(receipt.quantity) || quantity <= 0 || quantity > 1000000) next.quantity = "Укажите количество больше нуля";
    if (!priceInput.test(receipt.unitPrice) || unitPrice < 0 || unitPrice > 1e12) next.unitPrice = "Укажите цену от 0 до 1 000 000 000 000";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.occurredOn)) next.occurredOn = "Укажите дату поступления";
    if (!receipt.invoiceNumber.trim()) next.invoiceNumber = "Укажите номер накладной";
    if (receipt.invoiceNumber.trim().length > 100) next.invoiceNumber = "Не более 100 символов";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.invoiceDate)) next.invoiceDate = "Укажите дату накладной";
    if (receipt.supplier.trim().length > 200) next.supplier = "Не более 200 символов";
    if (receipt.description.length > 1000) next.description = "Не более 1000 символов";
    setErrors(next); setSaveError("");
    if (Object.keys(next).length) return;
    try {
      await receive.mutateAsync({ data: {
        requestId: receipt.requestId, name: receipt.name.trim(), articleNumber: receipt.articleNumber.trim(),
        unit: receipt.unit.trim(), quantity, unitPrice, occurredOn: receipt.occurredOn,
        invoiceNumber: receipt.invoiceNumber.trim(), invoiceDate: receipt.invoiceDate,
        supplier: receipt.supplier.trim(), description: receipt.description.trim(),
      } });
      await invalidateWarehouse();
      setNotice(`Поступление «${receipt.name.trim()}» по накладной ${receipt.invoiceNumber.trim()} зарегистрировано.`);
      setDrawer(null);
    } catch (err) { setSaveError(errorInfo(err).message); }
  };

  const submitIssue = async (event: FormEvent) => {
    event.preventDefault();
    const selected = parts.find((part) => part.id === issueForm.sparePartId);
    const quantity = decimal(issueForm.quantity);
    const next: Record<string, string> = {};
    if (!selected) next.sparePartId = "Выберите запчасть";
    if (!issueForm.fleetId) next.fleetId = "Выберите технику из справочника";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueForm.occurredOn)) next.occurredOn = "Укажите дату выдачи";
    if (!amountInput.test(issueForm.quantity) || quantity <= 0) next.quantity = "Укажите количество больше нуля";
    else if (selected && quantity > selected.quantity) next.quantity = `Доступно только ${fmt.format(selected.quantity)} ${selected.unit}`;
    if (issueForm.description.length > 1000) next.description = "Не более 1000 символов";
    setErrors(next); setSaveError("");
    if (Object.keys(next).length || !selected || !issueForm.fleetId) return;
    try {
      await issue.mutateAsync({ data: {
        requestId: issueForm.requestId, sparePartId: selected.id, fleetId: issueForm.fleetId,
        category: issueForm.category, quantity, occurredOn: issueForm.occurredOn, description: issueForm.description.trim(),
      } });
      await invalidateWarehouse();
      setNotice(`${fmt.format(quantity)} ${selected.unit} «${selected.name}» выдано технике ${fleetById.get(issueForm.fleetId) ? fleetLabel(fleetById.get(issueForm.fleetId)!) : `№${issueForm.fleetId}`}.`);
      setDrawer(null);
    } catch (err) { setSaveError(errorInfo(err).message); }
  };

  const partLabel = (part: SparePart) => `${part.name}${part.articleNumber ? ` · ${part.articleNumber}` : ""}`;
  const machineLabel = (id: number | null) => {
    if (id === null) return "—";
    const machine = fleetById.get(id);
    return machine ? fleetLabel(machine) : `Техника №${id}`;
  };

  return (
    <section className="space-y-4" data-testid="engineering-spare-parts" data-role={role}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Инженерная служба · материальный учёт</p>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.045em]">Склад запчастей</h2>
          <p className="mt-1 text-xs text-muted-foreground">Поступления по накладным и точная выдача на технику</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReceive && <button type="button" className="button button-secondary" onClick={openReceipt} data-testid="button-spare-part-receipt">
            <ArrowDownToLine size={14} />Приход по накладной
          </button>}
          {canIssue && <button type="button" className="button button-primary" onClick={() => openIssue()} disabled={!parts.some((part) => part.quantity > 0) || fleet.length === 0} data-testid="button-spare-part-issue">
            <ArrowUpFromLine size={14} />Выдать на технику
          </button>}
        </div>
      </header>

      {notice && <div className="notice-banner" role="status" data-testid="text-spare-parts-notice">{notice}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="surface-card p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Позиций на складе</p><p className="mt-1 font-mono text-xl font-bold">{parts.length}</p></div>
        <div className="surface-card p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Позиции в наличии</p><p className="mt-1 font-mono text-xl font-bold">{availableParts}</p></div>
        <div className="surface-card col-span-2 p-3.5 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Учётная стоимость</p><p className="mt-1 font-mono text-xl font-bold">{money(totalValue)}</p></div>
      </div>

      <nav className="flex flex-col gap-2 border-b border-border sm:flex-row sm:items-center sm:justify-between" aria-label="Раздел склада">
        <div className="flex gap-1" role="tablist">
          <button type="button" role="tab" aria-selected={view === "stock"} onClick={() => setView("stock")} className={cx("border-b-2 px-3 py-2 text-xs font-bold", view === "stock" ? "border-[hsl(203_87%_33%)] text-foreground" : "border-transparent text-muted-foreground")} data-testid="tab-spare-parts-stock"><Boxes size={14} className="mr-1.5 inline" />Остатки</button>
          <button type="button" role="tab" aria-selected={view === "history"} onClick={() => setView("history")} className={cx("border-b-2 px-3 py-2 text-xs font-bold", view === "history" ? "border-[hsl(203_87%_33%)] text-foreground" : "border-transparent text-muted-foreground")} data-testid="tab-spare-parts-history"><History size={14} className="mr-1.5 inline" />История движений</button>
        </div>
        <button type="button" className="button button-ghost !min-h-[32px] self-start !px-2 text-[11px]" onClick={refreshAll} disabled={stockQ.isFetching || movementsQ.isFetching} data-testid="button-spare-parts-refresh">
          <RefreshCw size={12} className={cx((stockQ.isFetching || movementsQ.isFetching) && "animate-spin")} />Обновить
        </button>
      </nav>

      {loading ? (
        <div className="surface-card space-y-3 p-4" data-testid="status-spare-parts-loading">
          <div className="skeleton h-9 rounded-lg" /><div className="skeleton h-12 rounded-lg" /><div className="skeleton h-12 rounded-lg" />
        </div>
      ) : failed ? (
        <div className="surface-card"><SectionError text={errorInfo(failed.error).message} onRetry={refreshAll} testId="status-spare-parts-error" /></div>
      ) : view === "stock" ? (
        <section className="surface-card overflow-hidden" aria-label="Текущие остатки">
          <div className="flex flex-col gap-2 border-b border-border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div><h3 className="text-sm font-bold">Текущие остатки</h3><p className="text-[11px] text-muted-foreground">Стоимость по средневзвешенной цене прихода</p></div>
            <label className="relative block sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="text-input !min-h-[34px] !pl-8" type="search" placeholder="Наименование или артикул" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Поиск запчастей" data-testid="input-spare-parts-search" />
            </label>
          </div>
          {filteredParts.length === 0 ? (
            <div className="empty-state px-4 py-10" data-testid="status-spare-parts-empty"><div className="empty-icon"><PackageCheck size={19} /></div><h3 className="mt-3 text-sm font-bold">{parts.length ? "Ничего не найдено" : "Склад пока пуст"}</h3><p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{parts.length ? "Измените запрос поиска." : "Зарегистрируйте поступление по накладной, чтобы сформировать остатки."}</p></div>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(90px,.7fr)_minmax(90px,.7fr)_minmax(115px,.8fr)_auto] gap-3 border-b border-border px-4 py-2 text-[9px] font-bold uppercase tracking-[.1em] text-muted-foreground md:grid">
                <span>Запчасть</span><span>Ед.</span><span className="text-right">Доступно</span><span className="text-right">Цена / ед.</span><span />
              </div>
              <ul className="divide-y divide-border/70">
                {filteredParts.map((part) => (
                  <li key={part.id} className="grid gap-2 px-3 py-3 sm:px-4 md:grid-cols-[minmax(0,1.7fr)_minmax(90px,.7fr)_minmax(90px,.7fr)_minmax(115px,.8fr)_auto] md:items-center md:gap-3" data-testid={`row-spare-part-${part.id}`}>
                    <div className="min-w-0"><p className="truncate text-sm font-bold">{part.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{part.articleNumber ? `Артикул ${part.articleNumber}` : "Артикул не указан"}</p></div>
                    <div className="text-[11px] text-muted-foreground md:text-foreground">{part.unit}</div>
                    <div className="flex items-baseline justify-between md:justify-end"><span className="text-[10px] text-muted-foreground md:hidden">Остаток</span><span className={cx("font-mono text-sm font-bold", part.quantity <= 0 && "text-muted-foreground")} data-testid={`text-spare-part-quantity-${part.id}`}>{fmt.format(part.quantity)}</span></div>
                    <div className="flex items-baseline justify-between md:justify-end"><span className="text-[10px] text-muted-foreground md:hidden">Средняя цена</span><span className="font-mono text-xs">{money(part.averageUnitCost)}</span></div>
                     {canIssue && <button type="button" className="button button-secondary !min-h-[32px] w-full !px-2.5 text-[11px] md:w-auto" onClick={() => openIssue(part)} disabled={part.quantity <= 0 || fleet.length === 0} data-testid={`button-issue-spare-part-${part.id}`}><ArrowUpFromLine size={13} />Выдать</button>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <section className="surface-card overflow-hidden" aria-label="История движений">
          <div className="flex flex-col gap-2 border-b border-border bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="text-sm font-bold">История движений</h3><p className="text-[11px] text-muted-foreground">Приходы по накладным и выдачи на технику · новые сверху</p></div>
            <div className="inline-flex self-start rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Фильтр движений">
              {([["all", "Все"], ["receipt", "Приход"], ["issue", "Списано"]] as const).map(([kind, label]) => (
                <button key={kind} type="button" aria-pressed={movementFilter === kind} onClick={() => setMovementFilter(kind)}
                  className={cx("rounded-md px-2.5 py-1 text-[10px] font-bold", movementFilter === kind ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                  data-testid={`filter-spare-part-movements-${kind}`}>{label}</button>
              ))}
            </div>
          </div>
          {filteredMovements.length === 0 ? (
            <div className="empty-state px-4 py-10" data-testid="status-spare-parts-history-empty"><div className="empty-icon"><History size={19} /></div><h3 className="mt-3 text-sm font-bold">{movements.length ? "Записей в этой категории пока нет" : "Движений пока нет"}</h3><p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{movements.length ? "Выберите другую категорию движения." : "Каждый зарегистрированный приход и выдача появятся в этом журнале."}</p></div>
          ) : (
            <ul className="divide-y divide-border/70">
              {filteredMovements.map((movement) => <MovementRow key={movement.id} movement={movement} machineLabel={machineLabel} />)}
            </ul>
          )}
        </section>
      )}

      {drawer === "receipt" && (
        <form onSubmit={submitReceipt} noValidate>
          <Drawer title="Приход запчастей" eyebrow="Склад · регистрация по документу" onClose={closeDrawer} testId="form-spare-part-receipt"
            footer={<><button type="button" className="button button-ghost" onClick={closeDrawer} disabled={pending}>Отмена</button><button type="submit" className="button button-primary" disabled={pending} data-testid="button-save-spare-part-receipt">{pending ? "Сохраняем..." : "Зарегистрировать приход"}</button></>}>
            {saveError && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold leading-5 text-destructive" role="alert" data-testid="text-spare-part-receipt-error">{saveError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Наименование *" error={errors.name} htmlFor="sp-receipt-name" wide><input id="sp-receipt-name" className="text-input" maxLength={200} autoFocus value={receipt.name} onChange={(e) => setReceipt({ ...receipt, name: e.target.value })} data-testid="input-spare-part-name" /></Field>
              <Field label="Артикул" error={errors.articleNumber} htmlFor="sp-receipt-article"><input id="sp-receipt-article" className="text-input" maxLength={100} value={receipt.articleNumber} onChange={(e) => setReceipt({ ...receipt, articleNumber: e.target.value })} data-testid="input-spare-part-article" /></Field>
              <Field label="Единица измерения *" error={errors.unit} htmlFor="sp-receipt-unit"><input id="sp-receipt-unit" className="text-input" maxLength={40} placeholder="шт., л, комплект" value={receipt.unit} onChange={(e) => setReceipt({ ...receipt, unit: e.target.value })} data-testid="input-spare-part-unit" /></Field>
              <Field label="Количество *" error={errors.quantity} htmlFor="sp-receipt-quantity"><input id="sp-receipt-quantity" className="text-input font-mono" inputMode="decimal" value={receipt.quantity} onChange={(e) => setReceipt({ ...receipt, quantity: e.target.value })} data-testid="input-spare-part-receipt-quantity" /></Field>
              <Field label="Цена за единицу, ₸ *" error={errors.unitPrice} htmlFor="sp-receipt-price"><input id="sp-receipt-price" className="text-input font-mono" inputMode="decimal" value={receipt.unitPrice} onChange={(e) => setReceipt({ ...receipt, unitPrice: e.target.value })} data-testid="input-spare-part-unit-price" /></Field>
              <Field label="Дата поступления *" error={errors.occurredOn} htmlFor="sp-receipt-date"><input id="sp-receipt-date" type="date" className="text-input" value={receipt.occurredOn} onChange={(e) => setReceipt({ ...receipt, occurredOn: e.target.value })} data-testid="input-spare-part-receipt-date" /></Field>
              <Field label="Номер накладной *" error={errors.invoiceNumber} htmlFor="sp-receipt-invoice"><input id="sp-receipt-invoice" className="text-input" maxLength={100} value={receipt.invoiceNumber} onChange={(e) => setReceipt({ ...receipt, invoiceNumber: e.target.value })} data-testid="input-spare-part-invoice-number" /></Field>
              <Field label="Дата накладной *" error={errors.invoiceDate} htmlFor="sp-receipt-invoice-date"><input id="sp-receipt-invoice-date" type="date" className="text-input" value={receipt.invoiceDate} onChange={(e) => setReceipt({ ...receipt, invoiceDate: e.target.value })} data-testid="input-spare-part-invoice-date" /></Field>
              <Field label="Поставщик" error={errors.supplier} htmlFor="sp-receipt-supplier"><input id="sp-receipt-supplier" className="text-input" maxLength={200} value={receipt.supplier} onChange={(e) => setReceipt({ ...receipt, supplier: e.target.value })} data-testid="input-spare-part-supplier" /></Field>
              <Field label="Примечание" error={errors.description} htmlFor="sp-receipt-description" wide><textarea id="sp-receipt-description" className="text-input min-h-20" maxLength={1000} value={receipt.description} onChange={(e) => setReceipt({ ...receipt, description: e.target.value })} data-testid="input-spare-part-receipt-description" /></Field>
            </div>
          </Drawer>
        </form>
      )}

      {drawer === "issue" && (
        <form onSubmit={submitIssue} noValidate>
          <Drawer title="Выдача на технику" eyebrow="Склад · движение и затраты ремонта" onClose={closeDrawer} testId="form-spare-part-issue"
            footer={<><button type="button" className="button button-ghost" onClick={closeDrawer} disabled={pending}>Отмена</button><button type="submit" className="button button-primary" disabled={pending || parts.length === 0 || fleet.length === 0} data-testid="button-save-spare-part-issue">{pending ? "Сохраняем..." : "Подтвердить выдачу"}</button></>}>
            {saveError && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold leading-5 text-destructive" role="alert" data-testid="text-spare-part-issue-error">{saveError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Запчасть *" error={errors.sparePartId} htmlFor="sp-issue-part" wide>
                <select id="sp-issue-part" className={cx("text-input", errors.sparePartId && "!border-destructive")} value={issueForm.sparePartId ?? ""} onChange={(e) => setIssueForm({ ...issueForm, sparePartId: e.target.value ? Number(e.target.value) : null })} data-testid="select-spare-part-issue-part">
                  <option value="">Выберите запчасть</option>{parts.filter((part) => part.quantity > 0).map((part) => <option key={part.id} value={part.id}>{partLabel(part)} — {fmt.format(part.quantity)} {part.unit} · {money(part.averageUnitCost)}/ед.</option>)}
                </select>
              </Field>
              {issueForm.sparePartId !== null && parts.find((part) => part.id === issueForm.sparePartId) && <p className="rounded-lg bg-muted/50 p-3 text-[11px] leading-5 text-muted-foreground sm:col-span-2">Доступно: <strong className="font-mono text-foreground">{fmt.format(parts.find((part) => part.id === issueForm.sparePartId)!.quantity)} {parts.find((part) => part.id === issueForm.sparePartId)!.unit}</strong>. Количество сверх остатка не допускается.</p>}
              <Field label="Вид ремонта *" wide>
                <div className="grid grid-cols-2 gap-2">
                  {([["current", "Текущий ремонт"], ["capital", "Капитальный ремонт"]] as const).map(([category, label]) => (
                    <label key={category} className={cx("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors", issueForm.category === category ? "border-[hsl(203_87%_33%)] bg-[hsl(203_87%_33%/.08)] text-foreground" : "border-border text-muted-foreground hover:bg-muted/40")}>
                      <input type="radio" name="spare-part-repair-category" value={category} checked={issueForm.category === category} onChange={() => setIssueForm({ ...issueForm, category })} data-testid={`radio-spare-part-category-${category}`} />
                      {label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Техника *" error={errors.fleetId} htmlFor="sp-issue-fleet" wide><select id="sp-issue-fleet" className={cx("text-input", errors.fleetId && "!border-destructive")} value={issueForm.fleetId ?? ""} onChange={(e) => setIssueForm({ ...issueForm, fleetId: e.target.value ? Number(e.target.value) : null })} data-testid="select-spare-part-issue-fleet"><option value="">Выберите технику из справочника</option>{fleet.map((machine) => <option key={machine.id} value={machine.id}>{fleetLabel(machine)} — {machine.unit}</option>)}</select></Field>
              <Field label="Дата выдачи *" error={errors.occurredOn} htmlFor="sp-issue-date"><input id="sp-issue-date" type="date" className="text-input" value={issueForm.occurredOn} onChange={(e) => setIssueForm({ ...issueForm, occurredOn: e.target.value })} data-testid="input-spare-part-issue-date" /></Field>
              <Field label="Количество *" error={errors.quantity} htmlFor="sp-issue-quantity"><input id="sp-issue-quantity" type="number" min="0.001" step="0.001" max={parts.find((part) => part.id === issueForm.sparePartId)?.quantity} className="text-input font-mono" inputMode="decimal" value={issueForm.quantity} onChange={(e) => setIssueForm({ ...issueForm, quantity: e.target.value })} data-testid="input-spare-part-issue-quantity" /></Field>
              <Field label="Примечание" error={errors.description} htmlFor="sp-issue-description" wide><textarea id="sp-issue-description" className="text-input min-h-20" maxLength={1000} value={issueForm.description} onChange={(e) => setIssueForm({ ...issueForm, description: e.target.value })} data-testid="input-spare-part-issue-description" /></Field>
            </div>
            <p className="rounded-lg border border-[hsl(203_50%_75%/.55)] bg-[hsl(203_65%_96%)] p-3 text-[11px] leading-5 text-[hsl(205_35%_32%)]">Выдача спишет только указанное количество. Стоимость автоматически попадёт в затраты выбранной техники.</p>
          </Drawer>
        </form>
      )}
    </section>
  );
}

function MovementRow({ movement, machineLabel }: { movement: SparePartMovement; machineLabel: (id: number | null) => string }) {
  const receipt = movement.movementKind === "receipt";
  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-3 sm:px-4" data-testid={`row-spare-part-movement-${movement.id}`}>
      <div className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", receipt ? "bg-[hsl(158_40%_91%)] text-[hsl(158_42%_29%)]" : "bg-[hsl(203_50%_92%)] text-[hsl(203_60%_32%)]")}>
        {receipt ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-bold">{movement.sparePartName}</p>
          {movement.articleNumber && <span className="text-[10px] text-muted-foreground">{movement.articleNumber}</span>}
        </div>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
          {receipt ? <>Накладная {movement.invoiceNumber || "—"}{movement.supplier ? ` · ${movement.supplier}` : ""}</> : <>Для {machineLabel(movement.fleetId)}</>}
          {!receipt && ` · ${movement.repairCategory === "capital" ? "Капитальный ремонт" : "Текущий ремонт"}`}
          {movement.description ? ` · ${movement.description}` : ""}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{dateFmt(movement.occurredOn)}{receipt && movement.invoiceDate ? ` · дата накладной ${dateFmt(movement.invoiceDate)}` : ""}</p>
      </div>
      <div className="text-right">
        <p className={cx("font-mono text-sm font-bold", receipt ? "text-[hsl(158_42%_29%)]" : "text-[hsl(203_60%_32%)]")}>{receipt ? "+" : "−"}{fmt.format(movement.quantity)} <span className="text-[10px] font-medium">{movement.unit}</span></p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{money(movement.amount)}</p>
      </div>
      <div className="hidden w-6 text-muted-foreground sm:block" title={receipt ? "Приход" : "Выдача"}><FileText size={13} /></div>
    </li>
  );
}
