import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ROLE_LABEL, type Role } from '@/demo/engine';
import { useDemo, type Section } from '@/demo/store';

interface Step { role: Role; section: Section; title: string; text: string; employeeId?: string }

const STEPS: Step[] = [
  { role: 'employee', section: 'requests', title: 'Заявка на ноутбук', text: 'Вы — Сотрудник 02. Нажмите «Заявка на выдачу», выберите «Ноутбук офисный 14"», 1 шт, укажите причину.' },
  { role: 'director', section: 'requests', title: 'Директор согласует', text: 'Найдите новую заявку в статусе «На согласовании» и нажмите «Согласовать». Остаток пока не меняется.' },
  { role: 'storekeeper', section: 'requests', title: 'Кладовщик выдаёт', text: 'В статусе «К выдаче» нажмите «Выдать по заявке». Повторно исполнить ту же заявку нельзя.' },
  { role: 'director', section: 'custody', title: 'Проверка подотчёта', text: 'Ноутбук теперь числится за Сотрудником 02. Стоимость имущества компании не изменилась — сменился держатель.', employeeId: 'EMP-02' },
  { role: 'storekeeper', section: 'custody', title: 'Возврат на склад', text: 'У Сотрудника 02 нажмите «Вернуть» у ноутбука и подтвердите количество.', employeeId: 'EMP-02' },
  { role: 'employee', section: 'requests', title: 'Сломанный стул', text: 'Нажмите «На списание», выберите «Стул офисный», держатель «Админкорпус, каб. 12», 1 шт, причина — сломан.' },
  { role: 'director', section: 'requests', title: 'Директор списывает', text: 'Согласуйте заявку на списание. Остаток в кабинете уменьшится ровно на 1, запись появится в журнале.' },
];

export function GuideSheet() {
  const { guideOpen, setGuideOpen, setRole, go, setActingEmployeeId } = useDemo();
  const open = (st: Step) => {
    setRole(st.role);
    if (st.role === 'employee') setActingEmployeeId('EMP-02');
    go(st.section, { itemId: null, employeeId: st.employeeId ?? null });
    setGuideOpen(false);
  };
  return (
    <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Сценарий за 3 минуты</SheetTitle>
          <SheetDescription>Кнопки только переключают роль и экран. Все действия вы выполняете сами — сценарий ничего не меняет автоматически.</SheetDescription>
        </SheetHeader>
        <ol className="mt-5 space-y-3">
          {STEPS.map((st, i) => (
            <li key={i} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>
                <span className="font-semibold">{st.title}</span>
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{ROLE_LABEL[st.role]}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{st.text}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => open(st)} data-testid={`button-guide-step-${i + 1}`}>Открыть шаг</Button>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
