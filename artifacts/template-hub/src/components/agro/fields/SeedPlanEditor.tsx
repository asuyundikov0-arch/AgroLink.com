import { Sprout } from "lucide-react";
import { type FieldSeedPlan } from "@workspace/api-client-react";

const SOWING_RE = /^(посев|сев)(?:\s|$|[-:])/iu;
/** Mirrors server daily-seeding.ts: main operation qualifies as sowing. */
export const isSowing = (name?: string | null) => SOWING_RE.test((name ?? "").normalize("NFKC").trim());

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const kzt = (v: number) => `${money.format(v)} ₸`;
const r2 = (v: number) => Math.round(v * 100) / 100;
export const UNIT_LABEL: Record<FieldSeedPlan["unit"], string> = { kg: "кг", ton: "т" };

export type SeedRow = { name: string; quantity: string; unit: FieldSeedPlan["unit"]; unitPrice: string };
export const seedRowFrom = (s?: FieldSeedPlan | null): SeedRow =>
  s ? { name: s.name, quantity: String(s.quantity), unit: s.unit, unitPrice: String(s.unitPrice) } : { name: "", quantity: "", unit: "kg", unitPrice: "" };
export const seedTotal = (s?: FieldSeedPlan | null) => (s ? r2(s.quantity * s.unitPrice) : 0);

function num(s: string, max: number, dp: number): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${dp}})?$`).test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v <= max ? v : null;
}

/** Validate the seed row. Returns plan or field errors. */
export function seedPlanOf(row: SeedRow): { plan: FieldSeedPlan | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = row.name.trim();
  if (!name) errors.name = "Укажите семена (культура, сорт, репродукция)"; else if (name.length > 200) errors.name = "Не более 200 символов";
  const q = num(row.quantity, 1_000_000, 3); if (q === null) errors.quantity = "От 0 до 1 000 000, до 3 знаков";
  const p = num(row.unitPrice, 1_000_000_000, 2); if (p === null) errors.unitPrice = "От 0 до 1 000 000 000 ₸, до 2 знаков";
  if (q !== null && p !== null && q * p > 1e12) errors.unitPrice = "Сумма не более 1 000 000 000 000 ₸";
  if (Object.keys(errors).length) return { plan: null, errors };
  return { plan: { name, quantity: q!, unit: row.unit, unitPrice: p! }, errors };
}
export const seedRowTotal = (row: SeedRow) => {
  const q = num(row.quantity, 1_000_000, 3) ?? 0, p = num(row.unitPrice, 1_000_000_000, 2) ?? 0;
  return r2(q * p);
};

const Lbl = ({ children }: { children: string }) => <span className="mb-1 block text-[10.5px] font-semibold text-muted-foreground">{children}</span>;
const Err = ({ m, id }: { m?: string; id: string }) => (m ? <span className="mt-1 block text-[10px] font-semibold text-destructive" data-testid={id}>{m}</span> : null);

export function SeedPlanEditor({ enabled, onToggle, row, onChange, errors, disabled, testId }: {
  enabled: boolean; onToggle: (v: boolean) => void; row: SeedRow; onChange: (r: SeedRow) => void; errors: Record<string, string>; disabled?: boolean; testId: string;
}) {
  const set = (p: Partial<SeedRow>) => onChange({ ...row, ...p });
  return (
    <div className="space-y-3 sm:col-span-2" data-testid={testId}>
      <label className="flex items-start gap-2 text-xs font-semibold" htmlFor={`${testId}-toggle`}>
        <input id={`${testId}-toggle`} type="checkbox" className="mt-0.5" checked={enabled} disabled={disabled} onChange={(ev) => onToggle(ev.target.checked)} data-testid={`checkbox-${testId}`} />
        <span>Указать семена для посева<span className="block text-[10.5px] font-normal text-muted-foreground">Плановая потребность и предполагаемая стоимость. Не списывает семена со склада и не является фактическим расходом.</span></span>
      </label>
      {enabled && (
        <section className="rounded-lg border border-border bg-muted/20 p-3" data-testid={`card-${testId}`}>
          <div className="mb-2 flex items-center gap-2"><Sprout size={13} className="text-primary" /><span className="text-[11px] font-bold">Семена (план)</span></div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block sm:col-span-2"><Lbl>Наименование семян *</Lbl>
              <input className="text-input" maxLength={200} placeholder="Пшеница Шортандинская 95, элита" value={row.name} disabled={disabled} onChange={(ev) => set({ name: ev.target.value })} data-testid={`input-${testId}-name`} />
              <Err m={errors.name} id={`error-${testId}-name`} /></label>
            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
              <label className="block"><Lbl>Количество *</Lbl>
                <input className="text-input font-mono" inputMode="decimal" value={row.quantity} disabled={disabled} onChange={(ev) => set({ quantity: ev.target.value })} data-testid={`input-${testId}-quantity`} />
                <Err m={errors.quantity} id={`error-${testId}-quantity`} /></label>
              <label className="block"><Lbl>Ед.</Lbl>
                <select className="text-input" value={row.unit} disabled={disabled} onChange={(ev) => set({ unit: ev.target.value as SeedRow["unit"] })} data-testid={`select-${testId}-unit`}>
                  <option value="kg">кг</option><option value="ton">т</option>
                </select></label>
            </div>
            <label className="block"><Lbl>{`Цена за ${UNIT_LABEL[row.unit]}, ₸ *`}</Lbl>
              <input className="text-input font-mono" inputMode="decimal" value={row.unitPrice} disabled={disabled} onChange={(ev) => set({ unitPrice: ev.target.value })} data-testid={`input-${testId}-price`} />
              <Err m={errors.unitPrice} id={`error-${testId}-price`} /></label>
          </div>
          <p className="mt-2 border-t border-border/60 pt-2 font-mono text-[10.5px] text-muted-foreground" data-testid={`text-${testId}-total`}>
            предполагаемая стоимость семян · <b className="text-foreground">{kzt(seedRowTotal(row))}</b>
          </p>
        </section>
      )}
    </div>
  );
}

/** Read-only planned seeds summary for sowing operations. */
export function SeedPlanSummary({ seeds, opName, testId }: { seeds?: FieldSeedPlan | null; opName: string; testId: string }) {
  if (!seeds || !isSowing(opName)) return null;
  return (
    <div className="mt-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-[10.5px] leading-5" data-testid={testId}>
      <p className="flex items-center gap-1.5 font-bold"><Sprout size={11} className="text-primary" />Семена по плану<span className="ml-auto font-mono font-normal text-muted-foreground">предполагаемо {kzt(seedTotal(seeds))}</span></p>
      <p><span className="font-semibold">{seeds.name}</span><span className="font-mono text-muted-foreground"> · {qtyFmt.format(seeds.quantity)} {UNIT_LABEL[seeds.unit]} × {kzt(seeds.unitPrice)}</span></p>
    </div>
  );
}
