// Extracted from AgroLink's existing PayrollRegisterWorkspace.
// This local copy has no network, authentication or production mutation dependencies.
const kzt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = (v: number) => `${kzt.format(v)} ₸`;
const sourceLabel: Record<string, string> = {
  grain_trip: "Рейс зерна",
  field_progress: "Дневной отчёт поля",
  field_operation: "Полевая операция",
  manual: "Ручная строка",
  timecard: "Табель",
  salary: "Оклад",
};
type Line = { workType: string; details: string; amountKzt: number; sourceType: string; key: string };
type Group = { key: string; name: string; total: number; lines: Line[] };

export function CurrentPayrollLines({ groups, testPrefix }: { groups: Group[]; testPrefix: string }) {
  return <div className="overflow-hidden rounded-lg border border-border/80">
    {groups.map((group) => <div key={group.key} className="border-t border-border/70 first:border-t-0" data-testid={`${testPrefix}-${group.key}`}>
      <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2"><span className="text-xs font-bold">{group.name}</span><span className="font-mono text-xs font-bold">{money(group.total)}</span></div>
      {group.lines.map((line) => <div key={line.key} className="grid gap-1 px-3 py-2 text-[11px] sm:grid-cols-[minmax(120px,1fr)_minmax(140px,1.6fr)_120px] sm:gap-3">
        <span><span className="font-semibold">{line.workType}</span> <span className="text-muted-foreground">· {sourceLabel[line.sourceType] ?? line.sourceType}</span></span>
        <span className="text-muted-foreground">{line.details || "—"}</span>
        <span className="font-mono sm:text-right">{money(line.amountKzt)}</span>
      </div>)}
    </div>)}
  </div>;
}
