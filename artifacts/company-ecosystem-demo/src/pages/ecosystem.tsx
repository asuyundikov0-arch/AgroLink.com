import { useState } from 'react';
import { ChevronRight, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDemo, useDemoState } from '@/demo/store';
import { PageHead, Panel } from '@/components/demo/bits';
import { cn } from '@/lib/utils';

interface Mod { id: string; name: string; status: 'demo' | 'concept'; owns: string; uses: string[]; gives: string; boundary: string }

const MODULES: Mod[] = [
  { id: 'agro', name: 'Агроблок', status: 'concept', owns: 'Поля, севооборот, полевые операции, химия и семена — свой производственный склад.', uses: ['employeeId — агрономы и бригадиры', 'departmentId — DEP-AGRO', 'locationId — полевые станы'], gives: 'Видит, какие ноутбуки, СИЗ и инструмент закреплены за полевыми сотрудниками.', boundary: 'Производственные запасы (семена, СЗР, ГСМ) остаются в агроблоке и в реестр АХО не попадают.' },
  { id: 'eng', name: 'Инженерия', status: 'concept', owns: 'Техника, агрегаты, ремонты, запчасти — свой склад запчастей.', uses: ['employeeId — механики', 'locationId — мехмастерская', 'itemId — только хозяйственный инструмент'], gives: 'Ручной инструмент и СИЗ механиков ведутся в АХО, запчасти к технике — в инженерии.', boundary: 'Одна и та же вещь не числится в двух реестрах: граница по назначению позиции.' },
  { id: 'hr', name: 'Кадры', status: 'concept', owns: 'Справочник сотрудников и подразделений, приём, перевод, увольнение.', uses: ['employeeId', 'departmentId'], gives: 'Перед увольнением видно, что числится за сотрудником, и нужен возврат.', boundary: 'Кадры — источник сотрудников; АХО не заводит своих копий.' },
  { id: 'eco', name: 'Экономика', status: 'concept', owns: 'Бюджеты подразделений, затраты, отчётность руководителю.', uses: ['movementId — приходы и списания', 'departmentId — центр затрат'], gives: 'Закупки по счетам, расход канцелярии и списания по подразделениям — из одного журнала.', boundary: 'Демо показывает управленческую картину и не является бухгалтерским или налоговым учётом.' },
  { id: 'aho', name: 'АХО и ИТ', status: 'demo', owns: 'Мебель, компьютеры, инструмент, СИЗ, канцелярия и хозтовары; подотчёт и заявки.', uses: ['itemId', 'employeeId', 'departmentId', 'locationId', 'movementId'], gives: 'Единый реестр ТМЦ и журнал движений, на которые ссылаются остальные модули.', boundary: 'Этот модуль работает в демо целиком — на синтетических данных в вашем браузере.' },
];

export default function Ecosystem() {
  const s = useDemoState();
  const { setGuideOpen } = useDemo();
  const [open, setOpen] = useState<Mod | null>(null);
  const ids: [string, string, string, number][] = [
    ['departmentId', s.departments[1]?.id ?? '', 'Подразделение — центр ответственности и затрат', s.departments.length],
    ['employeeId', s.employees[1]?.id ?? '', 'Сотрудник — держатель подотчёта и заявитель', s.employees.length],
    ['locationId', s.locations[0]?.id ?? '', 'Кабинет, мастерская, полевой стан', s.locations.length],
    ['itemId', s.items[0]?.id ?? '', 'Позиция ТМЦ — одна карточка на компанию', s.items.length],
    ['movementId', s.movements[s.movements.length - 1]?.id ?? '', 'Запись журнала — источник остатков и затрат', s.movements.length],
  ];

  return (
    <div className="rise">
      <PageHead kicker="Экосистема" title="Один справочник — несколько модулей">
        <Button onClick={() => setGuideOpen(true)} data-testid="button-open-guide"><Compass className="mr-2 h-4 w-4" />Пройти сценарий</Button>
      </PageHead>

      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        Производственные склады агроблока и инженерии остаются раздельными. Модуль АХО добавляет всё остальное
        имущество компании. Связь между модулями — общие идентификаторы, а не копии остатков: остаток существует
        в одном месте и рассчитывается из журнала движений.
      </p>

      <Panel title="Общие идентификаторы" className="mb-5">
        <ul className="divide-y">
          {ids.map(([k, ex, d, n]) => (
            <li key={k} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 px-4 py-3 text-sm sm:grid-cols-[9rem_6rem_1fr_4rem]">
              <code className="num font-semibold text-primary">{k}</code>
              <span className="num hidden text-xs text-muted-foreground sm:block">{ex}</span>
              <span>{d}</span>
              <span className="num hidden text-right text-muted-foreground sm:block">{n}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Модули компании</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {MODULES.map((m) => (
          <button key={m.id} type="button" onClick={() => setOpen(m)} data-testid={`button-module-${m.id}`}
            className={cn('group flex flex-col rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5', m.status === 'demo' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>
            <span className={cn('text-[10px] font-bold uppercase tracking-widest', m.status === 'demo' ? 'opacity-80' : 'text-muted-foreground')}>{m.status === 'demo' ? 'Работает в демо' : 'Только описание'}</span>
            <span className="mt-2 text-lg font-extrabold">{m.name}</span>
            <span className={cn('mt-2 line-clamp-3 text-xs', m.status === 'demo' ? 'opacity-85' : 'text-muted-foreground')}>{m.owns}</span>
            <span className="mt-auto flex items-center pt-3 text-xs font-semibold">Подробнее <ChevronRight className="ml-0.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
          </button>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          {open && <>
            <DialogHeader>
              <DialogTitle>{open.name}</DialogTitle>
              <DialogDescription>{open.status === 'demo' ? 'Модуль реализован в этом демо на синтетических данных.' : 'Пояснение к связи модуля. В демо не реализован и к рабочей системе не подключается.'}</DialogDescription>
            </DialogHeader>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ведёт сам</dt><dd className="mt-1">{open.owns}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Общие ID</dt><dd className="mt-1 flex flex-wrap gap-1.5">{open.uses.map((u) => <span key={u} className="num rounded bg-muted px-2 py-0.5 text-xs">{u}</span>)}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Что получает от связи</dt><dd className="mt-1">{open.gives}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Граница</dt><dd className="mt-1">{open.boundary}</dd></div>
            </dl>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
