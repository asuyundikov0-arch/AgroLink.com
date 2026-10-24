import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Route, Tractor } from "lucide-react";
import {
  getGetFieldDispatchQueueQueryKey,
  getGetFieldDashboardQueryKey,
  getGetGrainTransportTripsQueryKey,
  type FieldDispatchItem,
  type GrainTransportTrip,
  useGetFieldDispatchQueue,
  useGetGrainTransportTrips,
  useUpdateFieldDispatchRate,
  useUpdateGrainTransportRate,
} from "@workspace/api-client-react";
import { dateFmt, errorInfo, POLL_MS } from "./grain/shared";
import { money } from "../engineering/repairs/shared";

type View = "grain" | "fields";
const operationLabel: Record<GrainTransportTrip["operation"], string> = {
  receipt: "Приход с поля",
  transfer: "Перемещение",
  drying: "Отправка на сушку",
  cleaning: "Отправка на очистку",
};
const approvalLabel: Record<GrainTransportTrip["approvalStatus"], string> = {
  pending: "На согласовании",
  approved: "Согласовано",
  returned: "Возвращено",
};
const parseRate = (value: string) => {
  const parsed = Number(value.trim().replace(",", "."));
  return value.trim() && Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000_000 ? parsed : null;
};

export default function DispatcherWorkspace() {
  const grainQuery = useGetGrainTransportTrips({ query: { queryKey: getGetGrainTransportTripsQueryKey(), refetchInterval: POLL_MS } });
  const fieldsQuery = useGetFieldDispatchQueue({ query: { queryKey: getGetFieldDispatchQueueQueryKey(), refetchInterval: POLL_MS } });
  const grainTrips = grainQuery.data ?? [];
  const fieldOperations = fieldsQuery.data ?? [];
  const unratedTrips = grainTrips.filter((trip) => trip.rateKzt === null).length;
  const unratedFields = fieldOperations.filter((operation) => operation.actualRatePerHa === null).length;
  const [view, setView] = useState<View>("grain");
  const [notice, setNotice] = useState("");

  return (
    <div className="space-y-5" data-testid="dispatcher-workspace">
      <header>
        <p className="eyebrow">Рабочее пространство</p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Диспетчерская</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Здесь отображаются только рейсы по зерну и завершённые полевые операции, для которых нужно указать фактическую расценку.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Очередь диспетчера">
        <article className="surface-card flex items-center gap-3 p-4">
          <div className="setting-icon"><Route size={17} /></div>
          <div><p className="eyebrow">Рейсы без расценки</p><p className="mt-1 text-xl font-bold">{unratedTrips}</p></div>
        </article>
        <article className="surface-card flex items-center gap-3 p-4">
          <div className="setting-icon"><Tractor size={17} /></div>
          <div><p className="eyebrow">Завершённые работы без ставки</p><p className="mt-1 text-xl font-bold">{unratedFields}</p></div>
        </article>
      </section>

      {notice && <p className="notice-banner" role="status" data-testid="dispatcher-notice"><Check size={15} />{notice}</p>}
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Работа диспетчера">
        <button type="button" role="tab" aria-selected={view === "grain"} onClick={() => setView("grain")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${view === "grain" ? "bg-foreground text-background" : "text-muted-foreground"}`} data-testid="tab-dispatch-grain">Перевозка зерна ({grainTrips.length})</button>
        <button type="button" role="tab" aria-selected={view === "fields"} onClick={() => setView("fields")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${view === "fields" ? "bg-foreground text-background" : "text-muted-foreground"}`} data-testid="tab-dispatch-fields">Полевые расценки ({fieldOperations.length})</button>
      </div>

      {view === "grain" ? (
        <section className="surface-card p-4 sm:p-5" data-testid="section-dispatch-grain">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="eyebrow">Транспортные рейсы</p><h2 className="mt-1 text-lg font-bold">Оплата за каждый рейс</h2></div>
            <button type="button" className="button button-secondary text-xs" onClick={() => void grainQuery.refetch()} disabled={grainQuery.isFetching} data-testid="button-refresh-dispatch-grain">Обновить</button>
          </header>
          {grainQuery.isLoading ? <p className="py-8 text-center text-xs text-muted-foreground">Загружаем рейсы…</p>
            : grainQuery.isError ? <ErrorPanel message={errorInfo(grainQuery.error).message} onRetry={() => void grainQuery.refetch()} testId="dispatch-grain-error" />
              : grainTrips.length === 0 ? <EmptyPanel title="Рейсов пока нет" detail="Приход, перемещения и отправки на сушку/очистку появятся после их внесения в баланс." testId="dispatch-grain-empty" />
                : <ul className="mt-3 divide-y divide-border">{grainTrips.map((trip) => <TransportTripRow key={trip.id} trip={trip} onSaved={() => setNotice(`Расценка по рейсу №${trip.id} сохранена.`)} />)}</ul>}
        </section>
      ) : (
        <section className="surface-card p-4 sm:p-5" data-testid="section-dispatch-fields">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="eyebrow">Завершённые полевые работы</p><h2 className="mt-1 text-lg font-bold">Фактическая ставка и сумма</h2></div>
            <button type="button" className="button button-secondary text-xs" onClick={() => void fieldsQuery.refetch()} disabled={fieldsQuery.isFetching} data-testid="button-refresh-dispatch-fields">Обновить</button>
          </header>
          {fieldsQuery.isLoading ? <p className="py-8 text-center text-xs text-muted-foreground">Загружаем выполненные работы…</p>
            : fieldsQuery.isError ? <ErrorPanel message={errorInfo(fieldsQuery.error).message} onRetry={() => void fieldsQuery.refetch()} testId="dispatch-fields-error" />
              : fieldOperations.length === 0 ? <EmptyPanel title="Завершённых работ пока нет" detail="Когда агроном внесёт фактическое завершение, операция появится здесь." testId="dispatch-fields-empty" />
                : <ul className="mt-3 divide-y divide-border">{fieldOperations.map((operation) => <FieldOperationRow key={operation.id} operation={operation} onSaved={() => setNotice(`Фактическая ставка по полю №${operation.fieldNumber} сохранена.`)} />)}</ul>}
        </section>
      )}
    </div>
  );
}

