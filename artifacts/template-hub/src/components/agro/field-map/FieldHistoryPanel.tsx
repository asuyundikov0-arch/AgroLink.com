import { useMemo, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import type { AgroField, FieldBoundary, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { StatusPill, dateFmt, ha } from "../fields/shared";

interface Props {
  boundary: FieldBoundary;
  field: AgroField | undefined;
  seasons: FieldSeason[];
  operations: FieldOperation[];
  defaultYear: number;
  onClose: () => void;
}

const HISTORY_STATUSES = new Set(["in_progress", "completed"]);

export function FieldHistoryPanel({ boundary, field, seasons, operations, defaultYear, onClose }: Props) {
  const fieldSeasons = useMemo(() => seasons.filter((s) => s.fieldId === boundary.fieldId).sort((a, b) => b.year - a.year), [seasons, boundary.fieldId]);
  const initial = fieldSeasons.find((s) => s.year === defaultYear) ?? fieldSeasons[0];
  const [seasonId, setSeasonId] = useState<number | null>(initial?.id ?? null);
  const season = fieldSeasons.find((s) => s.id === seasonId) ?? initial;
  const ops = useMemo(() => !season ? [] : operations
    .filter((o) => o.seasonId === season.id && !o.voidedAt && o.status !== "cancelled" && (HISTORY_STATUSES.has(o.status) || !!o.actualStart || o.progressReports.length > 0))
    .sort((a, b) => (b.actualStart ?? b.plannedStart).localeCompare(a.actualStart ?? a.plannedStart) || b.id - a.id), [operations, season]);
  const directoryArea = field?.areaHa ?? boundary.areaHa;
  const diff = Math.round((boundary.contourAreaHa - directoryArea) * 100) / 100;

  return (
    <section className="surface-card flex min-h-0 flex-col overflow-hidden" aria-label={`Поле № ${boundary.fieldNumber}`} data-testid={`panel-map-field-${boundary.fieldId}`}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">{boundary.unit}</p>
          <h2 className="font-display text-xl font-bold tracking-[-0.03em]" data-testid="text-map-field-number">Поле № {boundary.fieldNumber}</h2>
          {field && !field.isActive && <p className="text-[10.5px] text-muted-foreground">в архиве справочника</p>}
        </div>
        <button type="button" className="button button-secondary !min-h-[30px] !px-2" onClick={onClose} aria-label="Закрыть карточку поля" data-testid="button-map-field-close"><X size={14} /></button>
      </header>
      <dl className="grid grid-cols-2 gap-px border-b border-border bg-border text-xs">
        <div className="bg-card px-4 py-2.5"><dt className="text-[10.5px] text-muted-foreground">Площадь по справочнику</dt><dd className="font-mono font-bold" data-testid="text-map-directory-area">{ha(directoryArea)}</dd></div>
        <div className="bg-card px-4 py-2.5"><dt className="text-[10.5px] text-muted-foreground">Площадь контура</dt><dd className="font-mono font-bold" data-testid="text-map-contour-area">{ha(boundary.contourAreaHa)}</dd>
          {diff !== 0 && <p className="text-[10px] text-muted-foreground">{diff > 0 ? "+" : ""}{ha(diff)} к справочнику, справочник не меняется</p>}</div>
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        {fieldSeasons.length > 0 ? <>
          <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="select-map-season">Сезон</label>
          <select id="select-map-season" className="text-input !w-auto font-mono" value={season?.id ?? ""} onChange={(e) => setSeasonId(Number(e.target.value))} data-testid="select-map-season">
            {fieldSeasons.map((s) => <option key={s.id} value={s.id}>{s.year}</option>)}
          </select>
          {season && <span className="text-xs" data-testid="text-map-season-crop"><b>{season.cropName}</b>{season.variety ? ` · ${season.variety}` : ""} · {ha(season.areaHa)}</span>}
        </> : <p className="text-[11px] text-muted-foreground" data-testid="status-map-no-seasons">Сезонов по полю нет — культура не указана.</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!season ? null : ops.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-8 text-center" data-testid="status-map-history-empty">
            <CalendarRange size={18} className="text-muted-foreground" />
            <p className="mt-2 text-xs font-bold">Фактических работ за {season.year} нет</p>
            <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">Начатые и завершённые операции появятся здесь после внесения факта.</p>
          </div>
        ) : (
          <ol className="divide-y divide-border/70">
            {ops.map((o) => {
              const people = new Set<string>(); const machines = new Set<string>();
              if (o.actualMechanic) people.add(o.actualMechanic);
              if (o.actualEquipment) machines.add(o.actualImplement ? `${o.actualEquipment} · ${o.actualImplement}` : o.actualEquipment);
              for (const a of o.actualAssignments ?? []) { if (a.employeeName) people.add(a.employeeName); if (a.equipmentName) machines.add(a.implement ? `${a.equipmentName} · ${a.implement}` : a.equipmentName); }
              const reports = [...o.progressReports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
              return (
                <li key={o.id} className="px-4 py-3" data-testid={`row-map-op-${o.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-xs font-bold">{o.actualOperationName || o.name}</p>
                      <p className="font-mono text-[10.5px] text-muted-foreground">{dateFmt(o.actualStart)} – {o.actualEnd ? dateFmt(o.actualEnd) : "идёт"} · {ha(o.actualAreaHa)}{o.isUnplanned ? " · вне плана" : ""}</p></div>
                    <StatusPill op={o} />
                  </div>
                  {machines.size > 0 && <p className="mt-1 text-[11px]"><span className="text-muted-foreground">Техника: </span>{[...machines].join("; ")}</p>}
                  {people.size > 0 && <p className="text-[11px]"><span className="text-muted-foreground">Исполнитель: </span>{[...people].join(", ")}</p>}
                  {reports.length > 0 && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[11px] font-semibold text-[hsl(203_87%_33%)]">Ежедневно · {reports.length} дн.</summary>
                      <ul className="mt-1 space-y-0.5 font-mono text-[10.5px]">
                        {reports.map((r) => <li key={r.id} className="flex justify-between gap-3"><span>{dateFmt(r.reportDate)}</span><span>+{ha(r.dailyAreaHa)} · итого {ha(r.cumulativeAreaHa)}</span></li>)}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
