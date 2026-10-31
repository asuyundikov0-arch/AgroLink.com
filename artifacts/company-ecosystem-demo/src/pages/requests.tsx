import { useState } from 'react';
import { Check, PackageCheck, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { avgCost, holderName, type RequestStatus } from '@/demo/engine';
import { fmtKzt, useDemo, useDemoState } from '@/demo/store';
import { Empty, PageHead, Panel, RoleHint, StatusBadge } from '@/components/demo/bits';
import { cn } from '@/lib/utils';

const TABS: [RequestStatus | 'all', string][] = [['all', 'Все'], ['pending', 'На согласовании'], ['approved', 'К выдаче'], ['fulfilled', 'Исполнены'], ['rejected', 'Отклонены']];

export default function Requests() {
  const s = useDemoState();
  const { role, setDialog, actingEmployeeId } = useDemo();
  const [tab, setTab] = useState<RequestStatus | 'all'>('all');
  const [mine, setMine] = useState(true);
  const list = [...s.requests].reverse().filter((r) => (tab === 'all' || r.status === tab) && (role !== 'employee' || !mine || r.employeeId === actingEmployeeId));
  const count = (t: RequestStatus | 'all') => s.requests.filter((r) => t === 'all' || r.status === t).length;

  return (
    <div className="rise">
      <PageHead kicker="Заявки и согласование" title="Сотрудник просит — директор решает — склад исполняет">
        {role === 'employee' && <>
          <Button onClick={() => setDialog({ kind: 'request', type: 'supply' })} data-testid="button-request-supply"><Send className="mr-2 h-4 w-4" />Заявка на выдачу</Button>
          <Button variant="outline" onClick={() => setDialog({ kind: 'request', type: 'writeoff' })} data-testid="button-request-writeoff"><Trash2 className="mr-2 h-4 w-4" />На списание</Button>
        </>}
      </PageHead>

      <div className="mb-3">
        {role === 'director' && <RoleHint text="Роль «Директор»: согласование и отклонение. Списание проводится сразу при согласовании; выдача — после действия кладовщика." />}
        {role === 'storekeeper' && <RoleHint text="Роль «Кладовщик АХО»: исполняет только согласованные заявки на выдачу. Если остатка не хватает, заявка остаётся согласованной." />}
        {role === 'employee' && <RoleHint text="Роль «Сотрудник»: создаёт заявки на выдачу и списание. Решение принимает директор." />}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Статус заявок">
        {TABS.map(([t, l]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-requests-${t}`}
            className={cn('rounded-full border px-3 py-1 text-sm', tab === t ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
            {l} <span className="num opacity-70">{count(t)}</span>
          </button>
        ))}
        {role === 'employee' && (
          <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4" data-testid="checkbox-mine" />Только мои</label>
        )}
      </div>

      <Panel>
        {list.length === 0 ? <Empty title="Заявок нет" text="В этом статусе пока пусто." /> : (
          <ul className="divide-y">
            {list.map((r) => {
              const it = s.items.find((i) => i.id === r.itemId);
              const emp = s.employees.find((e) => e.id === r.employeeId);
              const dep = s.departments.find((d) => d.id === r.departmentId);
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center" data-testid={`row-request-${r.id}`}>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-xs text-muted-foreground">{r.id}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', r.type === 'supply' ? 'bg-accent text-accent-foreground' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200')}>{r.type === 'supply' ? 'Выдача' : 'Списание'}</span>
                      <StatusBadge status={r.status} type={r.type} />
                    </div>
                    <div className="mt-1 font-semibold">{it?.name} × <span className="num">{r.quantity}</span> {it?.unit} <span className="num text-sm font-normal text-muted-foreground">≈ {fmtKzt(r.quantity * avgCost(s, r.itemId))}</span></div>
                    <div className="text-sm text-muted-foreground">{emp?.name}, {dep?.name} · {r.createdAt}{r.sourceHolderId ? ` · у держателя «${holderName(s, r.sourceHolderId)}»` : ''}</div>
                    <div className="mt-1 text-sm">«{r.reason}»</div>
                    {r.decisionNote && <div className="mt-1 text-xs text-muted-foreground">Директор: {r.decisionNote}</div>}
                    {r.movementId && <div className="num mt-1 text-xs text-primary">Движение {r.movementId}</div>}
                  </div>
                  <div className="flex gap-2">
                    {role === 'director' && r.status === 'pending' && <>
                      <Button size="sm" onClick={() => setDialog({ kind: 'decide', requestId: r.id, decision: 'approve' })} data-testid={`button-approve-${r.id}`}><Check className="mr-1 h-4 w-4" />Согласовать</Button>
                      <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'decide', requestId: r.id, decision: 'reject' })} data-testid={`button-reject-${r.id}`}><X className="mr-1 h-4 w-4" />Отклонить</Button>
                    </>}
                    {role === 'storekeeper' && r.status === 'approved' && r.type === 'supply' && (
                      <Button size="sm" onClick={() => setDialog({ kind: 'fulfill', requestId: r.id })} data-testid={`button-fulfill-${r.id}`}><PackageCheck className="mr-1 h-4 w-4" />Выдать по заявке</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
