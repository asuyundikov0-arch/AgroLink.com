import { useMemo, useState } from "react";
import { CalendarRange, Plus, Search, X } from "lucide-react";
import type { AgroField, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { type ChemBatchInfo, OP_KINDS, type OpKind, PlanOperationCard, machinesOf, opKind } from "./PlanOperationCard";
import { activeOps } from "./PlanRegister";
import { ha, sumHa } from "./shared";

export type PlanFilters = { fieldId: string; crop: string; kind: string; q: string };
export const EMPTY_FILTERS: PlanFilters = { fieldId: "", crop: "", kind: "", q: "" };

type Row = { op: FieldOperation; season: FieldSeason; field: AgroField };

/** All planned (non-cancelled, non-unplanned) operations of the year's seasons, filtered and sorted by start. */
export function filterPlanRows(fields: AgroField[], yearSeasons: FieldSeason[], ops: FieldOperation[], f: PlanFilters): Row[] {
  const fieldById = new Map(fields.map((x) => [x.id, x]));
  const q = f.q.trim().toLowerCase();
  const rows: Row[] = [];
  for (const s of yearSeasons) {
    const field = fieldById.get(s.fieldId);
    if (!field) continue;
    if (f.fieldId && String(field.id) !== f.fieldId) continue;
    if (f.crop && s.cropName !== f.crop) continue;
    for (const op of activeOps(ops, s.id)) {
      if (f.kind && opKind(op.name) !== f.kind) continue;
      if (q) {
        const hay = [op.name, s.cropName, s.variety, `поле ${field.number}`, field.number, field.unit, op.notes, ...machinesOf(op).flatMap((m) => [m.employee, m.equipment, m.implement])].join(" ").toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push({ op, season: s, field });
    }
  }
  return rows.sort((a, b) => a.op.plannedStart.localeCompare(b.op.plannedStart) || a.op.id - b.op.id);
}

type Props = {
  year: number; fields: AgroField[]; yearSeasons: FieldSeason[]; ops: FieldOperation[]; manage: boolean; chemBatches?: Map<number, ChemBatchInfo>;
  onEdit: (o: FieldOperation) => void; onHistory: (fieldId: number) => void; onOpenField: (fieldId: number) => void; onAddSeason: (fieldId: number) => void;
  initialFilters?: PlanFilters;
};

export function PlanOverview({ year, fields, yearSeasons, ops, manage, chemBatches, onEdit, onHistory, onOpenField, onAddSeason, initialFilters = EMPTY_FILTERS }: Props) {
  const [flt, setFlt] = useState<PlanFilters>(initialFilters);
  const set = (p: Partial<PlanFilters>) => setFlt((x) => ({ ...x, ...p }));
  const rows = useMemo(() => filterPlanRows(fields, yearSeasons, ops, flt), [fields, yearSeasons, ops, flt]);
  const crops = useMemo(() => [...new Set(yearSeasons.map((s) => s.cropName))].sort((a, b) => a.localeCompare(b, "ru")), [yearSeasons]);
  const kinds = useMemo(() => {
    const ids = new Set(yearSeasons.map((s) => s.id));
    return (Object.keys(OP_KINDS) as OpKind[]).filter((k) => ops.some((o) => ids.has(o.seasonId) && o.status !== "cancelled" && !o.isUnplanned && opKind(o.name) === k));
  }, [yearSeasons, ops]);
  const seasonFieldIds = new Set(yearSeasons.map((s) => s.fieldId));
  const noSeason = fields.filter((f) => !seasonFieldIds.has(f.id) && (!flt.fieldId || String(f.id) === flt.fieldId));
  const active = flt.fieldId || flt.crop || flt.kind || flt.q;
  const pickedField = flt.fieldId ? fields.find((f) => String(f.id) === flt.fieldId) : undefined;

  return (
    <section className="space-y-3" data-testid="section-plan-overview">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(3,minmax(0,180px))_minmax(200px,1fr)]" aria-label="Фильтры плана">
        <select aria-label="Поле" className="text-input" value={flt.fieldId} onChange={(e) => set({ fieldId: e.target.value })} data-testid="select-plan-field">
          <option value="">Все поля</option>{fields.map((f) => <option key={f.id} value={f.id}>Поле {f.number} · {f.unit}{f.isActive ? "" : " · архив"}</option>)}
        </select>
        <select aria-label="Культура" className="text-input" value={flt.crop} onChange={(e) => set({ crop: e.target.value })} data-testid="select-plan-crop">
          <option value="">Все культуры</option>{crops.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select aria-label="Операция" className="text-input" value={flt.kind} onChange={(e) => set({ kind: e.target.value })} data-testid="select-plan-kind">
          <option value="">Все операции</option>{kinds.map((k) => <option key={k} value={k}>{OP_KINDS[k].label}</option>)}
        </select>
        <label className="search-field col-span-2 !min-h-[40px] md:col-span-1"><Search size={14} /><input type="search" placeholder="Поиск: операция, техника, механизатор, поле" value={flt.q} onChange={(e) => set({ q: e.target.value })} data-testid="input-plan-search" />
          {flt.q && <button type="button" aria-label="Очистить поиск" onClick={() => set({ q: "" })}><X size={13} /></button>}</label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span data-testid="text-plan-count"><span className="font-mono font-bold text-foreground">{rows.length}</span> операций · {ha(sumHa(rows.map((r) => r.op.plannedAreaHa)))}</span>
        {active && <button type="button" className="font-bold text-foreground underline-offset-2 hover:underline" onClick={() => setFlt(EMPTY_FILTERS)} data-testid="button-plan-reset-filters">Сбросить фильтры</button>}
        {pickedField && <button type="button" className="op-card-link ml-auto" onClick={() => onOpenField(pickedField.id)} data-testid={`button-plan-open-field-${pickedField.id}`}><CalendarRange size={12} />Открыть план поля {pickedField.number}</button>}
      </div>

      {rows.length === 0 ? (
        <div className="surface-card empty-state !min-h-[200px]" data-testid="status-plan-ops-empty">
          <div className="empty-icon"><CalendarRange size={20} /></div>
          <h3 className="mt-4 text-sm font-bold">{active ? "По фильтрам операций нет" : `На ${year} год плановых операций нет`}</h3>
          <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">{active ? "Измените или сбросьте фильтры." : manage ? "Нажмите «Добавить план» или откройте поле во вкладке «По полям»." : "Плановые операции ещё не внесены."}</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="list-plan-ops">
          {rows.map((r) => <PlanOperationCard key={r.op.id} op={r.op} field={r.field} season={r.season} manage={manage} chemBatches={chemBatches} onEdit={onEdit} onHistory={onHistory} onOpenField={onOpenField} />)}
        </div>
      )}

      {noSeason.length > 0 && !flt.crop && !flt.kind && (
        <div className="surface-card px-4 py-3" data-testid="section-plan-no-season">
          <p className="text-[11px] font-bold">Поля без севооборота на {year}: {noSeason.length} · {ha(sumHa(noSeason.map((f) => f.areaHa)))}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{noSeason.map((f) => (
            <div key={f.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
              <button type="button" className="text-[10.5px] font-semibold hover:underline" onClick={() => onOpenField(f.id)} data-testid={`button-plan-noseason-open-${f.id}`}>№ {f.number} · {ha(f.areaHa)}{f.isActive ? "" : " · архив"}</button>
              {manage && f.isActive && <button type="button" className="rounded-full px-1 hover:bg-muted" aria-label={`Добавить севооборот для поля ${f.number}`} onClick={() => onAddSeason(f.id)} data-testid={`button-plan-noseason-add-${f.id}`}><Plus size={12} /></button>}
            </div>
          ))}</div>
        </div>
      )}
    </section>
  );
}