function TransportTripRow({ trip, onSaved }: { trip: GrainTransportTrip; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateGrainTransportRate();
  const [rate, setRate] = useState(trip.rateKzt === null ? "" : String(trip.rateKzt));
  const [error, setError] = useState("");
  useEffect(() => setRate(trip.rateKzt === null ? "" : String(trip.rateKzt)), [trip.id, trip.rateKzt]);
  const save = async () => {
    const parsed = parseRate(rate);
    if (parsed === null) { setError("Укажите положительную оплату за рейс."); return; }
    setError("");
    try {
      await mutation.mutateAsync({ id: trip.id, data: { rateKzt: parsed } });
      await queryClient.invalidateQueries({ queryKey: getGetGrainTransportTripsQueryKey() });
      onSaved();
    } catch (err) { setError(errorInfo(err).message); }
  };
  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" data-testid={`dispatch-grain-row-${trip.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{operationLabel[trip.operation]} · {trip.cropName}</strong><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{approvalLabel[trip.approvalStatus]}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">{trip.unit} · {dateFmt(trip.occurredOn)} · {trip.quantityTons.toLocaleString("ru-RU")} т{trip.fieldName ? ` · поле ${trip.fieldName}` : ""}</p>
        <p className="mt-1 text-xs font-semibold">КамАЗ {trip.truckNumber} · водитель {trip.driverName}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{trip.fromLocationName ? `из ${trip.fromLocationName}` : "с поля"}{trip.toLocationName ? ` → ${trip.toLocationName}` : ""}</p>
        {trip.rateSetBy && <p className="mt-1 text-[10px] text-muted-foreground">Расценку внёс {trip.rateSetBy}{trip.rateSetAt ? ` · ${dateFmt(trip.rateSetAt)}` : ""}</p>}
      </div>
      <RateEditor
        value={rate}
        onChange={setRate}
        amount={parseRate(rate)}
        unitLabel="₸ за рейс"
        pending={mutation.isPending}
        error={error}
        onSave={() => void save()}
        testId={`dispatch-grain-rate-${trip.id}`}
      />
    </li>
  );
}

