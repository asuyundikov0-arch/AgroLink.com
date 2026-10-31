import { useMemo, useState } from "react";
import { CalendarRange, ClipboardList, Layers, X } from "lucide-react";
import { getGetChemicalWarehouseQueryKey, getGetFieldCostsQueryKey, useGetChemicalWarehouse, useGetFieldCosts, type AgroField, type FieldBoundary, type FieldCosts, type FieldOperation, type FieldSeason } from "@workspace/api-client-react";
import { POLL_MS, cx, ha } from "../fields/shared";
import { PlanOperationCard, type ChemBatchInfo } from "../fields/PlanOperationCard";
import { ActualOperationCard } from "../fields/ActualOperationCard";
import { FieldCostsPanel } from "../fields/FieldCostsPanel";
import { CropBadge, cropStyle } from "../fields/PlanRegister";
import { isPendingCompletion } from "../fields/WorkForms";

interface Props {
  role: string;
  boundary: FieldBoundary;
  field: AgroField | undefined;
  seasons: FieldSeason[];
  operations: FieldOperation[];
  defaultYear: number;
  onClose: () => void;
}

const live = (o: FieldOperation) => !o.voidedAt && o.status !== "cancelled";
/** Preserve the seasonal plan even after its operations start or finish. */
export const mapPlanOps = (ops: FieldOperation[], seasonId: number) => ops
  .filter((o) => o.seasonId === seasonId && live(o) && !o.isUnplanned)
  .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.id - b.id);
/** Actual work of exactly this season: started, in progress, completed or awaiting completion. */
export const mapFactOps = (ops: FieldOperation[], seasonId: number) => ops
  .filter((o) => o.seasonId === seasonId && live(o) && (!!o.actualStart || o.progressReports.length > 0 || o.status === "in_progress" || o.status === "completed" || isPendingCompletion(o)))
  .sort((a, b) => (b.actualStart ?? b.plannedStart).localeCompare(a.actualStart ?? a.plannedStart) || b.id - a.id);

type CostsState = { data?: FieldCosts; isLoading: boolean; isError: boolean; onRetry: () => void };

export function FieldHistoryPanel(props: Props) {
  const fieldSeasons = useMemo(() => props.seasons.filter((s) => s.fieldId === props.boundary.fieldId).sort((a, b) => b.year - a.year), [props.seasons, props.boundary.fieldId]);
  const initial = fieldSeasons.find((s) => s.year === props.defaultYear) ?? fieldSeasons[0];
  const [seasonId, setSeasonId] = useState<number | null>(initial?.id ?? null);
  const season = fieldSeasons.find((s) => s.id === seasonId) ?? initial;
  const q = useGetFieldCosts(season?.id ?? 0, { query: { enabled: !!season, queryKey: getGetFieldCostsQueryKey(season?.id ?? 0), refetchInterval: POLL_MS } });
  const hasChemicals = props.operations.some(o => o.seasonId === season?.id && live(o) && o.chemicalPlan?.length);
  const chemicals = useGetChemicalWarehouse({ query: { enabled: hasChemicals, queryKey: getGetChemicalWarehouseQueryKey(), refetchInterval: POLL_MS } });
  const chemBatches = useMemo(() => new Map((chemicals.data?.batches ?? []).map(b => [b.id, { name: b.name, unit: b.unit, unitPrice: b.unitPrice }])), [chemicals.data]);
  return <FieldSeasonView {...props} chemBatches={chemBatches} fieldSeasons={fieldSeasons} season={season} onSeason={setSeasonId}
    costs={{ data: q.data, isLoading: q.isLoading, isError: q.isError, onRetry: () => { void q.refetch(); } }} />;
}

