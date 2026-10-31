import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Lock, Route, Truck, Wallet } from "lucide-react";
import {
  getGetGrainTransportTripsQueryKey,
  getListPayrollAccrualsQueryKey,
  getListPayrollRegistersQueryKey,
  type GrainTransportTrip,
  useGetGrainTransportTrips,
  useUpdateGrainTransportRate,
  useUpdateSeedTransportRate,
  getGetSeedWarehouseQueryKey,
} from "@workspace/api-client-react";
import { dateFmt, errorInfo } from "../agro/grain/shared";
import { money } from "./repairs/shared";
import PayrollRegisterWorkspace from "../economic/PayrollRegisterWorkspace";

const POLL = 15000;
type View = "trips" | "payroll";
type Filter = "all" | "unrated" | "pending";

const operationLabel: Record<GrainTransportTrip["operation"], string> = {
  receipt: "Приход с поля",
  transfer: "Перемещение",
  sale: "Продажа / отгрузка",
  drying: "Сушка",
  cleaning: "Очистка",
};
const approvalLabel: Record<GrainTransportTrip["approvalStatus"], string> = {
  pending: "Ждёт заведующего током",
  approved: "Согласовано",
  returned: "Возвращено весовщику",
};
const approvalTone: Record<GrainTransportTrip["approvalStatus"], string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-teal-50 text-teal-800",
  returned: "bg-destructive/10 text-destructive",
};
const num = (v: number, d = 3) => v.toLocaleString("ru-RU", { maximumFractionDigits: d });
const parsePositive = (value: string, max: number, decimals: number) => {
  const t = value.trim().replace(",", ".");
  const n = Number(t);
  if (!t || !Number.isFinite(n) || n <= 0 || n > max) return null;
  return Number(n.toFixed(decimals)) === n ? n : null;
};
import { ServiceTaskInbox } from "../agro/supporting-tasks/ServiceTaskInbox";

