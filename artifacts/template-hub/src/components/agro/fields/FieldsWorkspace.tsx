import { type ReactNode, useMemo, useState } from "react";
import { Activity, Ban, CalendarRange, History, LandPlot, Layers, Map as MapIcon, Pencil, Plus, RefreshCw, Sprout, TriangleAlert } from "lucide-react";
import { type AgroField, type FieldOperation, type FieldSeason, getGetFieldDashboardQueryKey, useGetFieldDashboard } from "@workspace/api-client-react";
import { ActualForm, FieldForm, OperationForm, SeasonForm, VoidDialog } from "./Forms";
import { CropAreaChart, OpPlanFactChart } from "./Charts";
import { Drawer, POLL_MS, Progress, STATUS, StatusPill, UNITS, type Unit, canActual, canManage, cx, dateFmt, errorInfo, ha, isGD, sumHa } from "./shared";

type View = "overview" | "rotation" | "operations" | "fields";
type StatusF = "all" | FieldOperation["status"] | "overdue";
type Modal =
  | { k: "field"; field: AgroField | null }
  | { k: "season"; season: FieldSeason | null; fieldId?: number }
  | { k: "op"; op: FieldOperation | null; seasonId?: number }
  | { k: "actual"; op: FieldOperation }
  | { k: "void"; op: FieldOperation }
  | { k: "history"; fieldId: number };

const READ_ROLES = ["agronomist", "chief_agronomist", "farm_director", "general_director", "economist"];
const byNum = (a: AgroField, b: AgroField) => a.unit.localeCompare(b.unit) || a.number.localeCompare(b.number, "ru", { numeric: true });

