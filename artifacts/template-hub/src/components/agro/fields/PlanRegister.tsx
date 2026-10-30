import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight, History, Pencil, Plus } from "lucide-react";
import type { AgroField, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { SeedPlanSummary } from "./SeedPlanEditor";
import { SupportingWorksSummary } from "./SupportingWorksEditor";
import { ChemicalSeasonCost } from "../ChemicalWarehouse";
import { StatusPill, cx, dateFmt, ha } from "./shared";

const kzt = (v: number | null | undefined) => v == null ? "—" : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(v)} ₸`;

/** Latest season of the same field strictly before `year`. */
export function predecessorOf(seasons: FieldSeason[], fieldId: number, year: number): FieldSeason | undefined {
  return seasons.filter((s) => s.fieldId === fieldId && s.year < year).sort((a, b) => b.year - a.year || b.id - a.id)[0];
}

const PALETTE: Record<string, number> = { "пшениц": 38, "ячмен": 28, "рапс": 130, "лен": 214, "лён": 214, "чечевиц": 8, "подсолнеч": 45, "овес": 90, "овёс": 90, "горох": 140, "кукуруз": 58, "нут": 22, "гречих": 330, "пар": 0 };
/** Stable hue per crop name: known crops get fixed hues, others hashed. */
export function cropHue(crop: string): number {
  const c = crop.toLowerCase();
  for (const [k, h] of Object.entries(PALETTE)) if (c.includes(k)) return h;
  let x = 0; for (const ch of c) x = (x * 31 + ch.charCodeAt(0)) % 360;
  return x;
}
export const cropStyle = (crop: string) => {
  const h = cropHue(crop);
  return { badge: { background: `hsl(${h} 70% 92%)`, color: `hsl(${h} 55% 26%)`, borderColor: `hsl(${h} 50% 78%)` }, row: { background: `hsl(${h} 55% 45% / .12)`, boxShadow: `inset 3px 0 0 hsl(${h} 55% 55%)` } };
};

export function CropBadge({ crop }: { crop: string }) {
  return <span className="inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-[11px] font-semibold" style={cropStyle(crop).badge}>{crop}</span>;
}

const activeOps = (ops: FieldOperation[], seasonId: number) => ops.filter((o) => o.seasonId === seasonId && o.status !== "cancelled" && !o.isUnplanned);

type ListProps = { year: number; unitAll: boolean; fields: AgroField[]; yearSeasons: FieldSeason[]; seasons: FieldSeason[]; ops: FieldOperation[]; onOpen: (id: number) => void; header: ReactNode; empty: ReactNode };

export function PlanFieldsList({ year, unitAll, fields, yearSeasons, seasons, ops, onOpen, header, empty }: ListProps) {
  return (
    <section className="surface-card overflow-hidden" data-testid="section-plan-fields">
      {header}
      {fields.length === 0 ? empty : (
        <div role="table" aria-label={`Поля · ${year}`} className="text-xs">
          <div role="row" className="hidden grid-cols-[72px_96px_minmax(140px,1.2fr)_minmax(130px,1fr)_92px_132px] gap-3 border-b border-border bg-muted/20 px-4 py-2 text-[10.5px] font-semibold text-muted-foreground xl:grid">
            <span role="columnheader">№ поля</span><span role="columnheader" className="text-right">Площадь</span><span role="columnheader">Культура</span><span role="columnheader">Предшественник</span><span role="columnheader" className="text-right">Операций</span><span role="columnheader" />
          </div>
          <div className="divide-y divide-border/70">
            {fields.map((f) => {
              const s = yearSeasons.find((x) => x.fieldId === f.id);
              const p = predecessorOf(seasons, f.id, year);
              const n = s ? activeOps(ops, s.id).length : 0;
              return (
                <div role="row" key={f.id} data-testid={`row-plan-field-${f.id}`} style={s ? cropStyle(s.cropName).row : { boxShadow: "inset 3px 0 0 hsl(var(--border))" }}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 xl:grid-cols-[72px_96px_minmax(140px,1.2fr)_minmax(130px,1fr)_92px_132px] xl:gap-3">
                  <div role="cell" className="font-mono text-sm font-bold">№ {f.number}{(unitAll || !f.isActive) && <p className="font-sans text-[10px] font-normal text-muted-foreground">{unitAll ? f.unit : ""}{!f.isActive ? `${unitAll ? " · " : ""}архив` : ""}</p>}</div>
                  <div role="cell" className="order-3 col-span-3 font-mono text-[11px] xl:order-none xl:col-span-1 xl:text-right"><span className="text-muted-foreground xl:hidden">Площадь: </span>{ha(s?.areaHa ?? f.areaHa)}{s && s.areaHa < f.areaHa && <span className="block text-[10px] text-muted-foreground">из {ha(f.areaHa)}</span>}</div>
                  <div role="cell" className="min-w-0">{s ? <><CropBadge crop={s.cropName} />{s.variety && <span className="ml-1.5 text-[10.5px] text-muted-foreground">{s.variety}</span>}</> : <span className="text-[11px] text-muted-foreground">Севооборот не задан</span>}</div>
                  <div role="cell" className="order-4 col-span-3 text-[11px] xl:order-none xl:col-span-1" data-testid={`text-plan-predecessor-${f.id}`}><span className="text-muted-foreground xl:hidden">Предшественник: </span>{p ? <>{p.cropName} <span className="text-muted-foreground">({p.year})</span></> : <span className="text-muted-foreground">Нет данных</span>}</div>
                  <div role="cell" className="order-5 col-span-3 text-[11px] text-muted-foreground xl:order-none xl:col-span-1 xl:text-right">{n ? <span className="font-mono text-foreground">{n}</span> : "нет"}<span className="xl:hidden"> операций</span></div>
                  <div role="cell" className="flex justify-end">
                    <button type="button" onClick={() => onOpen(f.id)} data-testid={`button-plan-open-field-${f.id}`} className="button button-secondary !min-h-[30px] !px-2.5 text-[11px]">План работ<ChevronRight size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

type Machine = { equipment: string; employee: string; implement: string };
export function machinesOf(o: FieldOperation): Machine[] {
  if (o.plannedAssignments?.length) return o.plannedAssignments.map((r) => ({ equipment: r.equipmentName || `Техника №${r.equipmentId}`, employee: r.employeeName || `Сотрудник №${r.employeeId}`, implement: r.implement || "" }));
  return [{ equipment: o.plannedEquipment || "", employee: o.responsible || "", implement: o.plannedImplement || "" }];
}

const dash = (v: string, t = "не указан") => v || <span className="text-muted-foreground">{t}</span>;
const COLS = "xl:grid-cols-[150px_minmax(140px,1fr)_minmax(130px,1fr)_minmax(130px,1fr)_minmax(110px,0.9fr)_96px]";

type ScheduleProps = { field: AgroField; season?: FieldSeason; predecessor?: FieldSeason; year: number; ops: FieldOperation[]; manage: boolean;
  onBack: () => void; onHistory: () => void; onAddOp: () => void; onAddSeason: () => void; onEditOp: (o: FieldOperation) => void; noSeason: ReactNode; noOps: ReactNode };

export function PlanFieldSchedule({ field: pf, season: s, predecessor: p, ops, year, manage, onBack, onHistory, onAddOp, onAddSeason, onEditOp, noSeason, noOps }: ScheduleProps) {
  const so = s ? activeOps(ops, s.id).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.id - b.id) : [];
  return (
    <section className="surface-card overflow-hidden" data-testid="section-plan-field-schedule">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5" style={s ? cropStyle(s.cropName).row : undefined}>
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={onBack} data-testid="button-plan-back-fields"><ArrowLeft size={13} />К полям</button>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold">Поле № {pf.number} · {year}{s ? <CropBadge crop={s.cropName} /> : <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Севооборот не задан</span>}</h2>
            <p className="text-[11px] text-muted-foreground">{pf.unit}{s?.variety ? ` · ${s.variety}` : ""} · {ha(s?.areaHa ?? pf.areaHa)} · предшественник: {p ? `${p.cropName} (${p.year})` : "Нет данных"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="button button-secondary !min-h-[30px] !px-2 text-[11px]" onClick={onHistory} data-testid={`button-plan-history-field-${pf.id}`}><History size={13} />История поля</button>
          {manage && s && pf.isActive && <button type="button" className="button button-primary !min-h-[30px] !px-2 text-[11px]" onClick={onAddOp} data-testid={`button-plan-add-op-${pf.id}`}><Plus size={13} />План операции</button>}
          {manage && !s && pf.isActive && <button type="button" className="button button-primary !min-h-[30px] !px-2 text-[11px]" onClick={onAddSeason} data-testid={`button-plan-add-season-${pf.id}`}><Plus size={13} />Севооборот</button>}
        </div>
      </div>
      {s && <div className="border-b border-border px-4 py-2.5 sm:px-5"><ChemicalSeasonCost seasonId={s.id} /></div>}
      {!s ? noSeason : so.length === 0 ? noOps : (
        <div className="text-xs">
          <div className={cx("hidden gap-3 border-b border-border bg-muted/20 px-4 py-2 text-[10.5px] font-semibold text-muted-foreground xl:grid", COLS)}>
            <span>Начало – окончание</span><span>Операция</span><span>Механизатор</span><span>Техника</span><span>Агрегат</span><span />
          </div>
          <div className="divide-y divide-border">
            {so.map((o) => {
              const ms = machinesOf(o);
              return (
                <div key={o.id} data-testid={`row-plan-op-${o.id}`} className="px-4 py-3">
                  <div className={cx("grid grid-cols-1 gap-x-3 gap-y-1.5", COLS)}>
                    <div className="font-mono text-[11px] font-semibold">{dateFmt(o.plannedStart)} – {dateFmt(o.plannedEnd)}</div>
                    <div className="min-w-0"><p className="font-bold">{o.name}</p><div className="mt-0.5"><StatusPill op={o} /></div></div>
                    <div className="min-w-0 space-y-1.5 xl:col-span-3" data-testid={`text-plan-mechanic-${o.id}`}>
                      {ms.map((m, i) => (
                        <div key={i} className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 text-[11px] [overflow-wrap:anywhere] xl:grid-cols-[minmax(130px,1fr)_minmax(130px,1fr)_minmax(110px,0.9fr)] xl:gap-3">
                          <span className="text-muted-foreground xl:hidden">Механизатор</span><span>{dash(m.employee)}</span>
                          <span className="text-muted-foreground xl:hidden">Техника</span><span>{dash(m.equipment, "не указана")}</span>
                          <span className="text-muted-foreground xl:hidden">Агрегат</span><span>{dash(m.implement)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex xl:justify-end">{manage && <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => onEditOp(o)} data-testid={`button-plan-edit-op-${o.id}`}><Pencil size={12} />Изменить</button>}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-muted/30 px-3 py-1.5 text-[10.5px]" data-testid={`text-plan-costs-${o.id}`}>
                    <span><span className="text-muted-foreground">Площадь операции: </span><span className="font-mono">{ha(o.plannedAreaHa)}</span></span>
                    <span><span className="text-muted-foreground">План ДТ (стоимость): </span><span className="font-mono">{kzt(o.plannedFuelCost)}</span></span>
                    <span><span className="text-muted-foreground">Расценка: </span><span className="font-mono">{o.plannedRatePerHa > 0 ? `${kzt(o.plannedRatePerHa)}/га` : "не задана"}</span></span>
                    <span><span className="text-muted-foreground">ЗП по плану: </span><span className="font-mono font-semibold">{kzt(o.plannedPayAmount)}</span></span>
                  </div>
                  <SeedPlanSummary seeds={o.seeds} opName={o.name} testId={`text-season-seeds-${o.id}`} />
                  <SupportingWorksSummary works={o.supportingWorks} title="Сопутствующие работы по плану" testId={`text-season-support-${o.id}`} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
