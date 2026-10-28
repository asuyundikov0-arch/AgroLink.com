import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Check,
  ClipboardList,
  PackageCheck,
  Plus,
  RotateCcw,
  Send,
  Truck,
  X,
} from "lucide-react";
import {
  type SparePartRequest,
  type SparePartRequestItem,
  type FleetEquipment,
  getListFleetEquipmentQueryKey,
  getListEngineeringRepairsQueryKey,
  getListEngineeringSparePartMovementsQueryKey,
  getListEngineeringSparePartsQueryKey,
  getListRepairExpensesQueryKey,
  getListSparePartRequestsQueryKey,
  useCreateEngineeringSparePartReceipt,
  useCreateSparePartRequest,
  useListFleetEquipment,
  useListSparePartRequests,
  useResubmitSparePartRequestItem,
  useReviewSparePartRequestByChief,
  useReviewSparePartRequestByDirector,
} from "@workspace/api-client-react";
import { businessToday, errorInfo, fleetLabel, money } from "./repairs/shared";

type Role = "engineer" | "chief_engineer" | "general_director" | "storekeeper";
type RequestLineDraft = { name: string; articleNumber: string; unit: string; quantity: string; fleetId: string };
type ChiefDecisionDraft = { decision: "" | "approved" | "returned"; unitPrice: string; comment: string };
type DirectorDecisionDraft = { decision: "" | "approved" | "rejected"; comment: string };
type ReceiptDraft = {
  quantity: string;
  unitPrice: string;
  occurredOn: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplier: string;
};

const emptyLine = (): RequestLineDraft => ({ name: "", articleNumber: "", unit: "шт.", quantity: "", fleetId: "" });
const numericValue = (value: string) => Number(value.trim().replace(/\s/g, "").replace(",", "."));
const isQuantity = (value: number) => Number.isFinite(value) && value > 0 && value <= 1_000_000 && Number(value.toFixed(3)) === value;
const isPrice = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1_000_000_000_000 && Number(value.toFixed(2)) === value;
const when = (value: string) => new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
const requestStatusLabel: Record<SparePartRequest["status"], string> = {
  chief_review: "Проверяет главный инженер",
  director_review: "На согласовании у директора",
  awaiting_payment: "Ожидает оплаты в экономическом блоке",
  awaiting_delivery: "Ожидается поступление",
  returned_to_engineer: "Возвращена инженеру",
  completed: "Получена на склад",
  rejected: "Отклонена",
};
const itemStatusLabel: Record<SparePartRequestItem["status"], string> = {
  chief_review: "На оценке у главного инженера",
  director_review: "На согласовании у генерального директора",
  returned_to_engineer: "Возвращена инженеру на исправление",
  awaiting_payment: "Одобрена · ожидает оплаты",
  awaiting_delivery: "Ожидается поставка",
  received: "Получена на склад",
  rejected: "Отклонена",
};

