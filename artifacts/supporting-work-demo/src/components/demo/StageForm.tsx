import { Lock, Send, CheckCircle2 } from "lucide-react";
import { STAGES, blockReason, isDone, fmt, parsePositive, loaderPay, IDS, type DemoState, type Drafts, type FieldErrors, type StageId } from "@/demo/model";
import { Btn, Check, Field, TextInput, DemoTag } from "./ui";

interface Props {
  state: DemoState;
  stage: StageId;
  errors: FieldErrors;
  onDraft: <K extends keyof Drafts>(key: K, patch: Partial<Drafts[K]>) => void;
  onSubmit: () => void;
}

const live = (a: string, b: string) => {
  const x = parsePositive(a), y = parsePositive(b);
  return x.ok && y.ok ? fmt(Math.round(x.value * y.value * 100) / 100) : "—";
};

export function StageForm({ state, stage, errors, onDraft, onSubmit }: Props) {
  const meta = STAGES[stage - 1];
  const done = isDone(state, stage);
  const reason = blockReason(state, stage);
  const locked = !done && !!reason;
  const dis = done || locked;
  const d = state.drafts;
  const r = state.records;

  let body: React.ReactNode = null;
  if (stage === 1) body = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Основная работа"><div className="border border-dashed border-input px-3 py-2 text-sm">Посев · Поле 1 · {IDS.mainWork}</div></Field>
        <Field label="Плановая площадь посева" error={errors.plannedHa}><TextInput numeric suffix="га" testId="input-plan-ha" value={d.plan.plannedHa} disabled={dis} invalid={!!errors.plannedHa} onChange={(v) => onDraft("plan", { plannedHa: v })} /></Field>
        <Field label="План: водитель" error={errors.driver}><TextInput numeric suffix="KZT" testId="input-plan-driver" value={d.plan.driver} disabled={dis} invalid={!!errors.driver} onChange={(v) => onDraft("plan", { driver: v })} /></Field>
        <Field label="План: дизель" error={errors.diesel}><TextInput numeric suffix="KZT" testId="input-plan-diesel" value={d.plan.diesel} disabled={dis} invalid={!!errors.diesel} onChange={(v) => onDraft("plan", { diesel: v })} /></Field>
        <Field label="План: грузчик Тока" error={errors.loader}><TextInput numeric suffix="KZT" testId="input-plan-loader" value={d.plan.loader} disabled={dis} invalid={!!errors.loader} onChange={(v) => onDraft("plan", { loader: v })} /></Field>
        <Field label="Плановый итог"><div className="num border border-input bg-muted px-3 py-2 text-sm">{(() => { const a = [d.plan.driver, d.plan.diesel, d.plan.loader].map((x) => parsePositive(x)); return a.every((x) => x.ok) ? fmt(a.reduce((s, x) => s + (x as { value: number }).value, 0)) : "—"; })()}</div></Field>
      </div>
      <p className="text-xs text-muted-foreground">Семена в бюджет доставки не включаются — это отдельный материал.</p>
    </>
  );
  if (stage === 2) body = (
    <>
      <Field label="Контекст посева (комментарий)" hint="Поля для фактической стоимости здесь нет намеренно — она придёт из источников.">
        <textarea data-testid="input-start-note" disabled={dis} value={d.start.note} onChange={(e) => onDraft("start", { note: e.target.value })} rows={3} className="w-full border border-input bg-card px-3 py-2 text-sm outline-none focus:border-foreground disabled:opacity-60" />
      </Field>
      {r.plan && <div className="num text-xs text-muted-foreground">План {r.plan.id}: {fmt(r.plan.driver + r.plan.diesel + r.plan.loader)}</div>}
    </>
  );
  if (stage === 3) body = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Семена отгружено" error={errors.tons} hint="Отгрузка, а не расход на посев"><TextInput numeric suffix="т" testId="input-tok-tons" value={d.tok.tons} disabled={dis} invalid={!!errors.tons} onChange={(v) => onDraft("tok", { tons: v })} /></Field>
        <Field label="Машина" error={errors.truck}><TextInput testId="input-tok-truck" value={d.tok.truck} disabled={dis} invalid={!!errors.truck} onChange={(v) => onDraft("tok", { truck: v })} /></Field>
        <Field label="Водитель (демо)" error={errors.driver}><TextInput testId="input-tok-driver" value={d.tok.driver} disabled={dis} invalid={!!errors.driver} onChange={(v) => onDraft("tok", { driver: v })} /></Field>
        <Field label="Расстояние" error={errors.km}><TextInput numeric suffix="км" testId="input-tok-km" value={d.tok.km} disabled={dis} invalid={!!errors.km} onChange={(v) => onDraft("tok", { km: v })} /></Field>
        <Field label="Грузчик, часы" error={errors.hours}><TextInput numeric suffix="ч" testId="input-tok-hours" value={d.tok.hours} disabled={dis} invalid={!!errors.hours} onChange={(v) => onDraft("tok", { hours: v })} /></Field>
        <Field label="Ставка грузчика" error={errors.rate}><TextInput numeric suffix="KZT/ч" testId="input-tok-rate" value={d.tok.rate} disabled={dis} invalid={!!errors.rate} onChange={(v) => onDraft("tok", { rate: v })} /></Field>
      </div>
      <div className="num text-sm">Грузчик: <b>{done && r.tok ? fmt(loaderPay(r.tok)) : live(d.tok.hours, d.tok.rate)}</b> · рейс <b>{IDS.trip}</b></div>
      <Check testId="check-warehouse" disabled={dis} checked={d.tok.warehouseOk} onChange={(v) => onDraft("tok", { warehouseOk: v })} label="Склад разрешил отпуск семян (симуляция подтверждения склада для демо)" />
      {errors.warehouseOk && <p className="text-xs text-destructive">{errors.warehouseOk}</p>}
    </>
  );
  if (stage === 4) body = (
    <>
      {r.tok && <div className="num border border-dashed border-input p-3 text-sm">Рейс {r.tok.tripId}: {r.tok.truck}, {r.tok.driver}, {r.tok.tons} т × {r.tok.km} км = {r.tok.tons * r.tok.km} т·км</div>}
      <Field label="Тариф водителя" error={errors.tariff}><TextInput numeric suffix="KZT/т·км" testId="input-motor-tariff" value={d.motor.tariff} disabled={dis} invalid={!!errors.tariff} onChange={(v) => onDraft("motor", { tariff: v })} /></Field>
      <div className="num text-sm">Оплата водителя: <b>{r.motor ? fmt(r.motor.wage) : r.tok ? live(String(r.tok.tons * r.tok.km), d.motor.tariff) : "—"}</b> → отправляется в ОК</div>
    </>
  );
  if (stage === 5) body = (
    <>
      {r.tok && <div className="num border border-dashed border-input p-3 text-sm">Привязка: {IDS.work} · Поле 1 · {r.tok.truck} · рейс {r.tok.tripId}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Выдано дизеля" error={errors.liters}><TextInput numeric suffix="л" testId="input-fuel-liters" value={d.fuel.liters} disabled={dis} invalid={!!errors.liters} onChange={(v) => onDraft("fuel", { liters: v })} /></Field>
        <Field label="Цена" error={errors.price}><TextInput numeric suffix="KZT/л" testId="input-fuel-price" value={d.fuel.price} disabled={dis} invalid={!!errors.price} onChange={(v) => onDraft("fuel", { price: v })} /></Field>
      </div>
      <div className="num text-sm">Дизель: <b>{r.fuel ? fmt(r.fuel.cost) : live(d.fuel.liters, d.fuel.price)}</b></div>
    </>
  );
  if (stage === 6) body = (
    <>
      <p className="text-sm text-muted-foreground">Два отдельных начисления. До утверждения они видны как «ожидает ОК» и не входят в итог.</p>
      <Check testId="check-hr-driver" disabled={dis} checked={d.hr.driver} onChange={(v) => onDraft("hr", { driver: v })} label={`Утвердить начисление водителю ${r.motor ? fmt(r.motor.wage) : ""} (${IDS.hrDriver})`} />
      <Check testId="check-hr-loader" disabled={dis} checked={d.hr.loader} onChange={(v) => onDraft("hr", { loader: v })} label={`Утвердить начисление грузчику ${r.tok ? fmt(loaderPay(r.tok)) : ""} (${IDS.hrLoader})`} />
      {errors.hr && <p className="text-xs text-destructive">{errors.hr}</p>}
    </>
  );
  if (stage === 7) body = (
    <>
      <Field label="Фактические гектары посева" error={errors.actualHa} hint="Из ежедневного факта диспетчера по посеву. Рейс гектары не создаёт."><TextInput numeric suffix="га" testId="input-finish-ha" value={d.finish.actualHa} disabled={dis} invalid={!!errors.actualHa} onChange={(v) => onDraft("finish", { actualHa: v })} /></Field>
      <Check testId="check-finish-ack" disabled={dis} checked={d.finish.ack} onChange={(v) => onDraft("finish", { ack: v })} label="Семена по рейсу получены на поле 1. Закрыть сопутствующую работу (основной посев не закрывается)." />
      {errors.ack && <p className="text-xs text-destructive">{errors.ack}</p>}
    </>
  );

  return (
    <section className="border border-border bg-card" data-testid={`form-stage-${stage}`}>
      <header className="border-b border-border p-4 sm:p-5">
        <div className="flex items-center gap-2"><span className="num text-xs text-muted-foreground">Этап 0{stage}</span><DemoTag /></div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{meta.title}</h2>
        <div className="text-sm text-muted-foreground">Экран роли: <b className="text-foreground">{meta.role}</b></div>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div className="bg-muted p-2"><dt className="uppercase tracking-wider text-muted-foreground">Кто что вводит</dt><dd className="mt-1">{meta.inputs}</dd></div>
          <div className="bg-muted p-2"><dt className="uppercase tracking-wider text-muted-foreground">Что меняется</dt><dd className="mt-1">{meta.effect}</dd></div>
        </dl>
      </header>
      <div className="relative space-y-4 p-4 sm:p-5">
        {locked && (
          <div className="flex items-start gap-2 border border-foreground bg-background p-3 text-sm" data-testid="text-locked">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />{reason}
          </div>
        )}
        {body}
      </div>
      <footer className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        {done ? (
          <span className="flex items-center gap-2 text-sm" data-testid="text-stage-done"><CheckCircle2 className="h-4 w-4" />Отправлено. Запись закреплена — повторная отправка невозможна.</span>
        ) : (
          <span className="text-xs text-muted-foreground">Отправка создаёт демо-запись только в этом браузере.</span>
        )}
        <Btn testId={`button-submit-stage-${stage}`} disabled={dis} onClick={onSubmit}><Send className="h-4 w-4" />Отправить этап</Btn>
      </footer>
    </section>
  );
}
