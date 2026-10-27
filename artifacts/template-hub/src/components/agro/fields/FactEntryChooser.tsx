import { Activity, Plus } from "lucide-react";
import { type AgroField, type FieldOperation, type FieldSeason } from "@workspace/api-client-react";
import { Drawer, dateFmt, ha } from "./shared";

export function FactEntryChooser({ field, season, operations, onActual, onProgress, onUnplanned, onClose }: {
  field: AgroField; season: FieldSeason; operations: FieldOperation[];
  onActual: (operation: FieldOperation) => void;
  onProgress: (operation: FieldOperation) => void;
  onUnplanned: () => void; onClose: () => void;
}) {
  const available = operations.filter((o) => o.seasonId === season.id && o.status !== "cancelled");
  const planned = available.filter((o) => !o.actualStart && !o.isUnplanned);
  const started = available.filter((o) => !!o.actualStart && !o.actualEnd);
  return <Drawer title="Добавить факт операции" eyebrow={`Поле № ${field.number} · ${season.year} · ${season.cropName}`} onClose={onClose} footer={<button type="button" className="button button-ghost" onClick={onClose}>К операциям поля</button>} testId="drawer-fact-entry">
    <div className="space-y-5">
      <p className="text-xs leading-5 text-muted-foreground">Поле и сезон уже выбраны. Выберите работу из плана, внесите ежедневный факт по текущей операции или добавьте работу вне плана.</p>
      <section className="space-y-2">
        <h3 className="text-sm font-bold">Начать операцию по плану</h3>
        {planned.length === 0 ? <p className="text-xs text-muted-foreground">Нет плановых операций, ожидающих начала.</p> : planned.map((o) =>
          <button key={o.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => onActual(o)} data-testid={`button-entry-start-${o.id}`}>
            <span><span className="block text-xs font-bold">{o.name}</span><span className="mt-1 block text-[11px] text-muted-foreground">{dateFmt(o.plannedStart)} – {dateFmt(o.plannedEnd)} · {ha(o.plannedAreaHa)}</span></span>
            <Activity size={16} className="shrink-0" />
          </button>)}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-bold">Операции в процессе</h3>
        {started.length === 0 ? <p className="text-xs text-muted-foreground">На этом поле пока нет начатых операций.</p> : started.map((o) =>
          <div key={o.id} className="rounded-lg border border-border p-3">
            <p className="text-xs font-bold">{o.actualOperationName || o.name}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Выполнено {ha(o.actualAreaHa)}{o.actualMechanic ? ` · ${o.actualMechanic}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="button button-secondary text-xs" onClick={() => onProgress(o)} data-testid={`button-entry-progress-${o.id}`}>Отчёт за день</button>
              <button type="button" className="button button-secondary text-xs" onClick={() => onActual(o)} data-testid={`button-entry-finish-${o.id}`}>Завершить операцию</button>
            </div>
          </div>)}
      </section>
      <button type="button" className="button button-primary w-full" onClick={onUnplanned} data-testid="button-entry-unplanned"><Plus size={15} />Добавить внеплановую операцию</button>
      <p className="text-[11px] text-muted-foreground">Для работы, которая есть в плане или уже начата, используйте её запись выше — повторно создавать её не нужно.</p>
    </div>
  </Drawer>;
}