export default function MotorPoolWorkspace({ role, demoActive = false }: { role: string; demoActive?: boolean }) {
  const allowed = role === "motor_pool_manager" || role === "general_director";
  const canEdit = allowed && !demoActive;
  const [view, setView] = useState<View>("trips");
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const tripsQuery = useGetGrainTransportTrips({ query: { queryKey: getGetGrainTransportTripsQueryKey(), enabled: canEdit, refetchInterval: canEdit ? POLL : false } });
  const trips = tripsQuery.data ?? [];
  const unrated = trips.filter((t) => t.approvalStatus === "approved" && t.rateKzt === null).length;
  const pending = trips.filter((t) => t.approvalStatus !== "approved").length;
  const ratedTotal = trips.reduce((sum, t) => sum + Math.round((t.rateKzt ?? 0) * 100), 0) / 100;
  const visible = trips.filter((t) => filter === "all" ? true : filter === "unrated" ? t.approvalStatus === "approved" && t.rateKzt === null : t.approvalStatus !== "approved");

  return (
    <div className="space-y-5" data-testid="motor-pool-workspace">
      <header>
        <p className="eyebrow">Инженерный блок · Автобаза</p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Перевозка зерна и оплата водителей</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Рейсы с поля, между складами, на элеватор и при продаже. Расценку можно внести только после согласования заведующим током; итог начисления рассчитывает сервер. Дневной наряд автобазы отправляется в отдел кадров.</p>
      </header>
      {allowed && <ServiceTaskInbox service="motor_pool" canAccept={canEdit} demo={demoActive} />}

      {!canEdit ? (
        <section className="surface-card flex flex-col items-center p-8 text-center" data-testid="motor-pool-readonly">
          <div className="empty-icon">{demoActive ? <Eye size={20} /> : <Lock size={20} />}</div>
          <p className="mt-3 text-sm font-semibold">{demoActive ? "Демо-режим: только просмотр структуры раздела" : "Раздел доступен заведующему автобазой и генеральному директору"}</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{demoActive ? "В демо-роли рейсы и наряды автобазы не загружаются и не изменяются. Выйдите из демо-роли, чтобы работать с реальными данными." : "Обратитесь к генеральному директору, если вам нужен доступ."}</p>
        </section>
      ) : <>
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Сводка автобазы">
          <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon setting-icon-yellow"><Route size={17} /></div><div><p className="eyebrow">Согласованы, без расценки</p><p className="mt-1 text-xl font-bold" data-testid="text-motor-unrated">{tripsQuery.isLoading ? "…" : unrated}</p></div></article>
          <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon"><Truck size={17} /></div><div><p className="eyebrow">Ждут согласования</p><p className="mt-1 text-xl font-bold" data-testid="text-motor-pending">{tripsQuery.isLoading ? "…" : pending}</p></div></article>
          <article className="surface-card flex items-center gap-3 p-4"><div className="setting-icon"><Wallet size={17} /></div><div><p className="eyebrow">Начислено по рейсам</p><p className="mt-1 font-mono text-lg font-bold" data-testid="text-motor-total">{tripsQuery.isLoading ? "…" : money(ratedTotal)}</p></div></article>
        </section>

        {notice && <p className="notice-banner" role="status" data-testid="motor-pool-notice"><Check size={15} />{notice}</p>}

        <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Работа автобазы">
          <button type="button" role="tab" aria-selected={view === "trips"} onClick={() => setView("trips")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${view === "trips" ? "bg-foreground text-background" : "text-muted-foreground"}`} data-testid="tab-motor-trips">Рейсы зерна и семян ({trips.length})</button>
          <button type="button" role="tab" aria-selected={view === "payroll"} onClick={() => setView("payroll")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${view === "payroll" ? "bg-foreground text-background" : "text-muted-foreground"}`} data-testid="tab-motor-payroll">Наряды автобазы</button>
        </div>

        {view === "payroll" ? <PayrollRegisterWorkspace canManage sourceGroup="motor_pool" /> : (
          <section className="surface-card p-4 sm:p-5" data-testid="section-motor-trips">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="eyebrow">Входящие рейсы · обновление каждые 15 секунд</p><h2 className="mt-1 text-lg font-bold">Расценка рейсов</h2></div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="text-input !w-auto text-xs" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Фильтр рейсов" data-testid="select-motor-filter">
                  <option value="all">Все рейсы</option>
                  <option value="unrated">Без расценки</option>
                  <option value="pending">На согласовании / возвращены</option>
                </select>
                <button type="button" className="button button-secondary text-xs" onClick={() => void tripsQuery.refetch()} disabled={tripsQuery.isFetching} data-testid="button-refresh-motor-trips">{tripsQuery.isFetching ? "Обновляем…" : "Обновить"}</button>
              </div>
            </header>
            {tripsQuery.isLoading ? <div className="mt-4 space-y-3"><div className="skeleton h-24 rounded-lg" /><div className="skeleton h-24 rounded-lg" /></div>
              : tripsQuery.isError ? <div className="py-8 text-center" role="alert" data-testid="motor-trips-error"><p className="text-xs text-destructive">{errorInfo(tripsQuery.error).message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={() => void tripsQuery.refetch()}>Повторить</button></div>
                : visible.length === 0 ? <div className="flex flex-col items-center py-10 text-center" data-testid="motor-trips-empty"><div className="empty-icon"><Truck size={20} /></div><p className="mt-3 text-sm font-semibold">{trips.length ? "По фильтру рейсов нет" : "Рейсов пока нет"}</p><p className="mt-1 max-w-md text-xs text-muted-foreground">Приход с поля, перемещения, отправки на элеватор и продажи появятся после внесения весовщиком.</p></div>
                  : <ul className="mt-3 divide-y divide-border">{visible.map((trip) => <TripRow key={`${trip.sourceType ?? "grain_trip"}-${trip.id}`} trip={trip} onSaved={setNotice} />)}</ul>}
          </section>
        )}
      </>}
    </div>
  );
}

function TripRow({ trip, onSaved }: { trip: GrainTransportTrip; onSaved: (m: string) => void }) {
  const queryClient = useQueryClient();
  const grainM = useUpdateGrainTransportRate();
  const seedM = useUpdateSeedTransportRate();
  const isSeed = trip.sourceType === "seed_trip";
  const mutation = { isPending: seedM.isPending || grainM.isPending };
  const tonKmMode = trip.transportPayBasis === "ton_km";
  const initial = tonKmMode ? (trip.tariffPerTonKm == null ? "" : String(trip.tariffPerTonKm)) : (trip.rateKzt == null ? "" : String(trip.rateKzt));
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => setValue(initial), [trip.id, initial]);
  const approved = trip.approvalStatus === "approved";
  const tonKm = trip.tonKm ?? trip.quantityTons * (trip.distanceKm ?? 0);
  const parsed = tonKmMode ? parsePositive(value, 1_000_000_000, 4) : parsePositive(value, 1_000_000_000_000, 2);
  const preview = parsed === null ? null : tonKmMode ? Math.round(tonKm * parsed * 100) / 100 : parsed;
  const id = `motor-trip-${isSeed ? "seed" : "grain"}-${trip.id}`;

  const save = async () => {
    if (!approved) return;
    if (parsed === null) { setError(tonKmMode ? "Укажите положительный тариф за т·км (до 4 знаков)." : "Укажите положительную сумму за рейс (до 2 знаков)."); return; }
    setError("");
    try {
      const payload = { id: trip.id, data: { version: trip.version, ...(tonKmMode ? { tariffPerTonKm: parsed } : { rateKzt: parsed }) } };
      if (isSeed) await seedM.mutateAsync(payload); else await grainM.mutateAsync(payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGrainTransportTripsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListPayrollAccrualsQueryKey({ sourceGroup: "motor_pool" }) }),
        queryClient.invalidateQueries({ queryKey: getListPayrollRegistersQueryKey({ sourceGroup: "motor_pool" }) }),
        ...(isSeed ? [queryClient.invalidateQueries({ queryKey: getGetSeedWarehouseQueryKey() }), queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/agro/fields") })] : []),
      ]);
      onSaved(`Расценка по рейсу ${isSeed ? "семян " : ""}№${trip.id} сохранена.`);
    } catch (err) {
      const info = errorInfo(err);
      setError(info.status === 409 ? "Рейс изменился или начисление уже отправлено в отдел кадров. Данные обновлены." : info.message);
      void queryClient.invalidateQueries({ queryKey: getGetGrainTransportTripsQueryKey() });
    }
  };

  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between" data-testid={`motor-trip-row-${isSeed ? "seed" : "grain"}-${trip.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm">{isSeed ? "Доставка семян" : operationLabel[trip.operation] ?? trip.operation} · {trip.cropName}</strong>
          {isSeed && trip.supportingTaskId != null && <span className="meta-chip" data-testid={`text-motor-trip-task-${trip.id}`}>Задание № {trip.supportingTaskId}</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${approvalTone[trip.approvalStatus]}`} data-testid={`status-${id}`}>{approvalLabel[trip.approvalStatus]}</span>
          <span className="meta-chip">{tonKmMode ? "За тонно-км" : "За рейс"}</span>
          <span className="text-[10px] text-muted-foreground">№ {trip.id}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{trip.unit} · {dateFmt(trip.occurredOn)} · <span className="font-mono">{num(trip.quantityTons)} т</span>{tonKmMode && <> · <span className="font-mono">{num(trip.distanceKm ?? 0)} км</span> · <span className="font-mono">{num(tonKm)} т·км</span></>}{trip.fieldName ? ` · поле ${trip.fieldName}` : ""}{isSeed ? " · сезонные затраты поля: Автобаза (доставка семян)" : ""}</p>
        <p className="mt-1 text-xs font-semibold">Машина {trip.truckNumber || "—"} · водитель {trip.driverName || "—"}{trip.driverEmployeeId === null && <span className="ml-1.5 text-[10px] font-semibold text-amber-700">нет в справочнике</span>}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{trip.fromLocationName ? `из ${trip.fromLocationName}` : trip.operation === "receipt" ? "с поля" : "—"}{trip.toLocationName ? ` → ${trip.toLocationName}` : trip.operation === "sale" ? " → покупателю" : ""}</p>
        {trip.rateSetBy && <p className="mt-1 text-[10px] text-muted-foreground">Расценку внёс {trip.rateSetBy}{trip.rateSetAt ? ` · ${dateFmt(trip.rateSetAt)}` : ""}{trip.rateKzt !== null ? ` · начислено ${money(trip.rateKzt)}` : ""}</p>}
      </div>
      <div className="w-full shrink-0 lg:w-[280px]">
        {!approved ? <p className="rounded-lg bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground" data-testid={`text-${id}-locked`}><Lock size={11} className="mr-1 inline" />{trip.approvalStatus === "pending" ? "Расценка станет доступна после согласования заведующим током." : "Запись возвращена весовщику на исправление. Расценка недоступна."}</p> : <>
          <div className="flex items-end gap-2">
            <label className="form-label flex-1" htmlFor={`${id}-input`}>{tonKmMode ? "Тариф, ₸ за т·км" : "Оплата за рейс, ₸"}<input id={`${id}-input`} inputMode="decimal" className="text-input mt-1 font-mono" value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} aria-invalid={!!error} data-testid={`${id}-input`} /></label>
            <button type="button" className="button button-primary shrink-0 text-xs" onClick={() => void save()} disabled={mutation.isPending} data-testid={`${id}-save`}>{mutation.isPending ? "Сохраняем…" : "Сохранить"}</button>
          </div>
          <p className="mt-1 text-right text-[10px] text-muted-foreground" data-testid={`${id}-preview`}>{preview === null ? "Введите расценку" : tonKmMode ? `${num(tonKm)} т·км × ${num(parsed ?? 0, 4)} ₸ ≈ ${money(preview)}` : `Начисление ${money(preview)}`}</p>
          {tonKmMode && <p className="text-right text-[10px] text-muted-foreground">Итог фиксирует сервер</p>}
          {error && <p className="mt-1 text-right text-[10px] font-semibold text-destructive" role="alert" data-testid={`${id}-error`}>{error}</p>}
        </>}
      </div>
    </li>
  );
}
