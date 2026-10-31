import { Plus, Trash2, Users, X } from "lucide-react";
import { type FieldSupportingWork, type FleetEquipment } from "@workspace/api-client-react";
import EmployeeSelect from "../../employees/EmployeeSelect";
import type { ReactNode } from "react";

export const SUPPORT_TOGGLE_LABEL = "Имеются сопутствующие работы при выполнении операции";
export const MAX_WORKS = 20;
export const MAX_EMPLOYEES = 30;
const MAX_MONEY = 1_000_000_000;
const emptyLegacySeeds = { seedName: "", seedQuantity: 0, seedUnit: "kg" as const, seedPrice: 0 };

export type SupportRow = {
  name: string; equipmentId: number | null; equipmentName: string;
  employees: { id: number; name: string }[];
  salaryCost: string; fuelCost: string;
  // Preserve historical data for API compatibility, without offering or budgeting seeds here.
  legacySeeds: Pick<FieldSupportingWork, "seedName" | "seedQuantity" | "seedUnit" | "seedPrice">;
};

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
export const kzt = (v: number) => `${money.format(v)} ₸`;
const eqLabel = (x: FleetEquipment) => `${x.kind} · ${x.registrationNumber || "без госномера"}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

export const emptySupportRow = (): SupportRow => ({ name: "", equipmentId: null, equipmentName: "", employees: [], salaryCost: "0", fuelCost: "0", legacySeeds: { ...emptyLegacySeeds } });

export function supportRowsFrom(works?: FieldSupportingWork[] | null): SupportRow[] {
  return (works ?? []).map((w) => ({
    name: w.name, equipmentId: w.equipmentId ?? null, equipmentName: w.equipmentName ?? "",
    employees: w.employeeIds.map((id, i) => ({ id, name: w.employeeNames?.[i] ?? `Сотрудник № ${id}` })),
    salaryCost: String(w.salaryCost), fuelCost: String(w.fuelCost),
    legacySeeds: { seedName: w.seedName, seedQuantity: w.seedQuantity, seedUnit: w.seedUnit, seedPrice: w.seedPrice },
  }));
}

function num(s: string, max: number, decimals: number): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const re = new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
  if (!re.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v <= max ? v : null;
}

/** Supporting work budgets include only wages and fuel. */
export const workTotal = (w: Pick<FieldSupportingWork, "salaryCost" | "fuelCost">) => r2(w.salaryCost + w.fuelCost);
export const worksTotal = (ws?: FieldSupportingWork[] | null) => r2((ws ?? []).reduce((s, w) => s + workTotal(w), 0));

function rowTotals(r: SupportRow) {
  const s = num(r.salaryCost, MAX_MONEY, 2) ?? 0, f = num(r.fuelCost, MAX_MONEY, 2) ?? 0;
  return { salary: s, fuel: f, total: r2(s + f) };
}

export type SupportErrors = Record<string, string>;

/** Validate rows. Never silently coerces invalid input. */
export function supportPlanOf(rows: SupportRow[]): { works: FieldSupportingWork[]; errors: SupportErrors } {
  const errors: SupportErrors = {};
  if (rows.length > MAX_WORKS) errors.general = `Не более ${MAX_WORKS} сопутствующих работ`;
  const works: FieldSupportingWork[] = rows.map((r, i) => {
    const name = r.name.trim();
    if (!name) errors[`${i}.name`] = "Укажите вид работы"; else if (name.length > 150) errors[`${i}.name`] = "Не более 150 символов";
    if (r.employees.length > MAX_EMPLOYEES) errors[`${i}.employees`] = `Не более ${MAX_EMPLOYEES} сотрудников`;
    if (r.equipmentName.length > 200) errors[`${i}.equipment`] = "Не более 200 символов";
    const salary = num(r.salaryCost, MAX_MONEY, 2); if (salary === null) errors[`${i}.salary`] = "От 0 до 1 000 000 000 ₸, до 2 знаков";
    const fuel = num(r.fuelCost, MAX_MONEY, 2); if (fuel === null) errors[`${i}.fuel`] = "От 0 до 1 000 000 000 ₸, до 2 знаков";
    return {
      name, equipmentId: r.equipmentId, equipmentName: r.equipmentName,
      employeeIds: r.employees.map((e) => e.id), employeeNames: r.employees.map((e) => e.name),
      salaryCost: salary ?? 0, fuelCost: fuel ?? 0, ...r.legacySeeds,
    };
  });
  return { works, errors };
}

const Lbl = ({ children }: { children: string }) => <span className="mb-1 block text-[10.5px] font-semibold text-muted-foreground">{children}</span>;
const Err = ({ m, id }: { m?: string; id: string }) => (m ? <span className="mt-1 block text-[10px] font-semibold text-destructive" data-testid={id}>{m}</span> : null);

export function SupportingWorksEditor({ enabled, onToggle, rows, onChange, fleet, fleetLoading, fleetError, onRetry, unit, errors, disabled, mainBudget, testId }: {
  enabled: boolean; onToggle: (v: boolean) => void; rows: SupportRow[]; onChange: (rows: SupportRow[]) => void;
  fleet: FleetEquipment[]; fleetLoading: boolean; fleetError: boolean; onRetry: () => void; unit?: string;
  errors: SupportErrors; disabled?: boolean; mainBudget?: { pay: number; fuel: number; seeds?: number } | null; testId: string;
}) {
  const unitFleet = fleet.filter((x) => !unit || x.unit === unit);
  const set = (i: number, patch: Partial<SupportRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const totals = rows.map(rowTotals);
  const agg = totals.reduce((a, t) => ({ salary: a.salary + t.salary, fuel: a.fuel + t.fuel, total: a.total + t.total }), { salary: 0, fuel: 0, total: 0 });
  const support = enabled ? r2(agg.total) : 0;

  return (
    <div className="space-y-3 sm:col-span-2" data-testid={testId}>
      <label className="flex items-start gap-2 text-xs font-semibold" htmlFor={`${testId}-toggle`}>
        <input id={`${testId}-toggle`} type="checkbox" className="mt-0.5" checked={enabled} disabled={disabled}
          onChange={(ev) => { onToggle(ev.target.checked); if (ev.target.checked && rows.length === 0) onChange([emptySupportRow()]); }} data-testid={`checkbox-${testId}`} />
        <span>{SUPPORT_TOGGLE_LABEL}<span className="block text-[10.5px] font-normal text-muted-foreground">Например, подвоз семян, заправщик, подсобные рабочие. Суммы — предполагаемые затраты для бюджета операции, не начисления зарплаты и не списание со склада.</span></span>
      </label>
      {enabled && <>
        {errors.general && <p className="text-[11px] font-semibold text-destructive">{errors.general}</p>}
        {rows.map((r, i) => {
          const t = totals[i];
          const eqKnown = r.equipmentId === null || unitFleet.some((x) => x.id === r.equipmentId);
          return (
            <section key={i} className="rounded-lg border border-border bg-muted/20 p-3" data-testid={`card-${testId}-${i}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[11px] font-bold">Сопутствующая работа</span>
                <button type="button" className="icon-button ml-auto !h-7 !w-7" aria-label="Удалить работу" disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))} data-testid={`button-${testId}-remove-${i}`}><Trash2 size={13} /></button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block"><Lbl>Вид работы *</Lbl>
                  <input className="text-input" maxLength={150} placeholder="Подвоз семян" value={r.name} disabled={disabled} onChange={(ev) => set(i, { name: ev.target.value })} data-testid={`input-${testId}-name-${i}`} />
                  <Err m={errors[`${i}.name`]} id={`error-${testId}-name-${i}`} /></label>
                <div><Lbl>Техника</Lbl>
                  {fleetError && <p className="mb-1 text-[10px] text-destructive">Справочник техники не загрузился. <button type="button" className="underline" onClick={onRetry}>Повторить</button></p>}
                  <select className="text-input" disabled={disabled || fleetLoading || fleetError} value={r.equipmentId === null ? "" : String(r.equipmentId)} data-testid={`select-${testId}-equipment-${i}`}
                    onChange={(ev) => { const eq = fleet.find((x) => x.id === Number(ev.target.value)); set(i, { equipmentId: eq ? eq.id : null, equipmentName: eq ? eqLabel(eq) : "" }); }}>
                    <option value="">{fleetLoading ? "Загрузка справочника…" : "Без техники"}</option>
                    {!eqKnown && <option value={String(r.equipmentId)}>{r.equipmentName || `Техника № ${r.equipmentId}`} · сохранено ранее</option>}
                    {unitFleet.map((x) => <option key={x.id} value={x.id}>{eqLabel(x)}</option>)}
                  </select>
                  <Err m={errors[`${i}.equipment`]} id={`error-${testId}-equipment-${i}`} /></div>
                <div className="sm:col-span-2"><Lbl>Сотрудники</Lbl>
                  {r.employees.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1.5">{r.employees.map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10.5px]" data-testid={`chip-${testId}-employee-${i}-${e.id}`}>
                      {e.name}<button type="button" aria-label={`Убрать ${e.name}`} disabled={disabled} onClick={() => set(i, { employees: r.employees.filter((x) => x.id !== e.id) })} className="text-muted-foreground hover:text-destructive"><X size={11} /></button>
                    </span>))}</div>}
                  {r.employees.length < MAX_EMPLOYEES && !disabled
                    ? <EmployeeSelect value={{ id: null, name: "" }} testId={`select-${testId}-employee-${i}`}
                        onChange={(v) => { if (v.id !== null && !r.employees.some((x) => x.id === v.id)) set(i, { employees: [...r.employees, { id: v.id, name: v.name }] }); }} />
                    : <p className="text-[10px] text-muted-foreground">{disabled ? "" : `Достигнут предел ${MAX_EMPLOYEES} сотрудников`}</p>}
                  <Err m={errors[`${i}.employees`]} id={`error-${testId}-employees-${i}`} /></div>
                <label className="block"><Lbl>Зарплата (предполагаемо), ₸</Lbl>
                  <input className="text-input font-mono" inputMode="decimal" value={r.salaryCost} disabled={disabled} onChange={(ev) => set(i, { salaryCost: ev.target.value })} data-testid={`input-${testId}-salary-${i}`} />
                  <Err m={errors[`${i}.salary`]} id={`error-${testId}-salary-${i}`} /></label>
                <label className="block"><Lbl>Топливо (предполагаемо), ₸</Lbl>
                  <input className="text-input font-mono" inputMode="decimal" value={r.fuelCost} disabled={disabled} onChange={(ev) => set(i, { fuelCost: ev.target.value })} data-testid={`input-${testId}-fuel-${i}`} />
                  <Err m={errors[`${i}.fuel`]} id={`error-${testId}-fuel-${i}`} /></label>
              </div>
              <p className="mt-2 border-t border-border/60 pt-2 font-mono text-[10.5px] text-muted-foreground" data-testid={`text-${testId}-total-${i}`}>
                зарплата {kzt(t.salary)} · топливо {kzt(t.fuel)} · <b className="text-foreground">итого {kzt(t.total)}</b>
              </p>
            </section>
          );
        })}
        <button type="button" className="button button-secondary" disabled={disabled || rows.length >= MAX_WORKS} onClick={() => onChange([...rows, emptySupportRow()])} data-testid={`button-${testId}-add`}><Plus size={14} />Добавить сопутствующую работу{rows.length >= MAX_WORKS ? ` (предел ${MAX_WORKS})` : ""}</button>
      </>}
      <BudgetBox mainBudget={mainBudget} support={support} parts={enabled ? agg : null} testId={`${testId}-budget`} />
    </div>
  );
}

