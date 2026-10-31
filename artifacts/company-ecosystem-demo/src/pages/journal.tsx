import { useState } from 'react';
import { Lock } from 'lucide-react';
import { avgCost, holderName, ROLE_LABEL, type MovementType } from '@/demo/engine';
import { fmtKzt, fmtNum, useDemo, useDemoState } from '@/demo/store';
import { Empty, HolderOptions, HolderTag, MovementBadge, NativeSelect, PageHead, Panel } from '@/components/demo/bits';

export default function Journal() {
  const s = useDemoState();
  const { go } = useDemo();
  const [type, setType] = useState<MovementType | ''>('');
  const [item, setItem] = useState('');
  const [holder, setHolder] = useState('');
  const rows = [...s.movements].reverse().filter((m) => (!type || m.type === type) && (!item || m.itemId === item) && (!holder || m.fromHolder === holder || m.toHolder === holder));
  return (
    <div className="rise">
      <PageHead kicker="Журнал движений" title="Каждое изменение остатка — отдельная запись" />
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-accent/60 px-3 py-2 text-sm text-accent-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Записи не редактируются и не удаляются. Ошибку исправляют встречным движением (возврат, перемещение, списание). Остатки на всех экранах рассчитываются из этого журнала.
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <NativeSelect aria-label="Тип движения" value={type} onChange={(e) => setType(e.target.value as MovementType | '')} data-testid="select-journal-type">
          <option value="">Все типы</option>
          <option value="receipt">Приход</option><option value="issue">Выдача</option><option value="return">Возврат</option><option value="transfer">Перемещение</option><option value="writeoff">Списание</option>
        </NativeSelect>
        <NativeSelect aria-label="Позиция" value={item} onChange={(e) => setItem(e.target.value)} data-testid="select-journal-item">
          <option value="">Все позиции</option>
          {s.items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Держатель" value={holder} onChange={(e) => setHolder(e.target.value)} data-testid="select-journal-holder">
          <option value="">Все держатели</option>
          <HolderOptions s={s} kinds={['warehouse', 'location', 'employee']} />
        </NativeSelect>
      </div>
      <Panel>
        {rows.length === 0 ? <Empty title="Нет записей" text="Под выбранные фильтры движений нет." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2.5">ID / дата</th><th className="px-3">Тип</th><th className="px-3">Позиция</th><th className="px-3 text-right">Кол-во</th><th className="px-3">Откуда</th><th className="px-3">Куда</th><th className="px-3">Основание</th><th className="px-4 text-right">Сумма</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((m) => {
                  const it = s.items.find((i) => i.id === m.itemId);
                  return (
                    <tr key={m.id} data-testid={`row-movement-${m.id}`}>
                      <td className="num px-4 py-2.5 text-xs">{m.id}<div className="text-muted-foreground">{m.date}</div></td>
                      <td className="px-3"><MovementBadge type={m.type} /></td>
                      <td className="px-3"><button type="button" className="text-left hover:text-primary" onClick={() => go('register', { itemId: m.itemId })} data-testid={`link-journal-item-${m.id}`}>{it?.name}</button></td>
                      <td className="num px-3 text-right">{fmtNum(m.quantity)} {it?.unit}</td>
                      <td className="px-3 text-xs">{m.fromHolder ? <HolderTag s={s} h={m.fromHolder} /> : <span className="text-muted-foreground">поставщик</span>}</td>
                      <td className="px-3 text-xs">{m.toHolder ? <HolderTag s={s} h={m.toHolder} /> : <span className="text-muted-foreground">списано</span>}</td>
                      <td className="px-3 text-xs">{m.reference}<div className="text-muted-foreground">{ROLE_LABEL[m.actor]}{m.note ? ` · ${m.note}` : ''}</div></td>
                      <td className="num px-4 text-right text-xs">{fmtKzt(m.quantity * (m.type === 'receipt' ? m.unitCostKzt ?? 0 : avgCost(s, m.itemId)))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-2 text-xs text-muted-foreground">Записей: {rows.length} из {s.movements.length}. {holder && `Фильтр: ${holderName(s, holder)}.`}</p>
    </div>
  );
}
