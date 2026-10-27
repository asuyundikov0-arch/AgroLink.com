import { useState } from "react";
import { RefreshCw, Sprout, TriangleAlert } from "lucide-react";
import { getGetDailySeedingReportQueryKey, useGetDailySeedingReport } from "@workspace/api-client-react";
import { POLL_MS, UNITS, dateFmt, errorInfo, ha } from "./fields/shared";

const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

export default function DailySeedingReportWorkspace() {
  const [date, setDate] = useState(localToday);
  const [year, setYear] = useState(() => Number(localToday().slice(0, 4)));
  const [unit, setUnit] = useState("");
  const params = { year, date, ...(unit ? { unit } : {}) };
  const q = useGetDailySeedingReport(params, { query: { queryKey: getGetDailySeedingReportQueryKey(params), refetchInterval: POLL_MS, enabled: !!date && year >= 2000 } });
  const r = q.data;
  const years = Array.from({ length: 6 }, (_, i) => Number(localToday().slice(0, 4)) + 1 - i);
  return (
    <div className="space-y-5" data-testid="seeding-report-workspace">
      <header>
        <p className="eyebrow">Агрономия · формируется автоматически из факта посева</p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Ежедневный отчёт</h1>
        <p className="mt-1 text-xs text-muted-foreground">Посев за день и с начала сезона по культурам. Отчёт не редактируется вручную — исправления вносятся в фактических работах.
          {q.isFetching && !q.isLoading && <span className="ml-2 inline-flex items-center gap-1 text-[hsl(203_87%_33%)]"><RefreshCw size={11} className="animate-spin" />синхронизация</span>}</p>
      </header>
      <div className="flex flex-wrap gap-2" aria-label="Фильтры отчёта">
        <input type="date" aria-label="Дата" className="text-input !w-auto" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-seeding-date" />
        <select aria-label="Сезон" className="text-input !w-auto font-mono" value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="select-seeding-year">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <select aria-label="Хозяйство" className="text-input !w-auto" value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="select-seeding-unit"><option value="">Все хозяйства</option>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
      </div>
      {q.isLoading ? <div className="space-y-3" data-testid="status-seeding-loading"><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-48 rounded-xl" /></div>
      : q.isError || !r ? (
        <div className="surface-card empty-state" data-testid="status-seeding-error"><div className="empty-icon empty-icon-error"><TriangleAlert size={20} /></div><h3 className="mt-4 text-sm font-bold">Не удалось сформировать отчёт</h3><p className="mt-1 text-xs text-muted-foreground">{errorInfo(q.error).message}</p>
          <button type="button" className="button button-secondary mt-4" onClick={() => q.refetch()} data-testid="button-seeding-retry">Повторить</button></div>
      ) : (
        <section className="surface-card overflow-hidden" data-testid="section-seeding-report">
          <div className="grid gap-px border-b border-border bg-border sm:grid-cols-2">
            <div className="bg-card p-4"><p className="text-[11px] font-semibold text-muted-foreground">Посеяно за {dateFmt(r.date)}</p><p className="mt-1 font-mono text-2xl font-bold" data-testid="text-seeding-daily-total">{ha(r.dailyAreaHa)}</p></div>
            <div className="bg-card p-4"><p className="text-[11px] font-semibold text-muted-foreground">С начала сезона {r.year}</p><p className="mt-1 font-mono text-2xl font-bold" data-testid="text-seeding-season-total">{ha(r.totalAreaHa)}</p><p className="text-[10.5px] text-muted-foreground">{r.unit ?? "Все хозяйства"}</p></div>
          </div>
          {r.crops.length === 0 ? (
            <div className="empty-state !min-h-[180px]" data-testid="status-seeding-empty"><div className="empty-icon"><Sprout size={18} /></div><h3 className="mt-3 text-sm font-bold">Посева нет</h3><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">На эту дату фактов посева в сезоне {r.year} не внесено.</p></div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-xs">
              <thead className="border-b border-border bg-muted/20 text-left text-[10.5px] text-muted-foreground"><tr><th className="px-4 py-2 font-semibold">Культура</th><th className="text-right font-semibold">За день</th><th className="px-4 text-right font-semibold">С начала сезона</th></tr></thead>
              <tbody className="divide-y divide-border/70">{r.crops.map((c) => (
                <tr key={c.cropName} data-testid={`row-seeding-crop-${c.cropName}`}><td className="px-4 py-2.5 font-semibold">{c.cropName}</td><td className="text-right font-mono">{c.dailyAreaHa > 0 ? `+${ha(c.dailyAreaHa)}` : ha(0)}</td><td className="px-4 text-right font-mono font-bold">{ha(c.totalAreaHa)}</td></tr>
              ))}</tbody>
              <tfoot className="border-t border-border bg-muted/20 font-bold"><tr><td className="px-4 py-2.5">Итого</td><td className="text-right font-mono">{ha(r.dailyAreaHa)}</td><td className="px-4 text-right font-mono">{ha(r.totalAreaHa)}</td></tr></tfoot>
            </table></div>
          )}
        </section>
      )}
    </div>
  );
}
