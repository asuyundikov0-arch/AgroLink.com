import { type ReactNode, useMemo, useState } from "react";
import { Activity, Ban, CalendarRange, History, LandPlot, Layers, Pencil, Plus, RefreshCw, Sprout, TriangleAlert } from "lucide-react";
import { type AgroField, type FieldOperation, type FieldSeason, getGetFieldDashboardQueryKey, getListFleetEquipmentQueryKey, useGetFieldDashboard, useListFleetEquipment } from "@workspace/api-client-react";
import { ActualForm, FieldForm, OperationForm, ProgressForm, SeasonForm, VoidDialog } from "./Forms";
import { CropAreaChart } from "./Charts";
import { Drawer, POLL_MS, Progress, StatusPill, UNITS, type Unit, canActual, canManage, cx, dateFmt, errorInfo, ha, isGD, sumHa } from "./shared";

type View = "history" | "plan" | "inProgress" | "completed";
type Modal =
  | { k: "field"; field: AgroField | null }
  | { k: "season"; season: FieldSeason | null; fieldId?: number }
  | { k: "op"; op: FieldOperation | null; seasonId?: number }
  | { k: "actual"; op: FieldOperation }
  | { k: "progress"; op: FieldOperation }
  | { k: "void"; op: FieldOperation }
  | { k: "history"; fieldId: number };

const READ_ROLES = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"];
const byNum = (a: AgroField, b: AgroField) => a.unit.localeCompare(b.unit) || a.number.localeCompare(b.number, "ru", { numeric: true });