function FieldOperationRow({ operation, onSaved }: { operation: FieldDispatchItem; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateFieldDispatchRate();
  const [rate, setRate] = useState(operation.actualRatePerHa === null ? "" : String(operation.actualRatePerHa));
  const [error, setError] = useState("");
  useEffect(() => setRate(operation.actualRatePerHa === null ? "" : String(operation.actualRatePerHa)), [operation.id, operation.actualRatePerHa]);
  const parsedRate = parseRate(rate);
  const amount = parsedRate === null ? null : Math.round((operation.actualAreaHa * parsedRate + Number.EPSILON) * 100) / 100;
  const save = async () => {
    if (parsedRate === null) { setError("Укажите положительную расценку за гектар."); return; }
    setError("");
    try {
      await mutation.mutateAsync({ id: operation.id, data: { version: operation.version, ratePerHa: parsedRate } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetFieldDispatchQueueQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetFieldDashboardQueryKey() }),
      ]);
      onSaved();
    } catch (err) { setError(errorInfo(err).message); }
  };
  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" data-testid={`dispatch-field-row-${operation.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">Поле №{operation.fieldNumber} · {operation.operationName}</strong><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">{operation.cropName} · {operation.year}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">Завершено {dateFmt(operation.actualEnd)} · {operation.actualAreaHa.toLocaleString("ru-RU")} га · плановая ставка {money(operation.plannedRatePerHa)}/га</p>
        <p className="mt-1 text-xs font-semibold">{operation.actualMechanic} · {operation.actualEquipment}{operation.actualImplement ? ` · ${operation.actualImplement}` : ""}</p>
        {operation.actualRateSetBy && <p className="mt-1 text-[10px] text-muted-foreground">Ставку внёс {operation.actualRateSetBy}{operation.actualRateSetAt ? ` · ${dateFmt(operation.actualRateSetAt)}` : ""}</p>}
      </div>
      <RateEditor
        value={rate}
        onChange={setRate}
        amount={amount}
        unitLabel="₸/га"
        pending={mutation.isPending}
        error={error}
        onSave={() => void save()}
        testId={`dispatch-field-rate-${operation.id}`}
      />
    </li>
  );
}

function RateEditor({ value, onChange, amount, unitLabel, pending, error, onSave, testId }: {
  value: string;
  onChange: (value: string) => void;
  amount: number | null;
  unitLabel: string;
  pending: boolean;
  error: string;
  onSave: () => void;
  testId: string;
}) {
  return (
    <div className="w-full shrink-0 lg:w-[260px]">
      <div className="flex items-end gap-2">
        <label className="form-label flex-1" htmlFor={`${testId}-input`}>Фактическая расценка<input id={`${testId}-input`} type="number" min="0.01" step="0.01" className="text-input mt-1 font-mono" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`${testId}-input`} /></label>
        <button type="button" className="button button-primary shrink-0 text-xs" onClick={onSave} disabled={pending} data-testid={`${testId}-save`}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
      <p className="mt-1 text-right text-[10px] text-muted-foreground">{amount === null ? "Введите расценку" : `${unitLabel} · сумма ${money(amount)}`}</p>
      {error && <p className="mt-1 text-right text-[10px] font-semibold text-destructive" role="alert" data-testid={`${testId}-error`}>{error}</p>}
    </div>
  );
}

function ErrorPanel({ message, onRetry, testId }: { message: string; onRetry: () => void; testId: string }) {
  return <div className="py-8 text-center" role="alert" data-testid={testId}><p className="text-xs text-destructive">{message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={onRetry}>Повторить</button></div>;
}

function EmptyPanel({ title, detail, testId }: { title: string; detail: string; testId: string }) {
  return <div className="flex flex-col items-center py-10 text-center" data-testid={testId}><Banknote size={22} className="text-muted-foreground" /><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{detail}</p></div>;
}