function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "blue" | "green" | "amber" | "red" }) {
  const tones = {
    muted: "border-border bg-muted text-muted-foreground",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-teal-200 bg-teal-50 text-teal-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${tones[tone]}`}>{children}</span>;
}

function itemTone(status: SparePartRequestItem["status"]): "muted" | "blue" | "green" | "amber" | "red" {
  if (status === "received") return "green";
  if (status === "rejected") return "red";
  if (status === "returned_to_engineer") return "amber";
  if (status === "awaiting_payment") return "amber";
  if (status === "awaiting_delivery") return "blue";
  return "muted";
}

function ItemSummary({ item }: { item: SparePartRequestItem }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold">{item.name}</p>
          {item.articleNumber && <span className="text-[10px] text-muted-foreground">№ {item.articleNumber}</span>}
          <Badge tone={itemTone(item.status)}>{itemStatusLabel[item.status]}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.fleetKind}{item.registrationNumber ? ` · ${item.registrationNumber}` : ""} · {item.quantity} {item.unit}
          {item.unitPrice !== null ? ` · ${money(item.unitPrice)}/ед.` : ""}
          {item.receivedQuantity > 0 ? ` · получено ${item.receivedQuantity} из ${item.quantity} ${item.unit}` : ""}
        </p>
        {item.chiefComment && <p className="mt-1 text-xs text-amber-800">Главный инженер: {item.chiefComment}</p>}
        {item.directorComment && <p className="mt-1 text-xs text-muted-foreground">Генеральный директор: {item.directorComment}</p>}
        {item.paymentStatus === "paid" && item.paidByName && <p className="mt-1 text-xs font-medium text-teal-800">Оплатил: {item.paidByName}{item.paidAt ? ` · ${when(item.paidAt)}` : ""}</p>}
        {item.status === "received" && item.receivedByName && <p className="mt-1 text-xs font-medium text-teal-800">Оприходовал: {item.receivedByName}{item.receivedAt ? ` · ${when(item.receivedAt)}` : ""}</p>}
      </div>
      {item.paymentAmount !== null && <p className="shrink-0 font-mono text-xs font-bold">{money(item.paymentAmount)}</p>}
    </div>
  );
}

function RequestFrame({ request, children }: { request: SparePartRequest; children: ReactNode }) {
  return (
    <article className="surface-card space-y-4 p-4 sm:p-5" data-testid={`card-spare-part-request-${request.id}`}>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold">Заявка №{request.id}</h3>
            <Badge tone={request.status === "completed" ? "green" : request.status === "rejected" ? "red" : "blue"}>{requestStatusLabel[request.status]}</Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{request.requesterName} · {request.department} · {when(request.createdAt)}</p>
        </div>
        <span className="text-[10px] text-muted-foreground">{request.items.length} поз.</span>
      </header>
      {children}
    </article>
  );
}

export default function SparePartRequests({ role }: { role: Role }) {
  const queryClient = useQueryClient();
  const requestsQuery = useListSparePartRequests({
    query: { queryKey: getListSparePartRequestsQueryKey(), refetchInterval: 15000 },
  });
  const fleetQuery = useListFleetEquipment({
    query: { queryKey: getListFleetEquipmentQueryKey(), enabled: role === "engineer", refetchInterval: 30000 },
  });
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const fleet = fleetQuery.data ?? [];
  const activeWarehouseRequests = requests.reduce((total, request) =>
    total + request.items.filter((item) => item.status === "awaiting_delivery").length, 0);
  const invalidateRequests = () => queryClient.invalidateQueries({ queryKey: getListSparePartRequestsQueryKey() });
  const title = role === "engineer" ? "Мои заявки на запчасти"
    : role === "chief_engineer" ? "Оценка заявок"
      : role === "general_director" ? "Согласование закупки"
        : "Ожидаемые поступления";

  return (
    <section className="space-y-4" data-testid="engineering-spare-part-requests" data-role={role}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Инженерная служба · согласование закупок</p>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.045em]">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Заявки обновляются автоматически. После согласования директора позиция попадает в реестр платежей генерального директора; склад получает её на приёмку после отметки об оплате.
          </p>
        </div>
        {role === "storekeeper" && <Badge tone={activeWarehouseRequests > 0 ? "amber" : "muted"}><BellRing size={12} className="mr-1.5" />Активные заявки: {activeWarehouseRequests}</Badge>}
      </header>

      {role === "engineer" && <NewRequestForm fleet={fleet} fleetLoading={fleetQuery.isLoading} fleetError={fleetQuery.isError} onCreated={invalidateRequests} />}
      {requestsQuery.isLoading ? <div className="surface-card space-y-3 p-4" data-testid="status-spare-part-requests-loading"><div className="skeleton h-8 rounded-lg" /><div className="skeleton h-20 rounded-lg" /></div>
        : requestsQuery.isError ? <div className="surface-card p-5 text-sm text-destructive" role="alert">{errorInfo(requestsQuery.error).message}<button type="button" className="button button-secondary ml-3 text-xs" onClick={() => void requestsQuery.refetch()}>Повторить</button></div>
          : requests.length === 0 ? <div className="surface-card flex flex-col items-center px-5 py-12 text-center" data-testid="status-spare-part-requests-empty"><ClipboardList size={24} className="text-muted-foreground" /><h3 className="mt-3 text-sm font-bold">Заявок пока нет</h3><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Новые заявки появятся здесь после отправки инженером.</p></div>
            : <div className="space-y-3">{requests.map((request) => {
              const activeItems = request.items.filter((item) => item.status === "chief_review");
              const directorItems = request.items.filter((item) => item.status === "director_review");
              return <RequestFrame key={request.id} request={request}>
                {role === "engineer" && <EngineerRequest request={request} fleet={fleet} onChanged={invalidateRequests} />}
                {role === "chief_engineer" && (activeItems.length > 0
                  ? <ChiefReview request={request} items={activeItems} onChanged={invalidateRequests} />
                  : <div className="space-y-2">{request.items.map((item) => <ItemSummary item={item} key={item.id} />)}</div>)}
                {role === "general_director" && (directorItems.length > 0
                  ? <DirectorReview request={request} items={directorItems} onChanged={invalidateRequests} />
                  : <div className="space-y-2">{request.items.map((item) => <ItemSummary item={item} key={item.id} />)}</div>)}
                {role === "storekeeper" && <StorekeeperRequest request={request} onChanged={invalidateRequests} />}
              </RequestFrame>;
            })}</div>}
    </section>
  );
}

function NewRequestForm({ fleet, fleetLoading, fleetError, onCreated }: {
  fleet: FleetEquipment[];
  fleetLoading: boolean;
  fleetError: boolean;
  onCreated: () => void;
}) {
  const create = useCreateSparePartRequest();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<RequestLineDraft[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const update = (index: number, value: Partial<RequestLineDraft>) => setLines((current) =>
    current.map((line, lineIndex) => lineIndex === index ? { ...line, ...value } : line));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(""); setNotice("");
    const items = lines.map((line) => ({
      name: line.name.trim(),
      articleNumber: line.articleNumber.trim(),
      unit: line.unit.trim(),
      quantity: numericValue(line.quantity),
      fleetId: Number(line.fleetId),
    }));
    if (items.some((item) => !item.name || !item.unit || !isQuantity(item.quantity) || !item.fleetId)) {
      setError("Заполните наименование, единицу измерения, технику и корректное количество для каждой позиции.");
      return;
    }
    try {
      await create.mutateAsync({ data: { requestId: crypto.randomUUID(), items } });
      onCreated();
      setLines([emptyLine()]);
      setOpen(false);
       setNotice("Заявка отправлена главному инженеру. После согласования директора одобренные позиции попадут в реестр платежей.");
    } catch (err) {
      setError(errorInfo(err).message);
    }
  };
  return (
    <section className="surface-card p-4 sm:p-5">
      {notice && <div className="notice-banner mb-4" role="status">{notice}</div>}
      {!open ? <button type="button" className="button button-primary" onClick={() => { setOpen(true); setNotice(""); }} data-testid="button-new-spare-part-request"><Plus size={15} />Подать заявку на покупку</button>
        : <form onSubmit={submit} className="space-y-4" data-testid="form-new-spare-part-request">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold">Новая заявка</h3><p className="mt-1 text-xs text-muted-foreground">Добавьте позиции, для каждой выберите технику и количество.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Закрыть форму" disabled={create.isPending}><X size={16} /></button></div>
          {fleetError && <p className="text-xs text-destructive">Не удалось загрузить справочник техники. Обновите страницу.</p>}
          {fleet.length === 0 && !fleetLoading && <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Сначала добавьте технику в справочник.</p>}
          {lines.map((line, index) => <div key={index} className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_.65fr_.65fr_auto] lg:items-end" data-testid={`row-new-request-item-${index}`}>
            <label className="form-label">Название запчасти *<input className="text-input mt-1.5" maxLength={200} value={line.name} onChange={(event) => update(index, { name: event.target.value })} required data-testid={`input-request-part-name-${index}`} /></label>
            <label className="form-label">Каталожный номер<input className="text-input mt-1.5" maxLength={100} value={line.articleNumber} onChange={(event) => update(index, { articleNumber: event.target.value })} data-testid={`input-request-part-article-${index}`} /></label>
            <label className="form-label">На какую технику *<select className="text-input mt-1.5" value={line.fleetId} onChange={(event) => update(index, { fleetId: event.target.value })} required disabled={fleetLoading || fleet.length === 0} data-testid={`select-request-part-fleet-${index}`}><option value="">Выберите технику</option>{fleet.map((machine) => <option key={machine.id} value={machine.id}>{fleetLabel(machine)} · {machine.unit}</option>)}</select></label>
            <label className="form-label">Количество *<input className="text-input mt-1.5" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} required data-testid={`input-request-part-quantity-${index}`} /></label>
            <label className="form-label">Ед. изм. *<input className="text-input mt-1.5" maxLength={40} value={line.unit} onChange={(event) => update(index, { unit: event.target.value })} required data-testid={`input-request-part-unit-${index}`} /></label>
            <button type="button" className="button button-ghost !min-h-10 !px-2 text-xs" onClick={() => setLines((current) => current.length > 1 ? current.filter((_, lineIndex) => lineIndex !== index) : [emptyLine()])} aria-label="Удалить позицию" disabled={create.isPending}><X size={15} /></button>
          </div>)}
          {error && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="text-new-spare-part-request-error">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button button-secondary text-xs" onClick={() => setLines((current) => current.length < 30 ? [...current, emptyLine()] : current)} disabled={lines.length >= 30 || create.isPending}><Plus size={14} />Добавить позицию</button>
            <button type="submit" className="button button-primary text-xs" disabled={create.isPending || fleetLoading || fleet.length === 0} data-testid="button-submit-spare-part-request"><Send size={14} />{create.isPending ? "Отправляем…" : "Отправить заявку"}</button>
          </div>
        </form>}
    </section>
  );
}

function EngineerRequest({ request, fleet, onChanged }: {
  request: SparePartRequest;
  fleet: FleetEquipment[];
  onChanged: () => void;
}) {
  return <div className="space-y-2">
    {request.items.map((item) => item.status === "returned_to_engineer"
      ? <ResubmitItem key={item.id} request={request} item={item} fleet={fleet} onChanged={onChanged} />
      : <ItemSummary item={item} key={item.id} />)}
  </div>;
}

function ResubmitItem({ request, item, fleet, onChanged }: {
  request: SparePartRequest;
  item: SparePartRequestItem;
  fleet: FleetEquipment[];
  onChanged: () => void;
}) {
  const mutation = useResubmitSparePartRequestItem();
  const [draft, setDraft] = useState<RequestLineDraft>({
    name: item.name, articleNumber: item.articleNumber, unit: item.unit,
    quantity: String(item.quantity), fleetId: String(item.fleetId),
  });
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const quantity = numericValue(draft.quantity);
    if (!draft.name.trim() || !draft.unit.trim() || !isQuantity(quantity) || !Number(draft.fleetId)) {
      setError("Проверьте обязательные поля и количество.");
      return;
    }
    try {
      await mutation.mutateAsync({
        id: request.id,
        itemId: item.id,
        data: { name: draft.name.trim(), articleNumber: draft.articleNumber.trim(), unit: draft.unit.trim(), quantity, fleetId: Number(draft.fleetId) },
      });
      onChanged();
    } catch (err) { setError(errorInfo(err).message); }
  };
  return <form onSubmit={submit} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3" data-testid={`form-resubmit-request-item-${item.id}`}>
    <div className="mb-3"><Badge tone="amber">Требуется исправление</Badge><p className="mt-2 text-xs text-amber-900">Причина: {item.chiefComment || "Главный инженер вернул позицию на доработку."}</p></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <label className="form-label">Название<input className="text-input mt-1" maxLength={200} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
      <label className="form-label">Каталожный номер<input className="text-input mt-1" maxLength={100} value={draft.articleNumber} onChange={(event) => setDraft({ ...draft, articleNumber: event.target.value })} /></label>
      <label className="form-label">Техника<select className="text-input mt-1" value={draft.fleetId} onChange={(event) => setDraft({ ...draft, fleetId: event.target.value })} required>{fleet.map((machine) => <option key={machine.id} value={machine.id}>{fleetLabel(machine)}</option>)}</select></label>
      <label className="form-label">Количество<input className="text-input mt-1" type="number" min="0.001" step="0.001" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} required /></label>
      <label className="form-label">Ед. изм.<input className="text-input mt-1" maxLength={40} value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} required /></label>
    </div>
    {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
    <button type="submit" className="button button-primary mt-3 text-xs" disabled={mutation.isPending} data-testid={`button-resubmit-request-item-${item.id}`}><RotateCcw size={14} />{mutation.isPending ? "Отправляем…" : "Исправить и отправить повторно"}</button>
  </form>;
}

function ChiefReview({ request, items, onChanged }: {
  request: SparePartRequest;
  items: SparePartRequestItem[];
  onChanged: () => void;
}) {
  const mutation = useReviewSparePartRequestByChief();
  const [drafts, setDrafts] = useState<Record<number, ChiefDecisionDraft>>(() => Object.fromEntries(items.map((item) => [item.id, {
    decision: "", unitPrice: "", comment: "",
  }])));
  const [error, setError] = useState("");
  const update = (itemId: number, draft: Partial<ChiefDecisionDraft>) => setDrafts((current) => ({
    ...current, [itemId]: { ...current[itemId], ...draft },
  }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const decisions = items.map((item) => ({ itemId: item.id, ...drafts[item.id] }));
    if (decisions.some((decision) => !decision.decision
      || (decision.decision === "approved" && !isPrice(numericValue(decision.unitPrice)))
      || (decision.decision === "returned" && !decision.comment.trim()))) {
      setError("Для каждой позиции выберите решение; согласованным укажите цену, для возврата — причину.");
      return;
    }
    try {
      await mutation.mutateAsync({ id: request.id, data: { items: decisions.map((decision) => ({
        itemId: decision.itemId,
        decision: decision.decision as "approved" | "returned",
        unitPrice: decision.decision === "approved" ? numericValue(decision.unitPrice) : null,
        comment: decision.comment.trim(),
      })) } });
      onChanged();
    } catch (err) { setError(errorInfo(err).message); }
  };
  return <form onSubmit={submit} className="space-y-3" data-testid={`form-chief-review-request-${request.id}`}>
    {items.map((item) => <div key={item.id} className="rounded-xl border border-border p-3">
      <ItemSummary item={item} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="form-label">Решение по позиции<select className="text-input mt-1.5" value={drafts[item.id]?.decision ?? ""} onChange={(event) => update(item.id, { decision: event.target.value as ChiefDecisionDraft["decision"] })} required data-testid={`select-chief-request-decision-${item.id}`}><option value="">Выберите решение</option><option value="approved">Согласовать и передать директору</option><option value="returned">Вернуть инженеру</option></select></label>
        <label className="form-label">Цена за единицу, ₸{drafts[item.id]?.decision === "approved" ? " *" : ""}<input className="text-input mt-1.5" type="number" min="0" step="0.01" value={drafts[item.id]?.unitPrice ?? ""} onChange={(event) => update(item.id, { unitPrice: event.target.value })} disabled={drafts[item.id]?.decision !== "approved"} data-testid={`input-chief-request-price-${item.id}`} /></label>
        <label className="form-label sm:col-span-2">Комментарий{drafts[item.id]?.decision === "returned" ? " *" : ""}<textarea className="text-input mt-1.5 min-h-16" maxLength={1000} value={drafts[item.id]?.comment ?? ""} onChange={(event) => update(item.id, { comment: event.target.value })} data-testid={`input-chief-request-comment-${item.id}`} /></label>
      </div>
    </div>)}
    {error && <p className="text-xs font-semibold text-destructive" role="alert">{error}</p>}
    <button type="submit" className="button button-primary text-xs" disabled={mutation.isPending} data-testid={`button-chief-submit-request-${request.id}`}><Send size={14} />{mutation.isPending ? "Сохраняем…" : "Сохранить решения и отправить согласованные позиции директору"}</button>
  </form>;
}

function DirectorReview({ request, items, onChanged }: {
  request: SparePartRequest;
  items: SparePartRequestItem[];
  onChanged: () => void;
}) {
  const mutation = useReviewSparePartRequestByDirector();
  const [drafts, setDrafts] = useState<Record<number, DirectorDecisionDraft>>(() => Object.fromEntries(items.map((item) => [item.id, {
    decision: "", comment: "",
  }])));
  const [error, setError] = useState("");
  const update = (itemId: number, draft: Partial<DirectorDecisionDraft>) => setDrafts((current) => ({
    ...current, [itemId]: { ...current[itemId], ...draft },
  }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const decisions = items.map((item) => ({ itemId: item.id, ...drafts[item.id] }));
    if (decisions.some((decision) => !decision.decision || (decision.decision === "rejected" && !decision.comment.trim()))) {
      setError("Выберите решение для каждой позиции и укажите причину отказа.");
      return;
    }
    try {
      await mutation.mutateAsync({ id: request.id, data: { items: decisions.map((decision) => ({
        itemId: decision.itemId,
        decision: decision.decision as "approved" | "rejected",
        comment: decision.comment.trim(),
      })) } });
      onChanged();
    } catch (err) { setError(errorInfo(err).message); }
  };
  return <form onSubmit={submit} className="space-y-3" data-testid={`form-director-review-request-${request.id}`}>
    {items.map((item) => <div key={item.id} className="rounded-xl border border-border p-3">
      <ItemSummary item={item} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="form-label">Решение по закупке<select className="text-input mt-1.5" value={drafts[item.id]?.decision ?? ""} onChange={(event) => update(item.id, { decision: event.target.value as DirectorDecisionDraft["decision"] })} required data-testid={`select-director-request-decision-${item.id}`}><option value="">Выберите решение</option><option value="approved">Одобрить к покупке</option><option value="rejected">Отказать</option></select></label>
        <label className="form-label">Комментарий{drafts[item.id]?.decision === "rejected" ? " *" : ""}<input className="text-input mt-1.5" maxLength={1000} value={drafts[item.id]?.comment ?? ""} onChange={(event) => update(item.id, { comment: event.target.value })} data-testid={`input-director-request-comment-${item.id}`} /></label>
      </div>
    </div>)}
    {error && <p className="text-xs font-semibold text-destructive" role="alert">{error}</p>}
    <button type="submit" className="button button-primary text-xs" disabled={mutation.isPending} data-testid={`button-director-submit-request-${request.id}`}><Check size={14} />{mutation.isPending ? "Сохраняем…" : "Сохранить решения по позициям"}</button>
  </form>;
}

function StorekeeperRequest({ request, onChanged }: { request: SparePartRequest; onChanged: () => void }) {
  return <div className="space-y-2">
    {request.items.map((item) => item.status === "awaiting_delivery"
      ? <StorekeeperItem key={item.id} request={request} item={item} onChanged={onChanged} />
      : <ItemSummary key={item.id} item={item} />)}
  </div>;
}

function StorekeeperItem({ request, item, onChanged }: {
  request: SparePartRequest;
  item: SparePartRequestItem;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const receipt = useCreateEngineeringSparePartReceipt();
  const remaining = Math.max(0, item.quantity - item.receivedQuantity);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ReceiptDraft>({
    quantity: String(remaining),
    unitPrice: item.unitPrice === null ? "" : String(item.unitPrice),
    occurredOn: businessToday(),
    invoiceNumber: "",
    invoiceDate: businessToday(),
    supplier: "",
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const quantity = numericValue(draft.quantity);
    const unitPrice = numericValue(draft.unitPrice);
    if (!isQuantity(quantity) || quantity > remaining || !isPrice(unitPrice) || !draft.invoiceNumber.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(draft.occurredOn) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.invoiceDate)) {
      setError(`Проверьте количество (не более ${remaining} ${item.unit}), цену, даты и номер накладной.`);
      return;
    }
    try {
      await receipt.mutateAsync({ data: {
        requestId: crypto.randomUUID(),
        requestItemId: item.id,
        name: item.name,
        articleNumber: item.articleNumber,
        unit: item.unit,
        quantity,
        unitPrice,
        occurredOn: draft.occurredOn,
        invoiceNumber: draft.invoiceNumber.trim(),
        invoiceDate: draft.invoiceDate,
        supplier: draft.supplier.trim(),
        description: `Поступление по заявке №${request.id}`,
      } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListSparePartRequestsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListEngineeringSparePartsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListEngineeringSparePartMovementsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListRepairExpensesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListEngineeringRepairsQueryKey() }),
      ]);
      onChanged();
      setOpen(false);
    } catch (err) { setError(errorInfo(err).message); }
  };
  return <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3" data-testid={`storekeeper-request-item-${item.id}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <ItemSummary item={item} />
      <button type="button" className="button button-primary shrink-0 text-xs" onClick={() => setOpen((value) => !value)} data-testid={`button-receive-request-item-${item.id}`}><PackageCheck size={14} />{open ? "Скрыть приёмку" : "Оприходовать поступление"}</button>
    </div>
    {open && <form onSubmit={submit} className="mt-3 grid gap-3 border-t border-blue-200 pt-3 sm:grid-cols-2 lg:grid-cols-3" data-testid={`form-receive-request-item-${item.id}`}>
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2 lg:col-span-3">После сохранения накладной остаток увеличится на складе. Заявка закроется автоматически после полного поступления одобренного количества.</p>
      <label className="form-label">Количество поступившее *<input className="text-input mt-1.5" type="number" min="0.001" max={remaining} step="0.001" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} required data-testid={`input-receipt-request-quantity-${item.id}`} /></label>
      <label className="form-label">Фактическая цена за ед., ₸ *<input className="text-input mt-1.5" type="number" min="0" step="0.01" value={draft.unitPrice} onChange={(event) => setDraft({ ...draft, unitPrice: event.target.value })} required data-testid={`input-receipt-request-price-${item.id}`} /></label>
      <label className="form-label">Дата поступления *<input className="text-input mt-1.5" type="date" value={draft.occurredOn} onChange={(event) => setDraft({ ...draft, occurredOn: event.target.value })} required /></label>
      <label className="form-label">Номер накладной *<input className="text-input mt-1.5" maxLength={100} value={draft.invoiceNumber} onChange={(event) => setDraft({ ...draft, invoiceNumber: event.target.value })} required data-testid={`input-receipt-request-invoice-${item.id}`} /></label>
      <label className="form-label">Дата накладной *<input className="text-input mt-1.5" type="date" value={draft.invoiceDate} onChange={(event) => setDraft({ ...draft, invoiceDate: event.target.value })} required /></label>
      <label className="form-label">Поставщик<input className="text-input mt-1.5" maxLength={200} value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} /></label>
      {error && <p className="text-xs font-semibold text-destructive sm:col-span-2 lg:col-span-3" role="alert">{error}</p>}
      <button type="submit" className="button button-primary text-xs sm:col-span-2 lg:col-span-3" disabled={receipt.isPending} data-testid={`button-save-receipt-request-item-${item.id}`}><Truck size={14} />{receipt.isPending ? "Оприходуем…" : "Оприходовать и уведомить инженера"}</button>
    </form>}
  </div>;
}