function BudgetBox({ mainBudget, support, parts, testId }: { mainBudget?: { pay: number; fuel: number; seeds?: number } | null; support: number; parts: { salary: number; fuel: number } | null; testId: string }) {
  const main = mainBudget ? r2(mainBudget.pay + mainBudget.fuel) : null;
  const seeds = mainBudget?.seeds != null ? r2(mainBudget.seeds) : null;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-[11px] leading-5" data-testid={testId}>
      <p className="eyebrow mb-1">Предполагаемые затраты</p>
      {mainBudget && <p className="flex justify-between gap-2"><span>Основная работа (га × расценка + топливо)</span><span className="font-mono">{kzt(main!)}</span></p>}
      {seeds !== null && <p className="flex justify-between gap-2" data-testid={`${testId}-seeds`}><span>Семена для посева (план)</span><span className="font-mono">{kzt(seeds)}</span></p>}
      {parts && <p className="flex justify-between gap-2"><span>Сопутствующие: зарплата {kzt(r2(parts.salary))}, топливо {kzt(r2(parts.fuel))}</span><span className="font-mono">{kzt(support)}</span></p>}
      {main !== null && <p className="mt-1 flex justify-between gap-2 border-t border-primary/20 pt-1 font-bold"><span>Всего по операции</span><span className="font-mono" data-testid={`${testId}-total`}>{kzt(r2(main + support + (seeds ?? 0)))}</span></p>}
      <p className="mt-1 text-[10px] text-muted-foreground">Бюджет-декларация. Не создаёт начислений зарплаты, выдачи топлива или списаний со склада.</p>
    </div>
  );
}

