import { useMemo } from 'react';
import { ArrowRight, ClipboardCheck, PackageOpen, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { avgCost, computeBalances, computeMetrics, holderKind, holderRef } from '@/demo/engine';
import { fmtKzt, fmtNum, useDemo, useDemoState } from '@/demo/store';
import { HolderTag, MovementBadge, PageHead, Panel } from '@/components/demo/bits';

export default function Overview() {
  const s = useDemoState();
  const { go } = useDemo();
  const m = useMemo(() => computeMetrics(s), [s]);

  const byDept = useMemo(() => {
    const b = computeBalances(s);
    const rows = new Map<string, { value: number; units: number }>();
    for (const d of s.departments) rows.set(d.id, { value: 0, units: 0 });
    const central = { value: 0, units: 0 };
    for (const it of s.items) {
      const c = avgCost(s, it.id);
      for (const [h, q] of b.get(it.id) ?? []) {
        if (q <= 0) continue;
        const k = holderKind(h);
        let dep: string | undefined;
        if (k === 'location') dep = s.locations.find((l) => l.id === holderRef(h))?.departmentId;
        if (k === 'employee') {
          if (it.tracking === 'consumable') continue;
          dep = s.employees.find((e) => e.id === holderRef(h))?.departmentId;
        }
        const target = dep ? rows.get(dep) : central;
        if (target) { target.value += q * c; target.units += q; }
      }
    }
    return { rows, central };
  }, [s]);
  const maxDept = Math.max(1, ...[...byDept.rows.values()].map((r) => r.value), byDept.central.value);

  const recent = [...s.movements].reverse().slice(0, 6);
  const stats: [string, number, string][] = [
    ['На складах', m.warehouseValue, 'остаток у кладовщика'],
    ['На локациях', m.locationValue, 'кабинеты, мастерские, станы'],
    ['В подотчёте', m.custodyValue, 'многоразовое у сотрудников'],
    ['Закупки по счетам', m.purchasesValue, 'приходы с номером счёта'],
    ['Выдано в расход', m.consumedValue, 'канцелярия, перчатки, хозтовары'],
    ['Списано по актам', m.writeoffValue, 'после решения директора'],
  ];

  return (
    <div className="rise">
      <PageHead kicker="Обзор компании" title="Имущество за пределами полей и техники" />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-sidebar p-6 text-sidebar-foreground">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border-[28px] border-sidebar-primary/15" aria-hidden />
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">Стоимость имущества компании</div>
          <div className="num mt-3 text-4xl font-medium tracking-tight md:text-5xl" data-testid="text-asset-value">{fmtKzt(m.assetValue)}</div>
          <p className="mt-3 max-w-md text-sm text-sidebar-foreground/75">
            Склады + локации + многоразовое имущество в подотчёте. Перемещения и возвраты меняют только держателя,
            поэтому сумма не удваивается.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-sidebar-border pt-4 text-sm">
            <div><div className="num text-xl">{s.items.length}</div><div className="text-sidebar-foreground/60">позиций ТМЦ</div></div>
            <div><div className="num text-xl">{m.employeesWithCustody}</div><div className="text-sidebar-foreground/60">с подотчётом</div></div>
            <div><div className="num text-xl">{s.movements.length}</div><div className="text-sidebar-foreground/60">движений</div></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {stats.map(([label, v, sub]) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <div className="text-xs font-semibold text-muted-foreground">{label}</div>
              <div className="num mt-1 text-lg font-medium" data-testid={`text-metric-${label}`}>{fmtKzt(v)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Требует внимания">
          <div className="divide-y">
            <button type="button" onClick={() => go('requests')} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60" data-testid="link-pending">
              <ClipboardCheck className="h-5 w-5 text-amber-600" aria-hidden />
              <span className="flex-1 text-sm">На согласовании у директора</span>
              <span className="num font-semibold">{m.pending}</span>
            </button>
            <button type="button" onClick={() => go('requests')} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60" data-testid="link-awaiting">
              <PackageOpen className="h-5 w-5 text-primary" aria-hidden />
              <span className="flex-1 text-sm">Согласовано, ждёт выдачи</span>
              <span className="num font-semibold">{m.awaitingFulfil}</span>
            </button>
            {m.lowStock.map((l) => {
              const it = s.items.find((i) => i.id === l.itemId);
              return (
                <button key={l.itemId} type="button" onClick={() => go('register', { itemId: l.itemId })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60" data-testid={`link-lowstock-${l.itemId}`}>
                  <TriangleAlert className="h-4 w-4 text-rose-600" aria-hidden />
                  <span className="flex-1 truncate text-sm">{it?.name}</span>
                  <span className="num text-sm text-muted-foreground">{l.qty} {it?.unit}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Имущество по подразделениям">
          <ul className="space-y-3 p-4">
            {[...s.departments.map((d) => ({ id: d.id, name: d.name, ...byDept.rows.get(d.id)! })), { id: 'central', name: 'Центральный склад', ...byDept.central }].map((r) => (
              <li key={r.id}>
                <div className="flex justify-between text-sm"><span>{r.name}</span><span className="num">{fmtKzt(r.value)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 origin-left rounded-full bg-primary" style={{ transform: `scaleX(${r.value / maxDept})` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Последние движения" aside={<Button size="sm" variant="ghost" onClick={() => go('journal')} data-testid="button-open-journal">Журнал <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}>
          <ul className="divide-y">
            {recent.map((mv) => {
              const it = s.items.find((i) => i.id === mv.itemId);
              return (
                <li key={mv.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2"><MovementBadge type={mv.type} /><span className="truncate font-medium">{it?.name}</span><span className="num ml-auto">{fmtNum(mv.quantity)}</span></div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span className="num">{mv.id}</span><span>→</span><HolderTag s={s} h={mv.toHolder} /></div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
