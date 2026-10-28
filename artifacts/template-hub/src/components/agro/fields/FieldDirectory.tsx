import { History, LandPlot, Pencil, Plus } from "lucide-react";
import type { AgroField, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { ha, sumHa } from "./shared";

type Props = {
  fields: AgroField[];
  seasons: FieldSeason[];
  operations: FieldOperation[];
  canManage: boolean;
  generalDirector: boolean;
  onAdd: () => void;
  onEdit: (field: AgroField) => void;
  onHistory: (field: AgroField) => void;
};

/** The existing field IDs are the directory: no second list or copied work records. */
export function FieldDirectory({ fields, seasons, operations, canManage, generalDirector, onAdd, onEdit, onHistory }: Props) {
  const seasonsByField = new Map<number, Set<number>>();
  for (const season of seasons) {
    const ids = seasonsByField.get(season.fieldId) ?? new Set<number>();
    ids.add(season.id);
    seasonsByField.set(season.fieldId, ids);
  }
  const active = fields.filter((field) => field.isActive);
  return <section className="surface-card overflow-hidden" data-testid="section-field-directory">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
      <div>
        <h2 className="text-sm font-bold">Справочник полей</h2>
        <p className="mt-1 max-w-xl text-[11px] leading-5 text-muted-foreground">
          Единый список для планирования, фактических работ и истории. Поля общие для всех сезонов; ранее внесённые работы сохраняются в карточках своих полей.
        </p>
      </div>
      {canManage && <button type="button" className="button button-primary" onClick={onAdd} data-testid="button-directory-add-field"><Plus size={14} />Добавить поле</button>}
    </header>
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border bg-muted/20 px-4 py-2 text-[11px] sm:px-5">
      <span>Всего полей: <strong>{fields.length}</strong></span>
      <span>Действующих: <strong>{active.length}</strong></span>
      <span>Площадь действующих: <strong className="font-mono">{ha(sumHa(active.map((field) => field.areaHa)))}</strong></span>
    </div>
    {fields.length === 0 ? <div className="p-6 text-center text-xs text-muted-foreground" data-testid="status-directory-empty">
      <LandPlot size={20} className="mx-auto mb-2" />В этом хозяйстве поля пока не добавлены.
    </div> : <ul className="divide-y divide-border">
      {fields.map((field) => {
        const ids = seasonsByField.get(field.id) ?? new Set<number>();
        const work = operations.filter((operation) => ids.has(operation.seasonId) && operation.status !== "cancelled");
        return <li key={field.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between" data-testid={`row-directory-field-${field.id}`}>
          <div className="flex min-w-0 flex-wrap items-start gap-x-5 gap-y-2">
            <div className="min-w-[100px]">
              <p className="font-mono text-sm font-bold">Поле № {field.number}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{field.unit}</p>
            </div>
            <div className="min-w-[90px]"><p className="text-[10px] text-muted-foreground">Площадь</p><p className="mt-1 font-mono text-xs font-semibold" data-testid={`text-directory-area-${field.id}`}>{ha(field.areaHa)}</p></div>
            <div className="text-[11px] leading-5 text-muted-foreground">
              <p>{field.isActive ? "Действующее" : "Архивное"} · сезонов: {ids.size}</p>
              <p data-testid={`text-directory-links-${field.id}`}>Планов: {work.filter((operation) => !operation.isUnplanned).length} · фактических работ: {work.filter((operation) => operation.actualStart !== null).length}</p>
            </div>
            {field.notes && <p className="max-w-sm whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{field.notes}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" className="button button-secondary !min-h-[32px] !px-2.5 text-[11px]" onClick={() => onHistory(field)} aria-label={`История поля № ${field.number}`} data-testid={`button-directory-history-${field.id}`}><History size={13} />История, план и факт</button>
            {canManage && (field.isActive || generalDirector) && <button type="button" className="button button-secondary !min-h-[32px] !px-2.5 text-[11px]" onClick={() => onEdit(field)} aria-label={`Изменить поле № ${field.number}`} data-testid={`button-directory-edit-${field.id}`}><Pencil size={13} />Изменить</button>}
          </div>
        </li>;
      })}
    </ul>}
  </section>;
}
