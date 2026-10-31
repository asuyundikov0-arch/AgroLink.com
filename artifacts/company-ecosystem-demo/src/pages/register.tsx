import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, FileInput, PackageMinus, Search, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { avgCost, computeBalances, holderKind, holderName, holderRef } from '@/demo/engine';
import { fmtKzt, fmtNum, useDemo, useDemoState } from '@/demo/store';
import { Empty, HolderTag, MovementBadge, NativeSelect, PageHead, Panel } from '@/components/demo/bits';

export default function Register() {
  const { selectedItemId } = useDemo();
  const s = useDemoState();
  if (selectedItemId && s.items.some((i) => i.id === selectedItemId)) return <ItemDetail itemId={selectedItemId} />;
  return <ItemList />;
}

function ItemList() {
  const s = useDemoState();
  const { role, setDialog, setSelectedItemId } = useDemo();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const b = useMemo(() => computeBalances(s), [s]);
  const cats = [...new Set(s.items.map((i) => i.category))].sort();
  const rows = s.items.filter((i) => (!cat || i.category === cat) && (`${i.sku} ${i.name}`.toLowerCase().includes(q.trim().toLowerCase())));
  const wh = `wh:${s.warehouses[0]?.id}`;
  return (
    <div className="rise">
      <PageHead kicker="Реестр ТМЦ" title="Мебель, техника, инструмент, СИЗ, расходники">
        {role === 'storekeeper' && <Button onClick={() => setDialog({ kind: 'receipt' })} data-testid="button-receipt"><FileInput className="mr-2 h-4 w-4" />Приход по счёту</Button>}
        {role === 'employee' && <Button onClick={() => setDialog({ kind: 'request', type: 'supply' })} data-testid="button-new-request"><Send className="mr-2 h-4 w-4" />Заявка на выдачу</Button>}
      </PageHead>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Поиск по артикулу или названию" placeholder="Артикул или название" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="input-search-items" />
        </div>
        <NativeSelect aria-label="Категория" value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-52" data-testid="select-category-filter">
          <option value="">Все категории</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </NativeSelect>
      </div>
      <Panel>
        {rows.length === 0 ? <Empty title="Ничего не найдено" text="Измените поиск или категорию." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2.5">Позиция</th><th className="px-3">Учёт</th><th className="px-3 text-right">Всего</th><th className="px-3 text-right">На складе</th><th className="px-3 text-right">Учётная цена</th><th className="px-4 text-right">Стоимость</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((i) => {
                  let total = 0;
                  for (const [h, qq] of b.get(i.id) ?? []) if (!(i.tracking === 'consumable' && holderKind(h) === 'employee')) total += qq;
                  const c = avgCost(s, i.id);
                  return (
                    <tr key={i.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedItemId(i.id)} data-testid={`row-item-${i.id}`}>
                      <td className="px-4 py-2.5">
                        <button type="button" className="text-left font-semibold hover:text-primary" onClick={(e) => { e.stopPropagation(); setSelectedItemId(i.id); }} data-testid={`link-item-${i.id}`}>{i.name}</button>
                        <div className="num text-xs text-muted-foreground">{i.sku} · {i.category}</div>
                      </td>
                      <td className="px-3 text-xs">{i.tracking === 'reusable' ? 'Подотчёт' : 'Расход'}</td>
                      <td className="num px-3 text-right">{fmtNum(total)} <span className="text-muted-foreground">{i.unit}</span></td>
                      <td className="num px-3 text-right">{fmtNum(b.get(i.id)?.get(wh) ?? 0)}</td>
                      <td className="num px-3 text-right">{fmtKzt(c)}</td>
                      <td className="num px-4 text-right font-medium">{fmtKzt(total * c)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">Расходные позиции, выданные сотрудникам, считаются израсходованными и в стоимость имущества не входят.</p>
    </div>
  );
}

function ItemDetail({ itemId }: { itemId: string }) {
  const s = useDemoState();
  const { role, setDialog, setSelectedItemId } = useDemo();
  const [hFilter, setHFilter] = useState('');
  const it = s.items.find((i) => i.id === itemId)!;
  const b = useMemo(() => computeBalances(s), [s]);
  const c = avgCost(s, itemId);
  const holders = [...(b.get(itemId) ?? [])].filter(([, q]) => q > 0);
  const history = s.movements.filter((m) => m.itemId === itemId && (!hFilter || m.fromHolder === hFilter || m.toHolder === hFilter)).reverse();
  const involved = [...new Set(s.movements.filter((m) => m.itemId === itemId).flatMap((m) => [m.fromHolder, m.toHolder]).concat(Object.keys(it.initialBalances)).filter((h): h is string => !!h))];
  const sk = role === 'storekeeper';
  const total = holders.reduce((a, [, q]) => a + q, 0);

  return (
    <div className="rise">
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => setSelectedItemId(null)} data-testid="button-back-register"><ArrowLeft className="mr-1 h-4 w-4" />Реестр ТМЦ</Button>
      <PageHead kicker={`${it.sku} · ${it.category} · ${it.id}`} title={it.name}>
        {sk && <>
          <Button size="sm" onClick={() => setDialog({ kind: 'receipt', itemId })} data-testid="button-item-receipt"><FileInput className="mr-1.5 h-4 w-4" />Приход</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'issue', itemId })} data-testid="button-item-issue"><PackageMinus className="mr-1.5 h-4 w-4" />Выдать</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'transfer', itemId })} data-testid="button-item-transfer"><ArrowRightLeft className="mr-1.5 h-4 w-4" />Переместить</Button>
        </>}
        {role === 'employee' && <>
          <Button size="sm" onClick={() => setDialog({ kind: 'request', type: 'supply', itemId })} data-testid="button-item-request"><Send className="mr-1.5 h-4 w-4" />Запросить</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'request', type: 'writeoff', itemId })} data-testid="button-item-writeoff"><Trash2 className="mr-1.5 h-4 w-4" />На списание</Button>
        </>}
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Всего у держателей', `${fmtNum(total)} ${it.unit}`], ['Учётная цена', fmtKzt(c)], ['Стоимость', fmtKzt(total * c)], ['Учёт', it.tracking === 'reusable' ? 'Многоразовое, подотчёт' : 'Расходное']].map(([l, v]) => (
          <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="num mt-1 font-medium">{v}</div></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel title="Остаток и стоимость по держателям">
          {holders.length === 0 ? <Empty title="Нет остатка" text="Позиция полностью выдана в расход или списана." /> : (
            <ul className="divide-y">
              {holders.map(([h, q]) => (
                <li key={h} className="flex items-center gap-3 px-4 py-3 text-sm" data-testid={`row-holder-${h}`}>
                  <div className="flex-1"><HolderTag s={s} h={h} />{it.tracking === 'consumable' && holderKind(h) === 'employee' && <div className="text-[11px] text-muted-foreground">выдано в расход</div>}</div>
                  <div className="text-right"><div className="num">{fmtNum(q)} {it.unit}</div><div className="num text-xs text-muted-foreground">{fmtKzt(q * c)}</div></div>
                  {sk && holderKind(h) === 'employee' && it.tracking === 'reusable' && (
                    <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'return', itemId, employeeId: holderRef(h) })} data-testid={`button-return-${h}`}>Возврат</Button>
                  )}
                  {sk && holderKind(h) !== 'employee' && (
                    <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'issue', itemId, fromHolder: h })} data-testid={`button-issue-${h}`}>Выдать</Button>
                  )}
                  {role === 'employee' && it.tracking === 'reusable' && (
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'request', type: 'writeoff', itemId, sourceHolderId: h })} data-testid={`button-writeoff-${h}`}>Списать</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="История движений" aside={
          <NativeSelect aria-label="Фильтр по держателю" value={hFilter} onChange={(e) => setHFilter(e.target.value)} className="h-8 w-48 text-xs" data-testid="select-history-holder">
            <option value="">Все держатели</option>
            {involved.map((h) => <option key={h} value={h}>{holderName(s, h)}</option>)}
          </NativeSelect>
        }>
          {history.length === 0 ? <Empty title="Движений нет" text={hFilter ? 'У выбранного держателя нет движений по позиции.' : 'Только начальный остаток.'} /> : (
            <ul className="divide-y">
              {history.map((m) => (
                <li key={m.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><MovementBadge type={m.type} /><span className="num text-xs text-muted-foreground">{m.id} · {m.date}</span><span className="num ml-auto font-medium">{m.toHolder ? '+' : '−'}{fmtNum(m.quantity)} {it.unit}</span></div>
                  <div className="mt-1 text-xs text-muted-foreground">{holderName(s, m.fromHolder)} → {m.toHolder ? holderName(s, m.toHolder) : 'списано'} · {m.reference}{m.unitCostKzt ? ` · ${fmtKzt(m.unitCostKzt)}/ед.` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
