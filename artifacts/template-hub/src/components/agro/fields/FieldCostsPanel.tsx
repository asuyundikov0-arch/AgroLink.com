import { Banknote, FlaskConical, Fuel, Sigma, Sprout } from "lucide-react";
import { type FieldCosts } from "@workspace/api-client-react";
import { dateFmt } from "./shared";
import { splitSalary } from "../seeds/seedTask";

type OpCost = FieldCosts["operations"][number];
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
export const kzt = (v: number) => `${money.format(v)} ₸`;
export const liters = (v: number) => `${qty.format(v)} л`;

export function FieldCostsPanel({ costs, isLoading, isError, onRetry }: { costs?: FieldCosts; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  if (isLoading) return <div className="grid gap-2 px-4 py-3 sm:grid-cols-4 sm:px-5" data-testid="status-field-costs-loading">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>;
  if (isError || !costs) return <div className="flex items-center justify-between gap-3 px-4 py-3 text-[11px] sm:px-5" data-testid="status-field-costs-error"><span className="text-destructive">Не удалось загрузить затраты по сезону.</span><button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={onRetry}>Повторить</button></div>;
  const seedCost = costs.seedCost ?? 0;
  const unallocSeed = costs.unallocatedSeedCost ?? 0;
  const transportSalary = costs.operations.reduce((sum, op) => sum + (op.transportSalaryCost ?? 0), 0);
  const cells = [
    { label: "Семена", value: seedCost, icon: Sprout, sub: unallocSeed > 0 ? `без операции: ${kzt(unallocSeed)}` : "согласованная выдача со склада семян" },
    { label: "Химия", value: costs.chemicalCost, icon: FlaskConical, sub: costs.unallocatedChemicalCost > 0 ? `без операции: ${kzt(costs.unallocatedChemicalCost)}` : "по принятой пустой таре" },
    { label: "ГСМ", value: costs.fuelCost, icon: Fuel, sub: liters(costs.fuelLiters) },
    { label: "Зарплата", value: Math.round((costs.salaryCost - transportSalary) * 100) / 100, icon: Banknote, sub: "полевые работы · подтверждено ОК" },
    { label: "Автобаза", value: transportSalary, icon: Banknote, sub: "доставка семян · подтверждено ОК" },
    { label: "Итого", value: costs.totalCost, icon: Sigma, sub: "по выбранному сезону", total: true },
  ];
  return <div className="px-4 py-3 sm:px-5" data-testid="section-field-costs">
    <p className="eyebrow mb-2">Затраты сезона</p>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">{cells.map(({ label, value, icon: Icon, sub, total }) => <div key={label} className={`rounded-lg border p-3 ${total ? "border-foreground/40 bg-foreground/[.06]" : "border-border bg-card"}`} data-testid={`text-field-cost-${label}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground"><Icon size={12} />{label}</div>
      <p className="mt-1 font-mono text-base font-bold">{kzt(value)}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{sub}</p>
    </div>)}</div>
    {unallocSeed > 0 && <p className="mt-2 text-[10.5px] text-muted-foreground" data-testid="text-unallocated-seed-cost">Семена на {kzt(unallocSeed)} выданы на сезон без привязки к операции посева — учтены в итоге сезона.</p>}
  </div>;
}

export function OperationCost({ cost, opId }: { cost?: OpCost; opId: number }) {
  if (!cost) return <p className="mt-2 border-t border-border/70 pt-2 text-[10.5px] text-muted-foreground" data-testid={`text-op-cost-empty-${opId}`}>Затрат по операции пока нет.</p>;
  const sal = splitSalary(cost.salaryCost, cost.transportSalaryCost);
  const isTransport = (s: OpCost["salaries"][number]) => s.sourceType === "seed_trip";
  const label = (s: OpCost["salaries"][number]) => `${s.employeeName} · ${dateFmt(s.workDate)}${s.supportingTaskId != null ? ` · задание № ${s.supportingTaskId}` : ""}`;
  return <div className="mt-2 border-t border-border/70 pt-2 text-[10.5px]" data-testid={`section-op-cost-${opId}`}>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
      <span>Семена {kzt(cost.seedCost ?? 0)}</span><span>Химия {kzt(cost.chemicalCost)}</span><span>ГСМ {liters(cost.fuelLiters)} · {kzt(cost.fuelCost)}</span><span data-testid={`text-op-salary-field-${opId}`}>Зарплата {kzt(sal.field)}</span>{sal.transport > 0 && <span data-testid={`text-op-salary-transport-${opId}`}>Автобаза (доставка семян) {kzt(sal.transport)}</span>}<span className="ml-auto font-bold">Итого {kzt(cost.totalCost)}</span>
    </div>
    <div className="mt-1.5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      <List title="Семена" empty="не выдавались" rows={(cost.seedIssues ?? []).map((s) => [`${s.cropName} · ${dateFmt(s.occurredOn)}${s.supportingTaskId ? ` · задание №${s.supportingTaskId}` : ""}`, `${qty.format(s.quantityTons)} т · ${kzt(s.amount)}`])} />
      <List title="Химия" empty="не выдавалась" rows={cost.chemicals.map((c) => [`${c.name}`, `${qty.format(c.quantity)} ${c.unit} · ${kzt(c.amount)}`])} />
      <List title="Топливо" empty="не выдавалось" rows={cost.fuels.map((f) => [f.fuelType, `${liters(f.liters)} · ${kzt(f.amount)}`])} />
      <List title="Зарплата" empty="нет подтверждённых начислений" rows={cost.salaries.filter((s) => !isTransport(s)).map((s) => [label(s), kzt(s.amount)])} />
      {cost.salaries.some(isTransport) && <List title="Автобаза (доставка семян)" empty="" rows={cost.salaries.filter(isTransport).map((s) => [label(s), kzt(s.amount)])} />}
    </div>
  </div>;
}

function List({ title, rows, empty }: { title: string; rows: string[][]; empty: string }) {
  return <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
    <p className="text-[9.5px] font-bold uppercase tracking-[.12em] text-muted-foreground">{title}</p>
    {rows.length === 0 ? <p className="text-muted-foreground">{empty}</p> : rows.map((r, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{r[0]}</span><span className="shrink-0 font-mono">{r[1]}</span></div>)}
  </div>;
}
