import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Satellite, Tractor } from "lucide-react";
import {
  getGpsWorkArea,
  getListFleetEquipmentQueryKey,
  useListFleetEquipment,
  type FieldDispatchItem,
  type GetGpsWorkArea200,
} from "@workspace/api-client-react";
import { errorInfo, POLL_MS } from "../grain/shared";
import { equipmentLabel, implementSuggestions, paramsKey, validateGpsForm, type GpsForm } from "./gpsArea";

type FieldsState = { data: FieldDispatchItem[] | undefined; isLoading: boolean; isError: boolean; error: unknown; isFetching: boolean; refetch: () => unknown };
type Run = { key: string; status: "loading" } | { key: string; status: "error"; message: string } | { key: string; status: "done"; result: GetGpsWorkArea200 };

const EMPTY: GpsForm = { equipmentId: "", implement: "", startsAt: "", endsAt: "" };
const tzName = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
const fmtDT = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); };

export default function GpsWorkArea({ fields }: { fields: FieldsState }) {
  const fleet = useListFleetEquipment({ query: { queryKey: getListFleetEquipmentQueryKey(), refetchInterval: POLL_MS } });
  const equipment = useMemo(() => [...(fleet.data ?? [])].sort((a, b) => a.unit.localeCompare(b.unit) || a.kind.localeCompare(b.kind, "ru")), [fleet.data]);
  const [form, setForm] = useState<GpsForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof GpsForm, string>>>({});
  const [run, setRun] = useState<Run | null>(null);
  const seq = useRef(0);
  useEffect(() => () => { seq.current += 1; }, []);

  const selectedId = form.equipmentId ? Number(form.equipmentId) : null;
  const allSuggestions = useMemo(() => implementSuggestions(fields.data ?? []), [fields.data]);
  const machineSuggestions = useMemo(() => selectedId ? implementSuggestions(fields.data ?? [], selectedId) : [], [fields.data, selectedId]);
  const shown = machineSuggestions.length ? machineSuggestions : allSuggestions;

  const update = (patch: Partial<GpsForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => { const n = { ...e }; for (const k of Object.keys(patch)) delete n[k as keyof GpsForm]; return n; });
    // Any input change invalidates the shown result and any in-flight request.
    seq.current += 1;
    setRun(null);
  };

  const request = async () => {
    const v = validateGpsForm(form, equipment);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({});
    const mySeq = ++seq.current;
    const key = paramsKey(v.params);
    setRun({ key, status: "loading" });
    try {
      const result = await getGpsWorkArea(v.params);
      if (seq.current !== mySeq) return;
      setRun({ key, status: "done", result });
    } catch (err) {
      if (seq.current !== mySeq) return;
      setRun({ key, status: "error", message: errorInfo(err).message });
    }
  };

  const machine = equipment.find((e) => e.id === selectedId);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" data-testid="section-dispatch-gps">
      <section className="surface-card p-4 sm:p-5" aria-label="Техника автопарка">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">Автопарк</p><h2 className="mt-1 text-lg font-bold">Техника</h2><p className="mt-1 text-xs text-muted-foreground">Выберите машину, чтобы подставить её в запрос.</p></div>
          <button type="button" className="button button-secondary text-xs" onClick={() => void fleet.refetch()} disabled={fleet.isFetching} data-testid="button-refresh-gps-fleet"><RefreshCw size={13} className={fleet.isFetching ? "animate-spin" : ""} /> Обновить</button>
        </header>
        {fleet.isLoading ? <div className="mt-3 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
          : fleet.isError ? <div className="py-8 text-center" role="alert" data-testid="gps-fleet-error"><p className="text-xs text-destructive">{errorInfo(fleet.error).message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={() => void fleet.refetch()} data-testid="button-retry-gps-fleet">Повторить</button></div>
            : equipment.length === 0 ? <div className="flex flex-col items-center py-10 text-center" data-testid="gps-fleet-empty"><Tractor size={22} className="text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Техника не заведена</p><p className="mt-1 max-w-xs text-xs text-muted-foreground">Машины добавляются в справочник автопарка инженерной службой.</p></div>
              : <ul className="mt-3 max-h-[420px] divide-y divide-border overflow-y-auto pr-1">{equipment.map((e) => {
                const active = e.id === selectedId;
                return (
                  <li key={e.id}>
                    <button type="button" onClick={() => update({ equipmentId: String(e.id) })} aria-pressed={active} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${active ? "bg-foreground text-background" : "hover:bg-muted"}`} data-testid={`button-gps-equipment-${e.id}`}>
                      <Tractor size={15} className="shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{e.kind}</span><span className={`block text-[11px] ${active ? "opacity-75" : "text-muted-foreground"}`}>{e.unit}</span></span>
                      <span className="shrink-0 font-mono text-[11px]">{e.registrationNumber ?? "без номера"}</span>
                    </button>
                  </li>
                );
              })}</ul>}
      </section>

      <section className="surface-card p-4 sm:p-5" aria-label="Запрос площади по GPS">
        <header className="flex items-start gap-3">
          <div className="setting-icon"><Satellite size={17} /></div>
          <div><p className="eyebrow">GPS техники · Автограф</p><h2 className="mt-1 text-lg font-bold">Обработанная площадь за период</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Запрос гектаров по треку выбранной машины с агрегатом. Результат носит справочный характер: он не меняет дневные факты и не начисляет зарплату.</p></div>
        </header>

        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void request(); }} noValidate>
          <label className="form-label block" htmlFor="gps-equipment">Техника
            <select id="gps-equipment" className="text-input mt-1" value={form.equipmentId} onChange={(e) => update({ equipmentId: e.target.value })} disabled={fleet.isLoading || fleet.isError} data-testid="select-gps-equipment">
              <option value="">{fleet.isLoading ? "Загружаем автопарк…" : "Не выбрана"}</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{equipmentLabel(e)} — {e.unit}</option>)}
            </select>
            {errors.equipmentId && <span className="mt-1 block text-[11px] font-semibold text-destructive" role="alert">{errors.equipmentId}</span>}
          </label>

          <div>
            <label className="form-label block" htmlFor="gps-implement">Агрегат
              <input id="gps-implement" className="text-input mt-1" list="gps-implement-options" maxLength={220} placeholder="Введите или выберите из подсказок" value={form.implement} onChange={(e) => update({ implement: e.target.value })} autoComplete="off" data-testid="input-gps-implement" />
            </label>
            <datalist id="gps-implement-options">{shown.map((s) => <option key={s.name} value={s.name} />)}</datalist>
            {errors.implement && <p className="mt-1 text-[11px] font-semibold text-destructive" role="alert">{errors.implement}</p>}
            <div className="mt-2 rounded-lg border border-dashed border-border p-2.5" data-testid="gps-implement-suggestions">
              <p className="text-[11px] text-muted-foreground">Справочника агрегатов нет. Подсказки собраны из записей полевых работ (план, факт, дневные отчёты){machineSuggestions.length ? " для выбранной машины" : selectedId ? "; для этой машины записей нет — показаны все" : ""}. Проверьте, что агрегат верный, или впишите свой.</p>
              {fields.isLoading ? <div className="mt-2 flex gap-1.5">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-6 w-20 rounded-full" />)}</div>
                : fields.isError ? <p className="mt-2 text-[11px] text-destructive" role="alert" data-testid="gps-suggestions-error">Подсказки недоступны: {errorInfo(fields.error).message} <button type="button" className="ml-1 underline" onClick={() => void fields.refetch()} disabled={fields.isFetching} data-testid="button-retry-gps-suggestions">Повторить</button></p>
                  : shown.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">В записях работ агрегаты пока не указаны.</p>
                    : <div className="mt-2 flex flex-wrap gap-1.5">{shown.slice(0, 12).map((s) => <button key={s.name} type="button" onClick={() => update({ implement: s.name })} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${form.implement.trim() === s.name ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`} data-testid={`button-gps-implement-suggestion-${s.name}`}>{s.name}</button>)}</div>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-label block" htmlFor="gps-start">Начало
              <input id="gps-start" type="datetime-local" className="text-input mt-1 font-mono" value={form.startsAt} onChange={(e) => update({ startsAt: e.target.value })} data-testid="input-gps-start" />
              {errors.startsAt && <span className="mt-1 block text-[11px] font-semibold text-destructive" role="alert">{errors.startsAt}</span>}
            </label>
            <label className="form-label block" htmlFor="gps-end">Окончание
              <input id="gps-end" type="datetime-local" className="text-input mt-1 font-mono" value={form.endsAt} onChange={(e) => update({ endsAt: e.target.value })} data-testid="input-gps-end" />
              {errors.endsAt && <span className="mt-1 block text-[11px] font-semibold text-destructive" role="alert">{errors.endsAt}</span>}
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground" data-testid="text-gps-timezone">Время указывается по часовому поясу этого браузера{tzName ? ` (${tzName})` : ""} и отправляется с явным смещением.</p>

          <button type="submit" className="button button-primary w-full text-xs sm:w-auto" disabled={run?.status === "loading"} data-testid="button-gps-request">{run?.status === "loading" ? "Запрашиваем…" : "Запросить гектары"}</button>
        </form>

        <div className="mt-4" aria-live="polite">
          {run?.status === "loading" && <div className="skeleton h-20 rounded-xl" data-testid="gps-result-loading" />}
          {run?.status === "error" && <div className="rounded-xl border border-destructive/30 p-3" role="alert" data-testid="gps-result-error"><p className="text-xs text-destructive">{run.message}</p><button type="button" className="button button-secondary mt-2 text-xs" onClick={() => void request()} data-testid="button-gps-retry">Повторить</button></div>}
          {run?.status === "done" && <ResultCard result={run.result} machineName={machine ? equipmentLabel(machine) : `#${run.result.equipmentId}`} />}
          {!run && <p className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground" data-testid="gps-result-idle">Заполните параметры и нажмите «Запросить гектары». Изменение любого поля сбрасывает прежний результат.</p>}
        </div>
      </section>
    </div>
  );
}

export function ResultCard({ result, machineName }: { result: GetGpsWorkArea200; machineName: string }) {
  const meta = <p className="mt-2 text-[11px] text-muted-foreground">{machineName} · {result.implement} · {fmtDT(result.startsAt)} — {fmtDT(result.endsAt)}</p>;
  if (result.status === "not_connected") return (
    <div className="rounded-xl border border-border bg-muted/40 p-4" data-testid="gps-result-not-connected">
      <p className="eyebrow">Датчики не подключены</p>
      <p className="mt-1 text-sm font-semibold">Получение площади из GPS пока недоступно</p>
      <p className="mt-1 text-xs text-muted-foreground">Интеграция с датчиками будет подключена позже. Сейчас площадь вносится по дневным отчётам, как обычно.</p>
      {result.message && <p className="mt-1 text-xs text-muted-foreground">{result.message}</p>}
      {meta}
    </div>
  );
  if (result.status === "no_data" || result.areaHa == null) return (
    <div className="rounded-xl border border-border p-4" data-testid="gps-result-no-data">
      <p className="eyebrow">Нет данных</p>
      <p className="mt-1 text-sm font-semibold">За выбранный период трек не найден</p>
      {result.message && <p className="mt-1 text-xs text-muted-foreground">{result.message}</p>}
      {meta}
    </div>
  );
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="gps-result-available">
      <p className="eyebrow">По данным Автографа</p>
      <p className="mt-1 font-mono text-3xl font-bold" data-testid="text-gps-area">{result.areaHa.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} <span className="text-base">га</span></p>
      {result.message && <p className="mt-1 text-xs text-muted-foreground">{result.message}</p>}
      {meta}
      <p className="mt-2 text-[11px] font-semibold">Только для сверки: значение не записывается в дневные факты и не влияет на начисления.</p>
    </div>
  );
}
