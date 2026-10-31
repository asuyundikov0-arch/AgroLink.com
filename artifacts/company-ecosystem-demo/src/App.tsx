import { useEffect } from 'react';
import { AlertTriangle, ArrowLeftRight, BookLock, Boxes, Compass, LayoutDashboard, Network, RotateCcw, UserCheck, ClipboardList } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { DemoProvider, useDemo, STORAGE_KEY, type Section } from '@/demo/store';
import { ROLE_LABEL, type Role } from '@/demo/engine';
import { DialogHost } from '@/components/demo/dialogs';
import { GuideSheet } from '@/components/demo/guide';
import { NativeSelect } from '@/components/demo/bits';
import Overview from '@/pages/overview';
import Register from '@/pages/register';
import Custody from '@/pages/custody';
import Requests from '@/pages/requests';
import Journal from '@/pages/journal';
import Ecosystem from '@/pages/ecosystem';
import { cn } from '@/lib/utils';

const NAV: [Section, string, typeof Boxes][] = [
  ['overview', 'Обзор', LayoutDashboard],
  ['register', 'Реестр ТМЦ', Boxes],
  ['custody', 'Подотчёт', UserCheck],
  ['requests', 'Заявки', ClipboardList],
  ['journal', 'Журнал', BookLock],
  ['ecosystem', 'Экосистема', Network],
];

function DemoBar() {
  const { role, setRole, state, actingEmployeeId, setActingEmployeeId, setDialog, setGuideOpen } = useDemo();
  return (
    <div className="sticky top-0 z-40 border-b border-primary/40 bg-primary text-primary-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <span className="demo-stripes rounded px-2 py-0.5 text-xs font-extrabold tracking-[0.2em]" data-testid="status-demo">ДЕМО</span>
        <span className="hidden text-xs opacity-90 md:inline">Синтетические данные в этом браузере. Не подключено к рабочей системе AgroLink.</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label htmlFor="role" className="text-xs opacity-90">Роль (имитация, не вход):</label>
          <NativeSelect id="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-8 w-40 border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground [&>option]:text-foreground" data-testid="select-role">
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </NativeSelect>
          {role === 'employee' && state && (
            <NativeSelect aria-label="От имени сотрудника" value={actingEmployeeId} onChange={(e) => setActingEmployeeId(e.target.value)} className="h-8 w-36 border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground [&>option]:text-foreground" data-testid="select-acting-employee">
              {state.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </NativeSelect>
          )}
          <Button size="sm" variant="secondary" className="h-8" onClick={() => setGuideOpen(true)} data-testid="button-guide"><Compass className="mr-1 h-3.5 w-3.5" />Сценарий</Button>
          <Button size="sm" variant="secondary" className="h-8" onClick={() => setDialog({ kind: 'reset' })} data-testid="button-reset"><RotateCcw className="mr-1 h-3.5 w-3.5" />Сброс демо</Button>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { state, status, saveError, section, go, setDialog } = useDemo();

  useEffect(() => {
    const t: Record<Section, string> = { overview: 'Обзор', register: 'Реестр ТМЦ', custody: 'Подотчёт', requests: 'Заявки', journal: 'Журнал', ecosystem: 'Экосистема' };
    document.title = `${t[section]} — AgroLink, экосистема компании (демо)`;
  }, [section]);

  return (
    <div className="min-h-[100dvh]">
      <DemoBar />
      <div className="md:flex">
        <aside className="bg-sidebar text-sidebar-foreground md:sticky md:top-[45px] md:h-[calc(100dvh-45px)] md:w-60 md:shrink-0">
          <div className="hidden px-5 pb-4 pt-6 md:block">
            <div className="text-lg font-extrabold tracking-tight">AgroLink</div>
            <div className="text-xs text-sidebar-foreground/60">Экосистема компании · АХО и имущество</div>
          </div>
          <nav aria-label="Разделы" className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:px-3">
            {NAV.map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => go(id, { itemId: null, employeeId: null })} aria-current={section === id ? 'page' : undefined} data-testid={`nav-${id}`}
                className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium', section === id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60')}>
                <Icon className={cn('h-4 w-4', section === id && 'text-sidebar-primary')} aria-hidden />{label}
              </button>
            ))}
          </nav>
          <div className="mx-5 mt-6 hidden rounded-lg border border-sidebar-border p-3 text-xs text-sidebar-foreground/70 md:block">
            <ArrowLeftRight className="mb-1.5 h-4 w-4 text-sidebar-primary" aria-hidden />
            Склады агроблока и инженерии ведутся отдельно. Здесь — остальное имущество компании.
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          {status.kind === 'unavailable' && (
            <div role="alert" className="mb-4 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Хранилище браузера недоступно ({status.error}). Демо работает в памяти — изменения пропадут после обновления страницы.
            </div>
          )}
          {saveError && <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{saveError}</div>}
          {status.kind === 'corrupt' || !state ? (
            <div className="mx-auto mt-10 max-w-lg rounded-xl border border-destructive/40 bg-card p-6" role="alert">
              <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
              <h1 className="mt-3 text-xl font-extrabold">Сохранённые данные демо повреждены</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ключ <code className="num">{STORAGE_KEY}</code> не прошёл проверку: {status.kind === 'corrupt' ? status.error : 'нет данных'}.
                Мы ничего не стёрли автоматически. Можно восстановить исходные синтетические примеры — это затронет только данные демо в этом браузере.
              </p>
              <Button className="mt-4" variant="destructive" onClick={() => setDialog({ kind: 'reset' })} data-testid="button-reset-corrupt">Сбросить демо…</Button>
            </div>
          ) : (
            <div key={section}>
              {section === 'overview' && <Overview />}
              {section === 'register' && <Register />}
              {section === 'custody' && <Custody />}
              {section === 'requests' && <Requests />}
              {section === 'journal' && <Journal />}
              {section === 'ecosystem' && <Ecosystem />}
            </div>
          )}
          <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
            Демонстрация концепции. Цифры синтетические, в тенге. Не является бухгалтерским, налоговым или юридически значимым учётом.
          </footer>
        </main>
      </div>
      <DialogHost />
      <GuideSheet />
    </div>
  );
}

function App() {
  return (
    <TooltipProvider>
      <DemoProvider>
        <Shell />
      </DemoProvider>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