export default function FieldsWorkspace({ role }: { role: string }) {
  const allowed = READ_ROLES.includes(role);
  const q = useGetFieldDashboard({ query: { queryKey: getGetFieldDashboardQueryKey(), refetchInterval: POLL_MS, enabled: allowed } });
  const fleetQ = useListFleetEquipment({ query: { queryKey: getListFleetEquipmentQueryKey(), refetchInterval: POLL_MS, enabled: allowed } });
  const fleet = fleetQ.data ?? [];
  const d = q.data;
  const today = d?.asOfDate.slice(0, 10) ?? "";
  const baseYear = today ? Number(today.slice(0, 4)) : 0;
  const [yearSel, setYearSel] = useState<number | null>(null);
  const year = yearSel ?? baseYear;
  const [unit, setUnit] = useState<Unit | "all">("all");
  const [view, setView] = useState<View>("history");
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

  const scopeFields = useMemo(() => fields.filter((f) => unit === "all" || f.unit === unit), [fields, unit]);
  const scopeIds = useMemo(() => new Set(scopeFields.map((f) => f.id)), [scopeFields]);
  const yearSeasons = useMemo(() => seasons.filter((s) => s.year === year && scopeIds.has(s.fieldId)), [seasons, year, scopeIds]);
  const yearSeasonIds = useMemo(() => new Set(yearSeasons.map((s) => s.id)), [yearSeasons]);
  const yearOps = useMemo(() => ops.filter((o) => yearSeasonIds.has(o.seasonId)), [ops, yearSeasonIds]);
  const visibleOps = useMemo(() => yearOps.filter((o) => o.status === (view === "plan" ? "planned" : view === "inProgress" ? "in_progress" : "completed")), [yearOps, view]);

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
      seasonArea: sumHa(yearSeasons.map((s) => s.areaHa)), unplanned, unplannedArea: sumHa(unplanned.map((f) => f.areaHa)),
      crops: [...byCrop].map(([crop, area]) => ({ crop, area })).sort((a, b) => b.area - a.area),
    };
  }, [scopeFields, yearSeasons]);

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
          <p className="eyebrow">Агрономия · история полей и сезонные операции</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Полевые работы</h1>
          <p className="mt-1 text-xs text-muted-foreground">{d ? <>На {dateFmt(d.asOfDate)} · гектары, до 0,01 · обновление каждые 30 с</> : "История полей и план-факт работ"}
            {q.isFetching && !q.isLoading && <span className="ml-2 inline-flex items-center gap-1 text-[hsl(203_87%_33%)]"><RefreshCw size={11} className="animate-spin" />синхронизация</span>}</p>
        </div>
      </header>

      {q.isLoading ? (
        <div className="space-y-4" data-testid="status-fields-loading"><div className="grid gap-3 lg:grid-cols-2"><div className="skeleton h-[120px] rounded-xl" /><div className="skeleton h-64 rounded-xl" /></div><div className="skeleton h-64 rounded-xl" /></div>
      ) : q.isError || !d ? (
        <div className="surface-card empty-state" data-testid="status-fields-error"><div className="empty-icon empty-icon-error"><TriangleAlert size={20} /></div><h3 className="mt-4 text-sm font-bold">Не удалось загрузить поля</h3><p className="mt-1 text-xs text-muted-foreground">{errorInfo(q.error).message}</p>
          <button type="button" className="button button-secondary mt-4" onClick={() => q.refetch()} data-testid="button-fields-retry">Повторить</button></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Фильтры">
            <select aria-label="Год" className="text-input !w-auto font-mono" value={year} onChange={(e) => setYearSel(Number(e.target.value))} data-testid="select-fields-year">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <select aria-label="Хозяйство" className="text-input !w-auto" value={unit} onChange={(e) => setUnit(e.target.value as Unit | "all")} data-testid="select-fields-unit"><option value="all">Все хозяйства</option>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>

          <section className="grid gap-3 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.6fr)]" aria-label="Сводка по площадям">
            <Kpi icon={<LandPlot size={16} />} label="Общая площадь в обработке" value={ha(rot.seasonArea)} sub="Площадь полей по сезонному плану, без двойного счёта" testId="text-kpi-season-area" />
            <section className="surface-card min-w-0 p-4 sm:p-5" data-testid="section-crop-area">
              <div className="flex items-baseline justify-between gap-2"><h2 className="text-sm font-bold">Площадь по культурам</h2><span className="text-[10.5px] text-muted-foreground">{year}</span></div>
              {rot.crops.length === 0 ? <Empty icon={<Sprout size={18} />} title={`На ${year} год культур нет`} text="Добавьте севооборот в истории поля." testId="status-crop-empty" /> : <div className="mt-2"><CropAreaChart data={rot.crops} /></div>}
            </section>
          </section>
          {!manage && <p className="text-[11px] text-muted-foreground" data-testid="text-fields-readonly">{actual ? "Вы можете вносить факт в истории поля. Сезоны и планы ведут главный агроном и директора." : "Режим просмотра: ваша роль не вносит изменения."}</p>}
          {notice && <div className="notice-banner" role="status" data-testid="text-fields-notice">{notice}<button type="button" aria-label="Скрыть" onClick={() => setNotice("")} data-testid="button-dismiss-fields-notice">×</button></div>}

          <div className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Раздел">
            {([["history", "История полей"], ["plan", "План агроопераций на сезон"], ["inProgress", "Операции в процессе"], ["completed", "Завершённые операции"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`tab-fields-${k}`}
                className={cx("rounded-md px-3 py-1.5 text-[11px] font-bold", view === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{l}</button>
            ))}
          </div>

          {view === "history" && (
            <section className="surface-card overflow-hidden" data-testid="section-rotation">
              <SectionHead title={`История полей · ${year}`} text="План севооборота и операции добавляются в истории конкретного поля." action={manage && <div className="flex flex-wrap gap-2"><button type="button" className="button button-secondary" onClick={() => setModal({ k: "field", field: null })} data-testid="button-new-agro-field"><Plus size={14} />Новое поле</button><button type="button" className="button button-primary" onClick={() => setModal({ k: "season", season: null, fieldId: scopeFields.find((f) => f.isActive)?.id })} disabled={!scopeFields.some((f) => f.isActive)} data-testid="button-new-season-rotation"><Plus size={14} />Севооборот</button></div>} />
              {yearSeasons.length === 0 ? <Empty icon={<Layers size={18} />} title="Сезонов нет" text={fields.length === 0 ? manage ? "Добавьте поля прямо в истории полей." : "Поля пока не внесены." : `На ${year} год по выбранным фильтрам сезонов нет.`} testId="status-rotation-empty" /> : (
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
                            <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={() => setModal({ k: "history", fieldId: s.fieldId })} aria-label="История поля" data-testid={`button-history-season-${s.id}`}><History size={13} />История</button>
                            {manage && f?.isActive && <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={() => setModal({ k: "op", op: null, seasonId: s.id })} data-testid={`button-add-op-season-${s.id}`}><Plus size={13} />План операции</button>}
                            {manage && <button type="button" className="button button-secondary !min-h-[30px] !px-2" onClick={() => setModal({ k: "season", season: s })} aria-label="Изменить сезон" data-testid={`button-edit-season-${s.id}`}><Pencil size={13} /></button>}
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody></table></div>
              )}
              {rot.unplanned.length > 0 && (
                <div className="border-t border-border bg-muted/15 px-4 py-3 sm:px-5" data-testid="section-unplanned">
                  <p className="text-[11px] font-bold">Поля без сезонного плана на {year}: {rot.unplanned.length} · {ha(rot.unplannedArea)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{rot.unplanned.map((f) => <div key={f.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                    <button type="button" className="text-[10.5px] font-semibold hover:text-[hsl(203_87%_33%)]" onClick={() => setModal({ k: "history", fieldId: f.id })} data-testid={`button-history-unplanned-field-${f.id}`}>№ {f.number} · {ha(f.areaHa)}</button>
                    {manage && <button type="button" className="rounded-full px-1 text-[11px] font-bold hover:bg-muted" aria-label={`Добавить севооборот для поля ${f.number}`} onClick={() => setModal({ k: "season", season: null, fieldId: f.id })} data-testid={`button-plan-field-${f.id}`}>+</button>}
                  </div>)}</div>
                </div>
              )}
            </section>
          )}

          {view !== "history" && (
            <section className="surface-card overflow-hidden" data-testid="section-operations">
              <SectionHead
                title={view === "plan" ? `План агроопераций на сезон · ${year}` : view === "inProgress" ? `Операции в процессе · ${year}` : `Завершённые операции · ${year}`}
                text={view === "plan" ? "Создание и изменение планов доступно только в истории поля." : "Откройте историю поля, чтобы внести или исправить факт."}
              />
              {visibleOps.length === 0 ? <Empty icon={<CalendarRange size={18} />} title={view === "plan" ? "Плановых операций нет" : view === "inProgress" ? "Операций в процессе нет" : "Завершённых операций нет"} text={view === "plan" ? "Добавьте план из истории соответствующего поля." : "Операции появятся здесь после обновления их статуса в истории поля."} testId="status-operations-empty" /> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-xs">
                  <thead className="border-b border-border bg-muted/20 text-left text-[10.5px] text-muted-foreground"><tr><th className="px-4 py-2 font-semibold">Операция · поле</th><th className="font-semibold">Статус</th><th className="font-semibold">План · техника</th><th className="font-semibold">Факт · исполнитель</th><th className="font-semibold">Выполнено</th><th className="px-4" /></tr></thead>
                  <tbody className="divide-y divide-border/70">
                    {[...visibleOps].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.id - b.id).map((o) => {
                      const s = seasonById.get(o.seasonId); const f = s && fieldById.get(s.fieldId);
                      return (
                        <tr key={o.id} data-testid={`row-operation-${o.id}`}>
                          <td className="px-4 py-2.5"><p className="font-bold">{o.name}</p>{o.actualOperationName && o.actualOperationName !== o.name && <p className="text-[10.5px] text-muted-foreground">Факт: {o.actualOperationName}</p>}<p className="text-[10.5px] text-muted-foreground">№ {f?.number} · {s?.cropName} · {f?.unit}{o.responsible ? ` · ${o.responsible}` : ""}</p>
                          </td>
                          <td><StatusPill op={o} /></td>
                          <td className="text-[10.5px] leading-5"><span className="font-mono">{dateFmt(o.plannedStart)} – {dateFmt(o.plannedEnd)}<br />{ha(o.plannedAreaHa)}</span>{o.plannedEquipment && <p>Техника: {o.plannedEquipment}</p>}{o.plannedImplement && <p className="text-muted-foreground">Агрегат: {o.plannedImplement}</p>}</td>
                          <td className="text-[10.5px] leading-5"><span className="font-mono">{dateFmt(o.actualStart)} – {dateFmt(o.actualEnd)}<br />{ha(o.actualAreaHa)}</span>{o.actualStart && <><p>{o.actualMechanic}</p><p className="text-muted-foreground">{o.actualEquipment}{o.actualImplement ? ` · ${o.actualImplement}` : ""}</p></>}{o.progressReports.at(-1) && <p className="text-muted-foreground">Отчёт {dateFmt(o.progressReports.at(-1)!.reportDate)} · +{ha(o.progressReports.at(-1)!.dailyAreaHa)}</p>}</td>
                          <td><Progress value={o.progressPercent} label={`Выполнено ${o.name}`} /></td>
                          <td className="px-4"><div className="flex justify-end gap-1.5">
                            {f && <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={() => setModal({ k: "history", fieldId: f.id })} data-testid={`button-open-history-op-${o.id}`}><History size={13} />История поля</button>}
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody></table></div>
              )}
            </section>
          )}

          {modal?.k === "field" && <FieldForm role={role} field={modal.field} fields={fields} defaultUnit={unit === "all" ? UNITS[0] : unit} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "season" && <SeasonForm season={modal.season} fields={fields} seasons={seasons} cropSuggestions={d.cropSuggestions} defaultYear={year} defaultFieldId={modal.fieldId} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "op" && <OperationForm op={modal.op} seasons={seasons} fields={fields} fleet={fleet} fleetLoading={fleetQ.isLoading} fleetError={fleetQ.isError} onRetry={() => { void fleetQ.refetch(); }} defaultSeasonId={modal.seasonId ?? yearSeasons[0]?.id} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "actual" && <ActualForm op={modal.op} title={opTitle(modal.op)} today={today} fleet={fleet} fleetLoading={fleetQ.isLoading} fleetError={fleetQ.isError} onRetry={() => { void fleetQ.refetch(); }} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "progress" && <ProgressForm op={modal.op} title={opTitle(modal.op)} today={today} fleet={fleet} fleetLoading={fleetQ.isLoading} fleetError={fleetQ.isError} onRetry={() => { void fleetQ.refetch(); }} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "void" && <VoidDialog op={modal.op} title={opTitle(modal.op)} onClose={() => setModal(null)} onDone={done} />}
          {modal?.k === "history" && fieldById.get(modal.fieldId) && <FieldHistory
            field={fieldById.get(modal.fieldId)!} role={role} seasons={seasons} ops={ops} onClose={() => setModal(null)}
            onAddSeason={(fieldId) => setModal({ k: "season", season: null, fieldId })}
            onAddOperation={(seasonId) => setModal({ k: "op", op: null, seasonId })}
            onEditSeason={(season) => setModal({ k: "season", season, fieldId: season.fieldId })}
            onEditField={(field) => setModal({ k: "field", field })}
            onEditOperation={(op) => setModal({ k: "op", op })}
            onActual={(op) => setModal({ k: "actual", op })}
            onProgress={(op) => setModal({ k: "progress", op })}
            onVoid={(op) => setModal({ k: "void", op })}
          />}
        </>
      )}
    </div>
  );
}

function FieldHistory({ field, role, seasons, ops, onClose, onAddSeason, onAddOperation, onEditSeason, onEditField, onEditOperation, onActual, onProgress, onVoid }: {
  field: AgroField;
  role: string;
  seasons: FieldSeason[];
  ops: FieldOperation[];
  onClose: () => void;
  onAddSeason: (fieldId: number) => void;
  onAddOperation: (seasonId: number) => void;
  onEditSeason: (season: FieldSeason) => void;
  onEditField: (field: AgroField) => void;
  onEditOperation: (op: FieldOperation) => void;
  onActual: (op: FieldOperation) => void;
  onProgress: (op: FieldOperation) => void;
  onVoid: (op: FieldOperation) => void;
}) {
  const list = seasons.filter((s) => s.fieldId === field.id).sort((a, b) => b.year - a.year);
  const manage = canManage(role);
  const actual = canActual(role);
  const gd = isGD(role);
  return (
    <Drawer title={`История поля № ${field.number}`} eyebrow={`${field.unit} · ${ha(field.areaHa)}${field.isActive ? "" : " · архив"}`} onClose={onClose} testId="drawer-field-history"
      footer={<div className="flex w-full flex-wrap justify-between gap-2">{manage && <div className="flex flex-wrap gap-2"><button type="button" className="button button-secondary" onClick={() => onEditField(field)} data-testid={`button-edit-field-history-${field.id}`}><Pencil size={13} />Изменить поле</button>{field.isActive && <button type="button" className="button button-primary" onClick={() => onAddSeason(field.id)} data-testid={`button-add-season-history-${field.id}`}><Plus size={14} />Добавить сезон</button>}</div>}<button type="button" className="button button-secondary" onClick={onClose} data-testid="button-close-history">Закрыть</button></div>}>
      {field.notes && <p className="text-xs text-muted-foreground">{field.notes}</p>}
      {list.length === 0 ? <Empty icon={<History size={18} />} title="Истории пока нет" text={manage && field.isActive ? "Добавьте сезон, чтобы записать культуру и плановые операции." : "По полю ещё не внесено ни одного сезона."} testId="status-history-empty" /> : (
        <ol className="space-y-4">{list.map((s, i) => {
          const so = ops.filter((o) => o.seasonId === s.id).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
          const prev = list[i + 1];
          return (
            <li key={s.id} className="rounded-xl border border-border p-3.5" data-testid={`history-season-${s.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold"><span className="font-mono">{s.year}</span> · {s.cropName}{s.variety ? ` · ${s.variety}` : ""}</p>
                <div className="flex items-center gap-2"><span className="font-mono text-[11px]">{ha(s.areaHa)}</span>{manage && <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => onEditSeason(s)} data-testid={`button-edit-season-history-${s.id}`}><Pencil size={12} />Изменить сезон</button>}</div>
              </div>
              <p className="text-[10.5px] text-muted-foreground">Предшественник: {prev ? `${prev.cropName} (${prev.year})` : "нет записи"} · изм. {dateFmt(s.updatedAt)} · {s.updatedBy}</p>
              {s.notes && <p className="mt-1 text-[11px]">{s.notes}</p>}
              {manage && field.isActive && <button type="button" className="button button-secondary mt-2 !min-h-[30px] !px-2 text-[11px]" onClick={() => onAddOperation(s.id)} data-testid={`button-add-operation-history-${s.id}`}><Plus size={13} />План операции</button>}
              {so.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">Операций нет.</p> : (
                <ul className="mt-2 divide-y divide-border/60 border-t border-border/60">{so.map((o) => (
                  <li key={o.id} className="py-2 text-[11px]" data-testid={`history-op-${o.id}`}>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{o.name}</span><StatusPill op={o} /></div>
                    <p className="font-mono text-[10.5px] text-muted-foreground">план {dateFmt(o.plannedStart)} – {dateFmt(o.plannedEnd)} · {ha(o.plannedAreaHa)} | факт {dateFmt(o.actualStart)} – {dateFmt(o.actualEnd)} · {ha(o.actualAreaHa)}</p>
                    {(o.plannedEquipment || o.plannedImplement) && <p className="text-muted-foreground">Плановая техника: {o.plannedEquipment || "не указана"} · агрегат: {o.plannedImplement || "не указан"}</p>}
                    {o.actualStart && <p>Факт: {o.actualOperationName || o.name} · механизатор {o.actualMechanic || "не указан"} · {o.actualEquipment || "техника не указана"} · {o.actualImplement || "агрегат не указан"}</p>}
                    {o.progressReports.length > 0 && <div className="mt-1 rounded-md bg-muted/30 px-2.5 py-2" data-testid={`history-progress-${o.id}`}><p className="font-semibold">Дневные отчёты</p><ul className="mt-1 space-y-1">{[...o.progressReports].reverse().map((report) => <li key={report.id}>{dateFmt(report.reportDate)} · +{ha(report.dailyAreaHa)} · итого {ha(report.cumulativeAreaHa)} · {report.actualMechanic} · {report.actualEquipment}{report.actualImplement ? ` · ${report.actualImplement}` : ""}</li>)}</ul></div>}
                    {o.responsible && <p className="text-muted-foreground">Ответственный: {o.responsible}</p>}
                    {o.notes && <p>План: {o.notes}</p>}
                    {o.actualNotes && <p>Факт: {o.actualNotes}</p>}
                    {o.voidedAt && <p className="text-destructive">Отменена {dateFmt(o.voidedAt)} · {o.voidedBy}: {o.voidReason}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {manage && o.status !== "cancelled" && <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => onEditOperation(o)} data-testid={`button-edit-operation-history-${o.id}`}><Pencil size={12} />Изменить план</button>}
                      {actual && o.status !== "cancelled" && !o.actualStart && <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => onActual(o)} data-testid={`button-start-operation-history-${o.id}`}><Activity size={12} />Начать</button>}
                      {actual && o.status !== "cancelled" && !!o.actualStart && !o.actualEnd && <>
                        <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => onProgress(o)} data-testid={`button-progress-operation-history-${o.id}`}><Activity size={12} />Отчёт</button>
                        <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => onActual(o)} data-testid={`button-finish-operation-history-${o.id}`}>Завершить</button>
                      </>}
                      {actual && o.status !== "cancelled" && !!o.actualEnd && <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => onActual(o)} data-testid={`button-edit-actual-history-${o.id}`}><Activity size={12} />Изменить факт</button>}
                      {gd && o.status !== "cancelled" && <button type="button" className="button button-danger border !min-h-[28px] !px-2 text-[10px]" onClick={() => onVoid(o)} data-testid={`button-cancel-operation-history-${o.id}`}><Ban size={12} />Отменить</button>}
                    </div>
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