/** Read-only summary of saved supporting works. */
export function SupportingWorksSummary({ works, title, testId, renderAction }: { works?: FieldSupportingWork[] | null; title: string; testId: string; renderAction?: (index: number) => ReactNode }) {
  if (!works?.length) return null;
  return (
    <div className="mt-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-[10.5px] leading-5" data-testid={testId}>
      <p className="flex items-center gap-1.5 font-bold"><Users size={11} className="text-muted-foreground" />{title} · {works.length}<span className="ml-auto font-mono font-normal text-muted-foreground">предполагаемые затраты {kzt(worksTotal(works))}</span></p>
      <ul className="mt-1 divide-y divide-border/50">{works.map((w, i) => (
        <li key={i} className="py-1" data-testid={`${testId}-row-${i}`}>
          <span className="font-semibold">{w.name}</span>
          <span className="text-muted-foreground"> · {w.equipmentName || (w.equipmentId ? `техника № ${w.equipmentId}` : "без техники")} · {w.employeeIds.length ? (w.employeeNames?.length ? w.employeeNames.join(", ") : `${w.employeeIds.length} сотр.`) : "без сотрудников"}</span>
          <span className="block font-mono text-muted-foreground">зарплата {kzt(w.salaryCost)} · топливо {kzt(w.fuelCost)} · итого {kzt(workTotal(w))}</span>
          {renderAction && <div className="mt-1">{renderAction(i)}</div>}
        </li>))}</ul>
    </div>
  );
}