export default function FieldsWorkspace({ role }: { role: string }) {
  const allowed = READ_ROLES.includes(role);
  const q = useGetFieldDashboard({ query: { queryKey: getGetFieldDashboardQueryKey(), refetchInterval: POLL_MS, enabled: allowed } });
  const d = q.data;
  const today = d?.asOfDate.slice(0, 10) ?? "";
  const baseYear = today ? Number(today.slice(0, 4)) : 0;
  const [yearSel, setYearSel] = useState<number | null>(null);
  const year = yearSel ?? baseYear;
  const [unit, setUnit] = useState<Unit | "all">("all");
  const [fieldF, setFieldF] = useState("all");
  const [statusF, setStatusF] = useState<StatusF>("all");
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useState("");
  const manage = canManage(role);
  const actual = canActual(role);
  const gd = isGD(role);

  const fields = useMemo(() => [...(d?.fields ?? [])].sort(byNum), [d]);
  const seasons = useMemo(() => d?.seasons ?? [], [d]);
  const ops = useMemo(() => d?.operations ?? [], [d]);
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const seasonById = useMemo(() => new Map(seasons.map((s) => [s.id, s])), [seasons]);
  const years = useMemo(() => {
    const ys = new Set(seasons.map((s) => s.year));
    if (baseYear) { ys.add(baseYear); ys.add(baseYear + 1); }
    return [...ys].sort((a, b) => b - a);
  }, [seasons, baseYear]);

  const scopeFields = useMemo(() => fields.filter((f) => (unit === "all" || f.unit === unit) && (fieldF === "all" || String(f.id) === fieldF)), [fields, unit, fieldF]);
  const scopeIds = useMemo(() => new Set(scopeFields.map((f) => f.id)), [scopeFields]);
  const yearSeasons = useMemo(() => seasons.filter((s) => s.year === year && scopeIds.has(s.fieldId)), [seasons, year, scopeIds]);
  const yearSeasonIds = useMemo(() => new Set(yearSeasons.map((s) => s.id)), [yearSeasons]);
  const yearOps = useMemo(() => ops.filter((o) => yearSeasonIds.has(o.seasonId) && (statusF === "all" || (statusF === "overdue" ? o.isOverdue : o.status === statusF))), [ops, yearSeasonIds, statusF]);

  const prevOf = useMemo(() => {
    const m = new Map<number, FieldSeason | undefined>();
    for (const s of seasons) m.set(s.id, seasons.filter((p) => p.fieldId === s.fieldId && p.year < s.year).sort((a, b) => b.year - a.year)[0]);
    return m;
  }, [seasons]);

  const rot = useMemo(() => {
    const active = scopeFields.filter((f) => f.isActive);
    const planned = new Set(yearSeasons.map((s) => s.fieldId));
    const unplanned = active.filter((f) => !planned.has(f.id));
    const byCrop = new Map<string, number>();
    for (const s of yearSeasons) byCrop.set(s.cropName, sumHa([byCrop.get(s.cropName) ?? 0, s.areaHa]));
    return {
      dirArea: sumHa(active.map((f) => f.areaHa)), activeCount: active.length,
      seasonArea: sumHa(yearSeasons.map((s) => s.areaHa)), unplanned, unplannedArea: sumHa(unplanned.map((f) => f.areaHa)),
      crops: [...byCrop].map(([crop, area]) => ({ crop, area })).sort((a, b) => b.area - a.area),
    };
  }, [scopeFields, yearSeasons]);

  const opStats = useMemo(() => {
    const live = yearOps.filter((o) => o.status !== "cancelled");
    const byName = new Map<string, { planned: number; actual: number; n: number; done: number }>();
    for (const o of live) {
      const r = byName.get(o.name) ?? { planned: 0, actual: 0, n: 0, done: 0 };
      r.planned = sumHa([r.planned, o.plannedAreaHa]); r.actual = sumHa([r.actual, o.actualAreaHa]); r.n += 1; if (o.status === "completed") r.done += 1;
      byName.set(o.name, r);
    }
    const count = (k: FieldOperation["status"]) => yearOps.filter((o) => o.status === k).length;
    return {
      rows: [...byName].map(([name, r]) => ({ name, ...r })).sort((a, b) => b.planned - a.planned),
      planned: count("planned"), inProgress: count("in_progress"), completed: count("completed"), cancelled: count("cancelled"),
      overdue: yearOps.filter((o) => o.isOverdue).length,
      plannedHa: sumHa(live.map((o) => o.plannedAreaHa)), actualHa: sumHa(live.map((o) => o.actualAreaHa)),
    };
  }, [yearOps]);

  const opTitle = (o: FieldOperation) => { const s = seasonById.get(o.seasonId); const f = s && fieldById.get(s.fieldId); return `${o.name} · поле № ${f?.number ?? "?"} · ${s?.year ?? ""}`; };
  const done = (msg: string) => { setModal(null); setNotice(msg); };

  if (!allowed) return (
    <div className="surface-card empty-state" data-testid="status-fields-forbidden"><h3 className="text-sm font-bold">Нет доступа к полям и операциям</h3>
      <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Раздел доступен агрономам, главному агроному, экономисту, директору хозяйства и генеральному директору.</p></div>
  );

  return (
    <div className="space-y-5" data-testid="fields-workspace">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Агрономия · севооборот и полевые работы</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Поля и операции</h1>
          <p className="mt-1 text-xs text-muted-foreground">{d ? <>На {dateFmt(d.asOfDate)} · гектары, до 0,01 · обновление каждые 30 с</> : "Справочник полей, сезоны и план-факт работ"}
            {q.isFetching && !q.isLoading && <span className="ml-2 inline-flex items-center gap-1 text-[hsl(203_87%_33%)]"><RefreshCw size={11} className="animate-spin" />синхронизация</span>}</p>
        </div>
        {d && (
          <div className="flex flex-wrap gap-2">
            {manage && <button type="button" className="button button-secondary" onClick={() => setModal({ k: "season", season: null })} disabled={!fields.some((f) => f.isActive)} data-testid="button-new-season"><Layers size={14} />Сезон</button>}
            {manage && <button type="button" className="button button-primary" onClick={() => setModal({ k: "op", op: null })} disabled={seasons.length === 0} data-testid="button-new-operation"><Plus size={14} />Операция</button>}
          </div>
        )}
      </header>

      {q.isLoading ? (
        <div className="space-y-4" data-testid="status-fields-loading"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[92px] rounded-xl" />)}</div><div className="skeleton h-64 rounded-xl" /></div>
      ) : q.isError || !d ? (
        <div className="surface-card empty-state" data-testid="status-fields-error"><div className="empty-icon empty-icon-error"><TriangleAlert size={20} /></div><h3 className="mt-4 text-sm font-bold">Не удалось загрузить поля</h3><p className="mt-1 text-xs text-muted-foreground">{errorInfo(q.error).message}</p>
          <button type="button" className="button button-secondary mt-4" onClick={() => q.refetch()} data-testid="button-fields-retry">Повторить</button></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Фильтры">
            <select aria-label="Год" className="text-input !w-auto font-mono" value={year} onChange={(e) => setYearSel(Number(e.target.value))} data-testid="select-fields-year">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <select aria-label="Хозяйство" className="text-input !w-auto" value={unit} onChange={(e) => { setUnit(e.target.value as Unit | "all"); setFieldF("all"); }} data-testid="select-fields-unit"><option value="all">Все хозяйства</option>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
            <select aria-label="Поле" className="text-input !w-auto max-w-[200px]" value={fieldF} onChange={(e) => setFieldF(e.target.value)} data-testid="select-fields-field"><option value="all">Все поля</option>{fields.filter((f) => unit === "all" || f.unit === unit).map((f) => <option key={f.id} value={f.id}>№ {f.number}{unit === "all" ? ` · ${f.unit}` : ""}{f.isActive ? "" : " (архив)"}</option>)}</select>
            <select aria-label="Статус операции" className="text-input !w-auto" value={statusF} onChange={(e) => setStatusF(e.target.value as StatusF)} data-testid="select-fields-status"><option value="all">Все статусы</option>{(Object.keys(STATUS) as FieldOperation["status"][]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}<option value="overdue">Просроченные</option></select>
          </div>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Сводка">
            <Kpi icon={<MapIcon size={16} />} label="Площадь полей" value={ha(rot.dirArea)} sub={`${rot.activeCount} действующих в справочнике`} testId="text-kpi-directory-area" />
            <Kpi icon={<Sprout size={16} />} label={`Под сезоном ${year}`} value={ha(rot.seasonArea)} sub={`${yearSeasons.length} сезонов, без двойного счёта`} testId="text-kpi-season-area" />
            <Kpi icon={<LandPlot size={16} />} label="Без плана" value={ha(rot.unplannedArea)} sub={`полей без сезона: ${rot.unplanned.length}`} testId="text-kpi-unplanned" />
            <Kpi icon={<Activity size={16} />} label="Работы, факт / план" value={`${ha(opStats.actualHa)}`} sub={`из ${ha(opStats.plannedHa)} га-операций · просрочено ${opStats.overdue}`} testId="text-kpi-work" />
          </section>
          {!manage && <p className="text-[11px] text-muted-foreground" data-testid="text-fields-readonly">{actual ? "Вы вносите фактическое выполнение. План и справочник ведут главный агроном и директора." : "Режим просмотра: ваша роль не вносит изменения."}</p>}
          {notice && <div className="notice-banner" role="status" data-testid="text-fields-notice">{notice}<button type="button" aria-label="Скрыть" onClick={() => setNotice("")} data-testid="button-dismiss-fields-notice">×</button></div>}

          <div className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Раздел">
            {([["overview", "Сводка"], ["rotation", "Севооборот"], ["operations", "Операции"], ["fields", "Справочник полей"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`tab-fields-${k}`}
                className={cx("rounded-md px-3 py-1.5 text-[11px] font-bold", view === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{l}</button>
            ))}
          </div>

          {view === "overview" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="surface-card min-w-0 p-4 sm:p-5" data-testid="section-crop-area">
                <h2 className="text-sm font-bold">Структура посевов {year}</h2>
                <p className="text-[11px] text-muted-foreground">Площадь сезонов по культурам — каждое поле учтено один раз. Справочник: {ha(rot.dirArea)}, под сезоном {ha(rot.seasonArea)}, без плана {ha(rot.unplannedArea)}.</p>
                {rot.crops.length === 0 ? <Empty icon={<Sprout size={18} />} title={`На ${year} год севооборот не задан`} text={manage ? "Добавьте сезоны полям — культура, сорт и площадь." : "Сезоны ещё не внесены."} testId="status-crop-empty" /> : <div className="mt-3"><CropAreaChart data={rot.crops} /></div>}
              </section>
              <section className="surface-card min-w-0 p-4 sm:p-5" data-testid="section-op-plan-fact">
                <h2 className="text-sm font-bold">План и факт по видам работ</h2>
                <p className="text-[11px] text-muted-foreground">В га-операций: повторные проходы по одному полю суммируются, это не уникальная площадь. Отменённые не учитываются.</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px]" data-testid="text-op-counts">
                  <span className="meta-chip">запланировано {opStats.planned}</span><span className="meta-chip">выполняется {opStats.inProgress}</span>
                  <span className="meta-chip">завершено {opStats.completed}</span><span className="meta-chip !border-destructive/30 !bg-destructive/5 !text-destructive">просрочено {opStats.overdue}</span>
                  {opStats.cancelled > 0 && <span className="meta-chip">отменено {opStats.cancelled}</span>}
                </div>
                {opStats.rows.length === 0 ? <Empty icon={<CalendarRange size={18} />} title="Операций нет" text="По выбранным фильтрам работы не запланированы." testId="status-opchart-empty" /> : (
                  <>
                    <div className="mt-3"><OpPlanFactChart data={opStats.rows} /></div>
                    <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[420px] text-[11px]"><thead className="text-left text-muted-foreground"><tr><th className="py-1.5 font-semibold">Работа</th><th className="text-right font-semibold">План, га-оп.</th><th className="text-right font-semibold">Факт, га-оп.</th><th className="text-right font-semibold">Заверш.</th></tr></thead>
                      <tbody className="divide-y divide-border/70 font-mono">{opStats.rows.map((r) => <tr key={r.name} data-testid={`row-opstat-${r.name}`}><td className="py-1.5 font-sans font-semibold">{r.name}</td><td className="text-right">{ha(r.planned)}</td><td className="text-right">{ha(r.actual)}</td><td className="text-right">{r.done}/{r.n}</td></tr>)}</tbody></table></div>
                  </>
                )}
              </section>
            </div>
          )}

          {view === "rotation" && (
            <section className="surface-card overflow-hidden" data-testid="section-rotation">
              <SectionHead title={`Севооборот ${year}`} text="Одна запись на поле и год. Предшественник — из предыдущей записи по полю." action={manage && <button type="button" className="button button-primary" onClick={() => setModal({ k: "season", season: null })} disabled={!fields.some((f) => f.isActive)} data-testid="button-new-season-rotation"><Plus size={14} />Сезон</button>} />
              {yearSeasons.length === 0 ? <Empty icon={<Layers size={18} />} title="Сезонов нет" text={fields.length === 0 ? "Сначала добавьте поля в справочник." : `На ${year} год по выбранным фильтрам сезонов нет.`} testId="status-rotation-empty" /> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs">
                  <thead className="border-b border-border bg-muted/20 text-left text-[10.5px] text-muted-foreground"><tr><th className="px-4 py-2 font-semibold">Поле</th><th className="font-semibold">Предшественник</th><th className="font-semibold">Культура · сорт</th><th className="text-right font-semibold">Площадь</th><th className="pl-4 font-semibold">Работы</th><th className="px-4" /></tr></thead>
                  <tbody className="divide-y divide-border/70">
                    {[...yearSeasons].sort((a, b) => byNum(fieldById.get(a.fieldId)!, fieldById.get(b.fieldId)!)).map((s) => {
                      const f = fieldById.get(s.fieldId); const p = prevOf.get(s.id);
                      const so = ops.filter((o) => o.seasonId === s.id && o.status !== "cancelled");
                      return (
                        <tr key={s.id} data-testid={`row-season-${s.id}`}>
                          <td className="px-4 py-2.5"><p className="font-mono font-bold">№ {f?.number}</p><p className="text-[10.5px] text-muted-foreground">{f?.unit}{f && !f.isActive ? " · архив" : ""}</p></td>
                          <td className="text-[11px]" data-testid={`text-season-predecessor-${s.id}`}>{p ? <>{p.cropName} <span className="text-muted-foreground">({p.year}{p.year !== s.year - 1 ? ", не подряд" : ""})</span></> : <span className="text-muted-foreground">нет записи</span>}</td>
                          <td><p className="font-semibold">{s.cropName}</p>{s.variety && <p className="text-[10.5px] text-muted-foreground">{s.variety}</p>}</td>
                          <td className="text-right font-mono">{ha(s.areaHa)}{f && s.areaHa < f.areaHa && <p className="text-[10px] text-muted-foreground">из {ha(f.areaHa)}</p>}</td>
                          <td className="pl-4 text-[11px] text-muted-foreground">{so.length ? `${so.filter((o) => o.status === "completed").length}/${so.length} заверш.` : "нет"}</td>
                          <td className="px-4"><div className="flex justify-end gap-1.5">
                            <button type="button" className="button button-secondary !min-h-[30px] !px-2" onClick={() => setModal({ k: "history", fieldId: s.fieldId })} aria-label="История поля" data-testid={`button-history-season-${s.id}`}><History size={13} /></button>
                            {manage && f?.isActive && <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={() => setModal({ k: "op", op: null, seasonId: s.id })} data-testid={`button-add-op-season-${s.id}`}><Plus size={13} />Работа</button>}
                            {manage && <button type="button" className="button button-secondary !min-h-[30px] !px-2" onClick={() => setModal({ k: "season", season: s })} aria-label="Изменить сезон" data-testid={`button-edit-season-${s.id}`}><Pencil size={13} /></button>}
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody></table></div>
              )}
              {rot.unplanned.length > 0 && (
                <div className="border-t border-border bg-muted/15 px-4 py-3 sm:px-5" data-testid="section-unplanned">
                  <p className="text-[11px] font-bold">Без сезона в {year}: {rot.unplanned.length} · {ha(rot.unplannedArea)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{rot.unplanned.map((f) => manage
                    ? <button key={f.id} type="button" className="meta-chip hover:bg-[hsl(203_87%_33%/.16)]" onClick={() => setModal({ k: "season", season: null, fieldId: f.id })} data-testid={`button-plan-field-${f.id}`}>№ {f.number} · {ha(f.areaHa)} +</button>
                    : <span key={f.id} className="meta-chip" data-testid={`text-unplanned-field-${f.id}`}>№ {f.number} · {ha(f.areaHa)}</span>)}</div>
                </div>
              )}
            </section>
          )}

          {view === "operations" && (
            <section className="surface-card overflow-hidden" data-testid="section-operations">
              <SectionHead title={`Полевые операции ${year}`} text="План задают руководители, факт — агрономы. Отменённые остаются в истории." action={manage && <button type="button" className="button button-primary" onClick={() => setModal({ k: "op", op: null })} disabled={seasons.length === 0} data-testid="button-new-operation-list"><Plus size={14} />Операция</button>} />
              {yearOps.length === 0 ? <Empty icon={<CalendarRange size={18} />} title="Операций нет" text={yearSeasons.length === 0 ? `Сначала задайте сезоны на ${year} год.` : "По выбранным фильтрам операций нет."} testId="status-operations-empty" /> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-xs">
                  <thead className="border-b border-border bg-muted/20 text-left text-[10.5px] text-muted-foreground"><tr><th className="px-4 py-2 font-semibold">Операция · поле</th><th className="font-semibold">Статус</th><th className="font-semibold">План</th><th className="font-semibold">Факт</th><th className="font-semibold">Выполнено</th><th className="px-4" /></tr></thead>
                  <tbody className="divide-y divide-border/70">
                    {[...yearOps].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.id - b.id).map((o) => {
                      const s = seasonById.get(o.seasonId); const f = s && fieldById.get(s.fieldId); const cancelled = o.status === "cancelled";
                      return (
                        <tr key={o.id} className={cx(cancelled && "opacity-60")} data-testid={`row-operation-${o.id}`}>
                          <td className="px-4 py-2.5"><p className="font-bold">{o.name}</p><p className="text-[10.5px] text-muted-foreground">№ {f?.number} · {s?.cropName} · {f?.unit}{o.responsible ? ` · ${o.responsible}` : ""}</p>
                            {cancelled && <p className="text-[10.5px] text-muted-foreground" data-testid={`text-void-reason-${o.id}`}>Отменил {o.voidedBy} {dateFmt(o.voidedAt)}: {o.voidReason}</p>}</td>
                          <td><StatusPill op={o} /></td>
                          <td className="font-mono text-[10.5px] leading-5">{dateFmt(o.plannedStart)} – {dateFmt(o.plannedEnd)}<br />{ha(o.plannedAreaHa)}</td>
                          <td className="font-mono text-[10.5px] leading-5">{dateFmt(o.actualStart)} – {dateFmt(o.actualEnd)}<br />{ha(o.actualAreaHa)}</td>
                          <td><Progress value={o.progressPercent} label={`Выполнено ${o.name}`} /></td>
                          <td className="px-4"><div className="flex justify-end gap-1.5">
                            {actual && !cancelled && <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={() => setModal({ k: "actual", op: o })} data-testid={`button-actual-op-${o.id}`}><Activity size={13} />Факт</button>}
                            {manage && !cancelled && <button type="button" className="button button-secondary !min-h-[30px] !px-2" onClick={() => setModal({ k: "op", op: o })} aria-label="Изменить план" data-testid={`button-edit-op-${o.id}`}><Pencil size={13} /></button>}
                            {gd && !cancelled && <button type="button" className="button button-danger border !min-h-[30px] !px-2" onClick={() => setModal({ k: "void", op: o })} aria-label="Отменить операцию" data-testid={`button-void-op-${o.id}`}><Ban size={13} /></button>}
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody></table></div>
              )}
            </section>
          )}

          {view === "fields" && (
            <section className="surface-card overflow-hidden" data-testid="section-agro-fields">
              <SectionHead title="Справочник полей" text={manage ? "№ поля, площадь и хозяйство. В архив переводит только генеральный директор; история сохраняется." : "Только просмотр."} action={manage && <button type="button" className="button button-primary" onClick={() => setModal({ k: "field", field: null })} data-testid="button-new-agro-field"><Plus size={14} />Поля</button>} />
              {scopeFields.length === 0 ? <Empty icon={<MapIcon size={18} />} title={fields.length ? "Ничего не найдено" : "Справочник пуст"} text={fields.length ? "Измените фильтры хозяйства или поля." : manage ? "Добавьте поля списком: номер и площадь для каждого." : "Поля ещё не внесены."} testId="status-agro-fields-empty" /> : (
                <ul className="divide-y divide-border/70">{scopeFields.map((f) => {
                  const fs = seasons.filter((s) => s.fieldId === f.id).sort((a, b) => b.year - a.year);
                  return (
                    <li key={f.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5", !f.isActive && "bg-muted/25")} data-testid={`row-agro-field-${f.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold"><span className="font-mono">№ {f.number}</span> · {ha(f.areaHa)} {!f.isActive && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground" data-testid={`status-agro-field-archived-${f.id}`}>архив</span>}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{f.unit}{fs.length ? ` · ${fs.slice(0, 4).map((s) => `${s.year}: ${s.cropName}`).join(" ← ")}` : " · сезонов нет"}</p>
                        {f.notes && <p className="truncate text-[10.5px] text-muted-foreground">{f.notes}</p>}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground">изм. {dateFmt(f.updatedAt)} · {f.updatedBy}</div>
                      <button type="button" className="button button-secondary !min-h-[32px] !px-2.5 text-[11px]" onClick={() => setModal({ k: "history", fieldId: f.id })} data-testid={`button-history-field-${f.id}`}><History size={13} />История</button>
                      {manage && (f.isActive || gd) && <button type="button" className="button button-secondary !min-h-[32px] !px-2.5" onClick={() => setModal({ k: "field", field: f })} aria-label={`Изменить поле ${f.number}`} data-testid={`button-edit-agro-field-${f.id}`}><Pencil size={13} /></button>}
                    </li>
                  );
                })}</ul>
              )}
            </section>
          )}

          {modal?.k === "field" && <FieldForm role={role} field={modal.field} fields={fields} defaultUnit={unit === "all" ? UNITS[0] : unit} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "season" && <SeasonForm season={modal.season} fields={fields} seasons={seasons} cropSuggestions={d.cropSuggestions} defaultYear={year} defaultFieldId={modal.fieldId ?? (fieldF !== "all" ? Number(fieldF) : undefined)} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "op" && <OperationForm op={modal.op} seasons={seasons} fields={fields} defaultSeasonId={modal.seasonId ?? yearSeasons[0]?.id} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "actual" && <ActualForm op={modal.op} title={opTitle(modal.op)} today={today} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "void" && <VoidDialog op={modal.op} title={opTitle(modal.op)} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "history" && fieldById.get(modal.fieldId) && <FieldHistory field={fieldById.get(modal.fieldId)!} seasons={seasons} ops={ops} onClose={() => setModal(null)} />}
        </>
      )}
    </div>
  );
}

function FieldHistory({ field, seasons, ops, onClose }: { field: AgroField; seasons: FieldSeason[]; ops: FieldOperation[]; onClose: () => void }) {
  const list = seasons.filter((s) => s.fieldId === field.id).sort((a, b) => b.year - a.year);
  return (
    <Drawer title={`История поля № ${field.number}`} eyebrow={`${field.unit} · ${ha(field.areaHa)}${field.isActive ? "" : " · архив"}`} onClose={onClose} testId="drawer-field-history"
      footer={<button type="button" className="button button-secondary" onClick={onClose} data-testid="button-close-history">Закрыть</button>}>
      {field.notes && <p className="text-xs text-muted-foreground">{field.notes}</p>}
      {list.length === 0 ? <Empty icon={<History size={18} />} title="Истории пока нет" text="По полю не внесено ни одного сезона." testId="status-history-empty" /> : (
        <ol className="space-y-4">{list.map((s, i) => {
          const so = ops.filter((o) => o.seasonId === s.id).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
          const prev = list[i + 1];
          return (
            <li key={s.id} className="rounded-xl border border-border p-3.5" data-testid={`history-season-${s.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold"><span className="font-mono">{s.year}</span> · {s.cropName}{s.variety ? ` · ${s.variety}` : ""}</p>
                <span className="font-mono text-[11px]">{ha(s.areaHa)}</span>
              </div>
              <p className="text-[10.5px] text-muted-foreground">Предшественник: {prev ? `${prev.cropName} (${prev.year})` : "нет записи"} · изм. {dateFmt(s.updatedAt)} · {s.updatedBy}</p>
              {s.notes && <p className="mt-1 text-[11px]">{s.notes}</p>}
              {so.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">Операций нет.</p> : (
                <ul className="mt-2 divide-y divide-border/60 border-t border-border/60">{so.map((o) => (
                  <li key={o.id} className="py-2 text-[11px]" data-testid={`history-op-${o.id}`}>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{o.name}</span><StatusPill op={o} /></div>
                    <p className="font-mono text-[10.5px] text-muted-foreground">план {dateFmt(o.plannedStart)} – {dateFmt(o.plannedEnd)} · {ha(o.plannedAreaHa)} | факт {dateFmt(o.actualStart)} – {dateFmt(o.actualEnd)} · {ha(o.actualAreaHa)}</p>
                    {o.responsible && <p className="text-muted-foreground">Ответственный: {o.responsible}</p>}
                    {o.notes && <p>План: {o.notes}</p>}
                    {o.actualNotes && <p>Факт: {o.actualNotes}</p>}
                    {o.voidedAt && <p className="text-destructive">Отменена {dateFmt(o.voidedAt)} · {o.voidedBy}: {o.voidReason}</p>}
                  </li>
                ))}</ul>
              )}
            </li>
          );
        })}</ol>
      )}
    </Drawer>
  );
}

function SectionHead({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div><h2 className="text-sm font-bold">{title}</h2><p className="text-[11px] text-muted-foreground">{text}</p></div>{action || null}
    </div>
  );
}

function Empty({ icon, title, text, testId }: { icon: ReactNode; title: string; text: string; testId: string }) {
  return <div className="empty-state !min-h-[180px]" data-testid={testId}><div className="empty-icon">{icon}</div><h3 className="mt-3 text-sm font-bold">{title}</h3><p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{text}</p></div>;
}

function Kpi({ icon, label, value, sub, testId }: { icon: ReactNode; label: string; value: string; sub: string; testId: string }) {
  return (
    <div className="surface-card min-w-0 p-3.5 sm:p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">{icon}<span className="truncate">{label}</span></div>
      <p className="mt-2 truncate font-mono text-lg font-bold" title={value} data-testid={testId}>{value}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground" title={sub}>{sub}</p>
    </div>
  );
}
