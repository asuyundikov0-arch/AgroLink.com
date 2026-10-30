import { buildLedger, computeTotals, fmt, IDS, type DemoState } from "@/demo/model";
import { DemoTag } from "./ui";

export function Summary({ state }: { state: DemoState }) {
  const t = computeTotals(state);
  const r = state.records;
  const row = (label: string, val: number | null, note: string, id?: string) => (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border py-2 text-sm">
      <div><div>{label}</div><div className="text-[11px] text-muted-foreground num">{id ?? note}</div></div>
      <span className="num shrink-0" data-testid={`text-sum-${label}`}>{fmt(val)}</span>
    </div>
  );
  return (
    <section className="border border-foreground bg-card">
      <header className="flex items-center justify-between border-b border-foreground px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-[.18em]">Доставка семян</div>
          <div className="num text-[11px] text-muted-foreground">{IDS.work} · Поле 1 · к {IDS.mainWork}</div>
        </div>
        <DemoTag />
      </header>
      <div className="grid grid-cols-2 gap-px bg-border text-xs">
        <div className="bg-card p-3"><div className="text-muted-foreground">Выполнение работы</div><div className="mt-1 font-semibold" data-testid="status-work">{t.workStatus}</div></div>
        <div className="bg-card p-3"><div className="text-muted-foreground">Согласование затрат</div><div className={`mt-1 font-semibold ${t.costStatus === "ожидает ОК" ? "text-accent" : ""}`} data-testid="status-cost">{t.costStatus}</div></div>
      </div>
      <div className="px-4 pb-4 pt-2">
        {row("Водитель", t.driverPay, r.motor ? "" : "ждём Автопарк", r.motor?.id)}
        {row("Грузчик Тока", t.loaderPay, r.tok ? "" : "ждём Ток", r.tok?.loaderId)}
        {row("Дизель", t.fuel, r.fuel ? "" : "ждём Топливный склад", r.fuel?.id)}
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span>Подтверждено</span><span className="num font-semibold" data-testid="text-confirmed">{fmt(t.confirmed)}</span></div>
          {t.pendingHr > 0 && <div className="flex justify-between text-accent"><span>Ожидает ОК (не итог)</span><span className="num" data-testid="text-pending">{fmt(t.pendingHr)}</span></div>}
          <div className="flex justify-between text-muted-foreground"><span>План</span><span className="num">{fmt(t.planned || null)}</span></div>
        </div>
        <div className="mt-4 bg-foreground p-4 text-background">
          <div className="text-[11px] uppercase tracking-[.18em] opacity-70">{t.isFinal ? "Итоговая фактическая стоимость" : "Итог ещё не сформирован"}</div>
          <div className="num mt-1 text-3xl font-semibold" data-testid="text-final">{t.isFinal ? fmt(t.confirmed) : "—"}</div>
          {t.isFinal && (
            <div className="mt-2 space-y-0.5 text-xs opacity-80 num">
              <div>{t.variance! >= 0 ? `Ниже плана на ${fmt(t.variance)}` : `Выше плана на ${fmt(-t.variance!)}`}</div>
              <div>{fmt(t.perHa)}/га · {t.actualHa} фактических га (из факта диспетчера)</div>
              <div className="opacity-80">Только сопутствующая доставка, не полная стоимость посева.</div>
            </div>
          )}
          {!t.isFinal && <div className="mt-2 text-xs opacity-70">Нужны: утверждение ОК (этап 6) и приёмка агронома (этап 7).</div>}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Семена{r.tok ? ` ${r.tok.tons} т` : ""} — отдельный материальный учёт, в итог не входят. Основной посев этой приёмкой не закрывается.</p>
      </div>
    </section>
  );
}

export function Ledger({ state }: { state: DemoState }) {
  const rows = buildLedger(state);
  return (
    <section className="border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs uppercase tracking-[.18em]">Журнал источников</span>
        <span className="num text-[11px] text-muted-foreground">{rows.length} записей</span>
      </header>
      {rows.length === 0 ? (
        <div className="grid-paper px-4 py-8 text-center text-sm text-muted-foreground">Пока пусто. Записи появятся, когда Ток, Автопарк и склад внесут свои данные.</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.sourceId} className="rise px-4 py-3" data-testid={`row-ledger-${r.sourceId}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="num text-[11px] text-muted-foreground">{r.sourceId}</div>
                  <div className="text-sm font-medium">{r.source} · {r.kind}</div>
                </div>
                <div className="text-right">
                  <div className="num text-sm">{r.amount == null ? "—" : fmt(r.amount)}</div>
                  <div className={`text-[10px] uppercase tracking-wider ${r.status === "ожидает ОК" ? "text-accent" : "text-muted-foreground"}`}>{r.status}</div>
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{r.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
