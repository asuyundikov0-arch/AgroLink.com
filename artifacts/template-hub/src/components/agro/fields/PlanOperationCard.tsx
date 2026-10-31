import { type ReactNode, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Banknote, CalendarRange, ChevronDown, Cog, Droplet, FlaskConical, Fuel, History, MapPin, Pencil, ShieldCheck, Shovel, SprayCan, Sprout, Tractor, Truck, UserRound, Wheat } from "lucide-react";
import type { AgroField, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { SeedPlanSummary } from "./SeedPlanEditor";
import { SupportingWorksSummary } from "./SupportingWorksEditor";
import { StatusPill, cx, dateFmt, ha } from "./shared";

export const kzt = (v: number | null | undefined) => v == null ? "—" : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(v)} ₸`;
const qty = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(v);

export type OpKind = "sowing" | "fertilizing" | "chemical" | "fungicide" | "cultivation" | "harvest" | "hauling" | "other";
export const OP_KINDS: Record<OpKind, { label: string; hue: string; icon: LucideIcon }> = {
  sowing: { label: "Посев", hue: "142 55% 38%", icon: Sprout },
  fertilizing: { label: "Удобрения", hue: "38 92% 46%", icon: Droplet },
  chemical: { label: "Химобработка", hue: "190 80% 40%", icon: SprayCan },
  fungicide: { label: "Фунгициды", hue: "268 60% 55%", icon: ShieldCheck },
  cultivation: { label: "Обработка почвы", hue: "26 45% 38%", icon: Shovel },
  harvest: { label: "Уборка", hue: "2 70% 50%", icon: Wheat },
  hauling: { label: "Вывоз", hue: "212 80% 48%", icon: Truck },
  other: { label: "Прочие", hue: "210 12% 45%", icon: Tractor },
};
const RULES: [OpKind, RegExp][] = [
  ["fungicide", /фунгиц/i],
  ["hauling", /вывоз|перевоз|транспорт|отвоз/i],
  ["harvest", /уборк|обмолот|скашив|свал|жатв/i],
  ["fertilizing", /удобр|подкорм|аммиач|селитр/i],
  ["chemical", /сзр|гербиц|инсектиц|химпрополк|прополк|опрыск|десикац|протрав|химобр|химич/i],
  ["sowing", /посев|сев\b|^сев|подсев/i],
  ["cultivation", /культив|дискован|боронов|лущен|вспаш|пахот|прикат|рыхл|глубокорых|снегозад|обработк[аи] почв/i],
];
/** Operation type from its real name; drives colour and icon only, never data. */
export function opKind(name: string): OpKind {
  for (const [k, re] of RULES) if (re.test(name)) return k;
  return "other";
}

export type Machine = { equipment: string; employee: string; implement: string };
export function machinesOf(o: FieldOperation): Machine[] {
  if (o.plannedAssignments?.length) return o.plannedAssignments.map((r) => ({ equipment: r.equipmentName || `Техника №${r.equipmentId}`, employee: r.employeeName || `Сотрудник №${r.employeeId}`, implement: r.implement || "" }));
  return [{ equipment: o.plannedEquipment || "", employee: o.responsible || "", implement: o.plannedImplement || "" }];
}

export type ChemBatchInfo = { name: string; unit: string; unitPrice: number };

type Props = {
  op: FieldOperation; field?: AgroField; season?: FieldSeason; manage: boolean;
  chemBatches?: Map<number, ChemBatchInfo>; showField?: boolean; defaultOpen?: boolean;
  onEdit: (o: FieldOperation) => void; onHistory?: (fieldId: number) => void; onOpenField?: (fieldId: number) => void;
};

const Muted = ({ t }: { t: string }) => <span className="text-muted-foreground">{t}</span>;

export function PlanOperationCard({ op: o, field: f, season: s, manage, chemBatches, showField = true, defaultOpen = false, onEdit, onHistory, onOpenField }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const kind = opKind(o.name);
  const K = OP_KINDS[kind];
  const Icon = K.icon;
  const ms = machinesOf(o);
  const chems = o.chemicalPlan ?? [];
  const extras = [chems.length ? `химия ${chems.length}` : "", o.supportingWorks?.length ? `сопутств. ${o.supportingWorks.length}` : "", o.seeds && kind === "sowing" ? "семена" : "", o.notes ? "заметка" : ""].filter(Boolean);
  return (
    <article className="op-card" style={{ ["--op" as string]: K.hue }} data-kind={kind} data-testid={`row-plan-op-${o.id}`}>
      <div className="grid gap-4 p-4 pl-5 md:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.5fr)] md:gap-6">
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-bold tracking-tight" data-testid={`text-plan-dates-${o.id}`}>{dateFmt(o.plannedStart)} – {dateFmt(o.plannedEnd)}</p>
          <div className="mt-2.5 flex items-start gap-3">
            <span className="op-card-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold leading-tight [overflow-wrap:anywhere]" data-testid={`text-plan-op-name-${o.id}`}>{o.name}</h3>
              {s && <p className="mt-0.5 text-[12px] text-muted-foreground">{s.cropName}{s.variety ? ` · ${s.variety}` : ""}</p>}
              {showField && f && <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted-foreground" data-testid={`text-plan-op-field-${o.id}`}><MapPin size={12} />Поле {f.number} ({ha(o.plannedAreaHa)}){f.unit ? <span className="hidden sm:inline"> · {f.unit}</span> : null}{!f.isActive && " · архив"}</p>}
              {!showField && <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted-foreground"><MapPin size={12} />{ha(o.plannedAreaHa)}</p>}
              <div className="mt-2"><StatusPill op={o} /></div>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-2.5" data-testid={`text-plan-mechanic-${o.id}`}>
              {ms.map((m, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid={`row-plan-machine-${o.id}-${i}`}>
                  <div className="flex min-w-0 items-start gap-2.5"><Tractor size={20} className="mt-0.5 shrink-0 text-foreground/80" />
                    <div className="min-w-0"><p className="text-[10.5px] text-muted-foreground">Техника{ms.length > 1 ? ` ${i + 1}` : ""}</p><p className="text-[12.5px] font-semibold [overflow-wrap:anywhere]">{m.equipment || <Muted t="не указана" />}</p>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><UserRound size={11} />{m.employee || "механизатор не указан"}</p></div></div>
                  <div className="flex min-w-0 items-start gap-2.5"><Cog size={20} className="mt-0.5 shrink-0 text-foreground/80" />
                    <div className="min-w-0"><p className="text-[10.5px] text-muted-foreground">Агрегат</p><p className="text-[12.5px] font-semibold [overflow-wrap:anywhere]">{m.implement || <Muted t="не указан" />}</p></div></div>
                </div>
              ))}
            </div>
            {manage && <button type="button" className="op-card-edit" onClick={() => onEdit(o)} aria-label={`Изменить план «${o.name}»`} data-testid={`button-plan-edit-op-${o.id}`}><Pencil size={14} /></button>}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/60 pt-3 sm:grid-cols-3" data-testid={`text-plan-costs-${o.id}`}>
            <Metric icon={<Banknote size={18} />} tone="op-m-rate" label="Расценка" value={o.plannedRatePerHa > 0 ? `${kzt(o.plannedRatePerHa)}/га` : "не задана"} />
            <Metric icon={<UserRound size={18} />} tone="op-m-pay" label="ЗП по плану" value={kzt(o.plannedPayAmount)} />
            <Metric icon={<Fuel size={18} />} tone="op-m-fuel" label="ГСМ (стоимость)" value={kzt(o.plannedFuelCost)} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-1.5 pl-5">
        <button type="button" className="op-card-more" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid={`button-plan-details-${o.id}`}>
          <ChevronDown size={13} className={cx("transition-transform", open && "rotate-180")} />{open ? "Скрыть детали" : "Детали плана"}{extras.length > 0 && <span className="text-muted-foreground">· {extras.join(" · ")}</span>}
        </button>
        <span className="ml-auto flex gap-1.5">
          {f && onOpenField && <button type="button" className="op-card-link" onClick={() => onOpenField(f.id)} data-testid={`button-plan-open-field-op-${o.id}`}><CalendarRange size={12} />План поля</button>}
          {f && onHistory && <button type="button" className="op-card-link" onClick={() => onHistory(f.id)} data-testid={`button-plan-history-op-${o.id}`}><History size={12} />История</button>}
        </span>
      </div>
      {open && (
        <div className="space-y-2 border-t border-border/60 bg-muted/20 px-4 py-3 pl-5 text-[11px]" data-testid={`section-plan-details-${o.id}`}>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span><Muted t="Площадь операции: " /><span className="font-mono">{ha(o.plannedAreaHa)}</span></span>
            <span><Muted t="Расценка: " /><span className="font-mono">{o.plannedRatePerHa > 0 ? `${kzt(o.plannedRatePerHa)}/га` : "не задана"}</span></span>
            <span><Muted t="ЗП по плану (итого): " /><span className="font-mono font-semibold">{kzt(o.plannedPayAmount)}</span></span>
            <span><Muted t="План ДТ (стоимость, итого): " /><span className="font-mono">{kzt(o.plannedFuelCost)}</span></span>
            <span><Muted t="Машин: " /><span className="font-mono">{ms.length}</span></span>
          </div>
          {o.requiresChemicals && (
            <div className="rounded-md border border-border/70 px-2.5 py-2" data-testid={`text-plan-chems-${o.id}`}>
              <p className="flex items-center gap-1.5 font-bold"><FlaskConical size={11} />Химия по плану</p>
              {chems.length === 0 ? <p className="text-muted-foreground">Нормы не заданы.</p> : chems.map((c) => {
                const b = chemBatches?.get(c.batchId); const total = c.ratePerHa * o.plannedAreaHa;
                return <p key={c.batchId} className="[overflow-wrap:anywhere]"><span className="font-semibold">{b?.name ?? `Партия №${c.batchId}`}</span><span className="font-mono text-muted-foreground"> · {qty(c.ratePerHa)} {b?.unit ?? ""}/га × {ha(o.plannedAreaHa)} = {qty(total)} {b?.unit ?? ""}{b ? ` · ≈ ${kzt(Math.round(total * b.unitPrice * 100) / 100)}` : ""}</span></p>;
              })}
            </div>
          )}
          <SeedPlanSummary seeds={o.seeds} opName={o.name} testId={`text-season-seeds-${o.id}`} />
          <SupportingWorksSummary works={o.supportingWorks} title="Сопутствующие работы по плану" testId={`text-season-support-${o.id}`} />
          {o.notes && <p className="whitespace-pre-wrap"><Muted t="Заметка: " />{o.notes}</p>}
        </div>
      )}
    </article>
  );
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return <div className="flex items-center gap-2.5"><span className={cx("op-metric-icon", tone)}>{icon}</span><div className="min-w-0"><p className="text-[10.5px] text-muted-foreground">{label}</p><p className="font-mono text-[12.5px] font-bold">{value}</p></div></div>;
}