export function FieldSeasonView({ role, boundary, field, operations, onClose, fieldSeasons, season, onSeason, costs, chemBatches, initialTab = "fact" }: Props & {
  fieldSeasons: FieldSeason[]; season?: FieldSeason; onSeason: (id: number) => void; costs: CostsState; initialTab?: "plan" | "fact";
  chemBatches?: Map<number, ChemBatchInfo>;
}) {
  const [tab, setTab] = useState<"plan" | "fact">(initialTab);
  const plan = season ? mapPlanOps(operations, season.id) : [];
  const fact = season ? mapFactOps(operations, season.id) : [];
  const predecessor = season ? fieldSeasons.find((s) => s.year < season.year) : undefined;
  const directoryArea = field?.areaHa ?? boundary.areaHa;
  const diff = Math.round((boundary.contourAreaHa - directoryArea) * 100) / 100;
  const costByOp = new Map((costs.data?.operations ?? []).map((c) => [c.operationId, c]));
  const costsReady = !!costs.data && !costs.isError;

  return (
    <section className="surface-card overflow-hidden" aria-label={`Поле № ${boundary.fieldNumber}`} data-testid={`panel-map-field-${boundary.fieldId}`}>
      <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5" style={season ? cropStyle(season.cropName).row : undefined}>
        <div className="min-w-0">
          <p className="eyebrow">{boundary.unit}</p>
          <h2 className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-bold" data-testid="text-map-field-number">Поле № {boundary.fieldNumber}{season ? <> · {season.year}<CropBadge crop={season.cropName} /></> : <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Севооборот не задан</span>}</h2>
          <p className="text-[11px] text-muted-foreground" data-testid="text-map-season-crop">{season?.variety ? `${season.variety} · ` : ""}{ha(season?.areaHa ?? directoryArea)} · предшественник: <span data-testid="text-map-predecessor">{predecessor ? `${predecessor.cropName} (${predecessor.year})` : "Нет данных"}</span>{field && !field.isActive ? " · в архиве справочника" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fieldSeasons.length > 0 && <>
            <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="select-map-season">Сезон</label>
            <select id="select-map-season" className="text-input !w-auto font-mono" value={season?.id ?? ""} onChange={(e) => onSeason(Number(e.target.value))} data-testid="select-map-season">
              {fieldSeasons.map((s) => <option key={s.id} value={s.id}>{s.year} · {s.cropName}</option>)}
            </select>
          </>}
          <button type="button" className="button button-secondary !min-h-[30px] !px-2" onClick={onClose} aria-label="Закрыть карточку поля" data-testid="button-map-field-close"><X size={14} /></button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px border-b border-border bg-border text-xs">
        <div className="bg-card px-4 py-2.5 sm:px-5"><dt className="text-[10.5px] text-muted-foreground">Площадь по справочнику</dt><dd className="font-mono font-bold" data-testid="text-map-directory-area">{ha(directoryArea)}</dd></div>
        <div className="bg-card px-4 py-2.5 sm:px-5"><dt className="text-[10.5px] text-muted-foreground">Площадь контура</dt><dd className="font-mono font-bold" data-testid="text-map-contour-area">{ha(boundary.contourAreaHa)}</dd>
          {diff !== 0 && <p className="text-[10px] text-muted-foreground" data-testid="text-map-area-mismatch">{diff > 0 ? "+" : ""}{ha(diff)} к справочнику — справочник не меняется</p>}</div>
      </dl>
      {!season ? (
        <div className="empty-state" data-testid="status-map-no-seasons"><div className="empty-icon"><Layers size={18} /></div><h3 className="mt-3 text-sm font-bold">Сезонов по полю нет</h3><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Культура и план работ появятся, когда главный агроном добавит сезон.</p></div>
      ) : !field ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground sm:px-5" data-testid="status-map-field-missing">Поле не найдено в справочнике — карточки работ недоступны.</p>
      ) : <>
        <div className="flex gap-1 border-b border-border px-4 pt-2 sm:px-5" role="tablist" aria-label="План или факт">
          {([["plan", "План", plan.length, ClipboardList], ["fact", "Факт", fact.length, CalendarRange]] as const).map(([k, label, n, I]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-map-${k}`}
              className={cx("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition-colors", tab === k ? "border-[hsl(var(--primary))] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <I size={13} />{label}<span className="rounded-full bg-muted px-1.5 font-mono text-[10px]">{n}</span>
            </button>
          ))}
        </div>
        {tab === "plan" ? (
          <div className="space-y-3 px-4 py-4 sm:px-5" data-testid="section-map-plan">
            {plan.length === 0 ? <Empty text={`Плановых работ за ${season.year} нет`} testId="status-map-plan-empty" />
              : plan.map((o) => <PlanOperationCard key={o.id} op={o} field={field} season={season} chemBatches={chemBatches} manage={false} showField={false} onEdit={() => undefined} />)}
          </div>
        ) : (
          <div className="divide-y divide-border" data-testid="section-map-fact">
            <FieldCostsPanel costs={costs.data} isLoading={costs.isLoading} isError={costs.isError} onRetry={costs.onRetry} />
            <div className="space-y-3 px-4 py-4 sm:px-5">
              {fact.length === 0 ? <Empty text={`Фактических работ за ${season.year} нет`} testId="status-map-history-empty" />
                : fact.map((o) => <ActualOperationCard key={o.id} readOnly op={o} field={field} crop={season.cropName} year={season.year} role={role} cost={costByOp.get(o.id)} costsReady={costsReady} history testId={`row-map-op-${o.id}`} />)}
            </div>
          </div>
        )}
      </>}
    </section>
  );
}

function Empty({ text, testId }: { text: string; testId: string }) {
  return <div className="flex flex-col items-center py-8 text-center" data-testid={testId}><CalendarRange size={18} className="text-muted-foreground" /><p className="mt-2 text-xs font-bold">{text}</p></div>;
}
