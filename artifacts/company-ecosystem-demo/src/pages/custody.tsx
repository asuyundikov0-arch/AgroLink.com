import { useEffect, useMemo, useState } from 'react';
import { Search, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { avgCost, computeBalances, empHolder } from '@/demo/engine';
import { fmtKzt, fmtNum, useDemo, useDemoState } from '@/demo/store';
import { Empty, PageHead, Panel } from '@/components/demo/bits';
import { cn } from '@/lib/utils';

export default function Custody() {
  const s = useDemoState();
  const { role, setDialog, focusEmployeeId, go } = useDemo();
  const [q, setQ] = useState('');
  const [onlyHolding, setOnlyHolding] = useState(true);
  const b = useMemo(() => computeBalances(s), [s]);

  useEffect(() => {
    if (focusEmployeeId) document.getElementById(`emp-${focusEmployeeId}`)?.scrollIntoView({ block: 'center' });
  }, [focusEmployeeId]);

  const holdings = (empId: string) =>
    s.items.map((it) => ({ it, q: b.get(it.id)?.get(empHolder(empId)) ?? 0, c: avgCost(s, it.id) })).filter((x) => x.q > 0);

  return (
    <div className="rise">
      <PageHead kicker="Подотчёт" title="Что числится за сотрудниками">
        {role === 'storekeeper' && <Button onClick={() => setDialog({ kind: 'return' })} data-testid="button-new-return"><Undo2 className="mr-2 h-4 w-4" />Принять возврат</Button>}
      </PageHead>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Поиск сотрудника" placeholder="Сотрудник или должность" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="input-search-employee" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyHolding} onChange={(e) => setOnlyHolding(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid="checkbox-only-holding" />
          Только с имуществом
        </label>
      </div>

      <div className="space-y-5">
        {s.departments.map((d) => {
          const emps = s.employees
            .filter((e) => e.departmentId === d.id && `${e.name} ${e.position}`.toLowerCase().includes(q.trim().toLowerCase()))
            .map((e) => ({ e, h: holdings(e.id) }))
            .filter((x) => !onlyHolding || x.h.length > 0);
          if (emps.length === 0) return null;
          const deptValue = emps.reduce((a, x) => a + x.h.filter((y) => y.it.tracking === 'reusable').reduce((aa, y) => aa + y.q * y.c, 0), 0);
          return (
            <section key={d.id} aria-labelledby={`dep-${d.id}`}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 id={`dep-${d.id}`} className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{d.name} <span className="num font-normal">· {d.id}</span></h2>
                <span className="num text-sm">{fmtKzt(deptValue)}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {emps.map(({ e, h }) => {
                  const val = h.filter((x) => x.it.tracking === 'reusable').reduce((a, x) => a + x.q * x.c, 0);
                  return (
                    <Panel key={e.id} className={cn(focusEmployeeId === e.id && 'ring-2 ring-primary')}>
                      <div id={`emp-${e.id}`} className="flex items-center gap-3 border-b px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground" aria-hidden>{e.name.slice(-2)}</div>
                        <div className="flex-1"><div className="font-semibold" data-testid={`text-employee-${e.id}`}>{e.name}</div><div className="text-xs text-muted-foreground">{e.position} · {e.id}</div></div>
                        <div className="text-right"><div className="num text-sm font-medium">{fmtKzt(val)}</div><div className="text-[11px] text-muted-foreground">в подотчёте</div></div>
                      </div>
                      {h.length === 0 ? <Empty title="Ничего не числится" text="Имущество за сотрудником не закреплено." /> : (
                        <ul className="divide-y">
                          {h.map(({ it, q: qty, c }) => (
                            <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                              <button type="button" className="flex-1 text-left hover:text-primary" onClick={() => go('register', { itemId: it.id })} data-testid={`link-custody-item-${e.id}-${it.id}`}>
                                {it.name}
                                <div className="text-[11px] text-muted-foreground">{it.tracking === 'reusable' ? 'подотчёт' : 'выдано в расход'}</div>
                              </button>
                              <span className="num">{fmtNum(qty)} {it.unit}</span>
                              <span className="num w-24 text-right text-xs text-muted-foreground">{fmtKzt(qty * c)}</span>
                              {role === 'storekeeper' && it.tracking === 'reusable' && (
                                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'return', itemId: it.id, employeeId: e.id })} data-testid={`button-return-${e.id}-${it.id}`}>Вернуть</Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Panel>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
