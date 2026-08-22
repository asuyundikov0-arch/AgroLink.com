import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CloudUpload,
  Copy,
  Download,
  FileSpreadsheet,
  Filter,
  FolderOpen,
  LayoutDashboard,
  Library,
  Menu,
  MoreHorizontal,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload as UploadIcon,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  type Activity,
  type DashboardSummary,
  type Template,
  type TemplateInput,
  useCreateTemplate,
  useDeleteTemplate,
  useGetDashboardSummary,
  useGetTemplate,
  useListActivity,
  useListTemplates,
  getGetDashboardSummaryQueryKey,
  getGetTemplateQueryKey,
  getListTemplatesQueryKey,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Link,
  Route,
  Router as WouterRouter,
  Switch,
  useLocation,
  useParams,
} from 'wouter';
import './index.css';

const queryClient = new QueryClient();

const categories = ['Финансы', 'Продажи', 'Кадры', 'Маркетинг', 'Операции', 'Отчётность', 'Персонал'];
const departments = ['Финансовый отдел', 'Отдел продаж', 'HR', 'Маркетинг', 'Операционный блок', 'Снабжение', 'Агрономия'];

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat('ru-RU').format(value ?? 0);
}

function formatDate(value: string) {
  if (!value) return 'Недавно';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
}

function formatDateLong(value: string) {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function actionLabel(action: Activity['action']) {
  return {
    uploaded: 'добавил шаблон',
    updated: 'обновил шаблон',
    downloaded: 'скачал шаблон',
    archived: 'переместил в архив',
  }[action];
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [topNotice, setTopNotice] = useState('');
  const [agroOpen, setAgroOpen] = useState(true);
  const navItems = [
    { href: '/', label: 'Обзор', icon: LayoutDashboard },
    { href: '/templates', label: 'Все шаблоны', icon: Library },
    { href: '/upload', label: 'Добавить шаблон', icon: CloudUpload },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[256px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-9 flex items-center gap-3 px-2">
          <div className="brand-mark"><BookOpen size={20} strokeWidth={2.4} /></div>
          <div>
            <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-sidebar-foreground">
              Единая база
            </div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/45">
              Шаблонов
            </div>
          </div>
        </div>

        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/35">
          Рабочее пространство
        </div>
        <nav className="space-y-1" aria-label="Основная навигация">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`link-nav-${item.label}`}
                onClick={() => setMobileOpen(false)}
                className={cn('nav-item', active && 'nav-item-active')}
              >
                <Icon size={17} strokeWidth={active ? 2.4 : 1.8} />
                <span>{item.label}</span>
                {item.href === '/templates' && <span className="ml-auto nav-count">24</span>}
              </Link>
            );
          })}
          <div className="mt-3 border-t border-sidebar-border/70 pt-3">
            <button
              type="button"
              data-testid="button-toggle-agroblock"
              className="nav-item w-full"
              onClick={() => setAgroOpen((open) => !open)}
              aria-expanded={agroOpen}
            >
              <FolderOpen size={17} strokeWidth={1.8} />
              <span>Агроблок</span>
              <ChevronDown size={14} className={cn('ml-auto transition-transform', !agroOpen && '-rotate-90')} />
            </button>
            {agroOpen && (
              <div className="mt-1 space-y-1">
                <div>
                  <div className="nav-item pl-10 text-[11px]">
                    <span className="size-1.5 rounded-full bg-accent" />
                    <span className="truncate">АПК Арыстан Grain</span>
                  </div>
                  <Link
                    href="/templates?search=Шаблон Отчет по Уборке ( АПК Арыстан Грейн)"
                    data-testid="link-nav-arysan-grain"
                    onClick={() => setMobileOpen(false)}
                    className="nav-item pl-[60px] text-[10px] text-sidebar-foreground/55"
                  >
                    <FileSpreadsheet size={13} />
                    <span className="truncate">Шаблон Отчет по Уборке</span>
                  </Link>
                </div>
                <div>
                  <div className="nav-item pl-10 text-[11px]">
                    <span className="size-1.5 rounded-full bg-teal-400" />
                    <span className="truncate">АФ Веденовка</span>
                  </div>
                  <Link
                    href="/templates?search=Шаблон Отчет по Уборке АФ Веденовка"
                    data-testid="link-nav-vedenovka"
                    onClick={() => setMobileOpen(false)}
                    className="nav-item pl-[60px] text-[10px] text-sidebar-foreground/55"
                  >
                    <FileSpreadsheet size={13} />
                    <span className="truncate">Шаблон Отчет по Уборке</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </nav>

        <div className="mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/35">
          Настройки
        </div>
        <nav className="mt-3 space-y-1">
          <Link
            href="/settings"
            data-testid="link-nav-settings"
            onClick={() => setMobileOpen(false)}
            className={cn('nav-item', location === '/settings' && 'nav-item-active')}
          >
            <SettingsIcon size={17} strokeWidth={1.8} />
            <span>Настройки команды</span>
          </Link>
        </nav>

        <div className="mt-auto">
          <div className="mb-5 rounded-xl border border-sidebar-border bg-sidebar-accent/55 p-3.5">
            <div className="flex items-start justify-between">
              <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-accent-foreground">
                <Zap size={14} fill="currentColor" />
              </div>
              <span className="rounded-full bg-sidebar-foreground/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-sidebar-foreground/50">
                PRO
              </span>
            </div>
            <p className="mt-3 text-xs font-semibold text-sidebar-foreground">Порядок в каждом файле</p>
            <p className="mt-1 text-[11px] leading-4 text-sidebar-foreground/50">
              Все рабочие шаблоны команды — в одном месте.
            </p>
          </div>
          <div className="flex items-center gap-3 border-t border-sidebar-border px-2 pt-4">
            <div className="avatar avatar-sm avatar-accent">АК</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">Алексей Крылов</p>
              <p className="truncate text-[11px] text-sidebar-foreground/45">Администратор</p>
            </div>
            <button type="button" data-testid="button-user-menu" className="icon-button-dark" aria-label="Открыть меню профиля" onClick={() => setTopNotice('Профиль пользователя доступен в настройках команды.')}>
              <MoreHorizontal size={17} />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          data-testid="button-close-mobile-nav"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-20 bg-sidebar/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <main className="min-h-[100dvh] md:pl-[256px]">
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-10">
          <button
            type="button"
            data-testid="button-open-mobile-nav"
            aria-label="Открыть меню"
            className="icon-button md:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Все системы работают
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" data-testid="button-help" className="icon-button" aria-label="Помощь" onClick={() => setTopNotice('Если нужна помощь, обратитесь к администратору рабочего пространства.')}>
              <CircleHelp size={18} />
            </button>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="avatar avatar-sm avatar-blue">АК</div>
          </div>
        </header>
        {topNotice && <div className="mx-5 mt-4 md:mx-10"><div className="notice-banner max-w-xl" data-testid="status-shell-notice"><CircleHelp size={16} /><span>{topNotice}</span><button type="button" data-testid="button-dismiss-shell-notice" aria-label="Закрыть уведомление" onClick={() => setTopNotice('')}><X size={14} /></button></div></div>}
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  );
}

function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em] text-foreground sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" data-testid="status-loading">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton-row">
          <div className="skeleton h-10 w-10 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/5" />
            <div className="skeleton h-3 w-1/4" />
          </div>
          <div className="skeleton hidden h-3 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return (
    <div className={cn('empty-state', compact && 'py-12')} data-testid="status-error">
      <div className="empty-icon empty-icon-error"><X size={20} /></div>
      <h3 className="mt-4 text-sm font-bold">Не удалось загрузить данные</h3>
      <p className="mt-1 max-w-xs text-center text-xs leading-5 text-muted-foreground">
        Проверьте соединение и попробуйте ещё раз.
      </p>
      <button type="button" data-testid="button-retry" onClick={onRetry} className="button button-secondary mt-4">
        Повторить
      </button>
    </div>
  );
}

function EmptyState({
  title = 'Пока ничего нет',
  description = 'Когда появятся новые данные, они будут отображаться здесь.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state" data-testid="status-empty">
      <div className="empty-icon"><FolderOpen size={20} /></div>
      <h3 className="mt-4 text-sm font-bold">{title}</h3>
      <p className="mt-1 max-w-xs text-center text-xs leading-5 text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

function FileBadge({ type = 'XLSX', large = false }: { type?: string; large?: boolean }) {
  return (
    <div className={cn('file-badge', large && 'file-badge-lg')}>
      <FileSpreadsheet size={large ? 25 : 19} strokeWidth={1.8} />
      <span>{type.toUpperCase().replace('.', '')}</span>
    </div>
  );
}

function StatusPill({ status }: { status: Template['status'] }) {
  return (
    <span className={cn('status-pill', status === 'archived' && 'status-pill-muted')} data-testid={`status-template-${status}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status === 'active' ? 'Активен' : 'В архиве'}
    </span>
  );
}

function TemplateRow({ template, compact = false }: { template: Template; compact?: boolean }) {
  return (
    <Link
      href={`/templates/${template.id}`}
      data-testid={`link-template-${template.id}`}
      className={cn('template-row group', compact && 'template-row-compact')}
    >
      <FileBadge type={template.fileType} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-teal-700">{template.name}</span>
          {template.status === 'archived' && <StatusPill status={template.status} />}
          {template.accessGroup === 'agronomists' && <span className="meta-chip shrink-0 text-[10px]">Агрономы</span>}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{template.description || `${template.category} · ${template.department}`}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-8 lg:flex">
        <div className="w-[116px]">
          <p className="text-[11px] font-semibold text-foreground">{template.category}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{template.department}</p>
        </div>
        <div className="w-[72px]">
          <p className="font-mono text-xs font-bold text-foreground">{template.version || 'v1.0'}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(template.updatedAt)}</p>
        </div>
        <div className="w-14 text-right">
          <p className="font-mono text-xs font-bold text-foreground">{formatNumber(template.downloads)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">скачиваний</p>
        </div>
      </div>
      <ArrowUpRight size={16} className="shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-teal-700" />
    </Link>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const icon = activity.action === 'uploaded' ? <UploadIcon size={15} /> : activity.action === 'downloaded' ? <Download size={15} /> : activity.action === 'archived' ? <Archive size={15} /> : <Copy size={15} />;
  return (
    <div className="activity-item" data-testid={`activity-item-${activity.id}`}>
      <div className={cn('activity-icon', activity.action === 'archived' && 'activity-icon-muted')}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs leading-5 text-foreground">
          <strong>{activity.userName}</strong> {actionLabel(activity.action)}
        </p>
        <p className="truncate text-xs font-semibold text-teal-700">{activity.templateName}</p>
      </div>
      <time className="shrink-0 text-[10px] text-muted-foreground">{formatDate(activity.timestamp)}</time>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon,
  accent = 'yellow',
}: {
  label: string;
  value: number | undefined;
  note: string;
  icon: ReactNode;
  accent?: 'yellow' | 'teal' | 'blue' | 'coral';
}) {
  return (
    <div className="stat-card" data-testid={`stat-${label}`}>
      <div className={cn('stat-icon', `stat-icon-${accent}`)}>{icon}</div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-[26px] font-bold tracking-[-0.05em] text-foreground">{formatNumber(value)}</p>
        </div>
        <p className="mb-1 text-right text-[10px] font-medium text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

function Overview() {
  const summaryQuery = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const templatesQuery = useListTemplates(undefined, { query: { queryKey: getListTemplatesQueryKey() } });
  const activityQuery = useListActivity();
  const summary = summaryQuery.data as DashboardSummary | undefined;
  const templates = (templatesQuery.data as Template[] | undefined) ?? [];
  const activities = (activityQuery.data as Activity[] | undefined) ?? [];
  const recentTemplates = [...templates].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5);

  return (
    <div className="animate-page">
      <div className="hero-strip">
        <div className="relative z-[1]">
          <p className="eyebrow eyebrow-dark">Среда команды · 14 марта 2024</p>
          <h1 className="mt-3 max-w-xl font-display text-[31px] font-bold leading-[1.03] tracking-[-0.055em] text-sidebar-foreground sm:text-[39px]">
            Всё нужное для работы.<br /><span className="text-accent">В одном месте.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-sidebar-foreground/60">
            Общая библиотека шаблонов без дублей, потерянных версий и пересылок в чатах.
          </p>
          <Link href="/templates" data-testid="link-hero-browse" className="button button-yellow mt-6">
            Открыть библиотеку <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="hero-decoration" aria-hidden="true">
          <div className="hero-grid" />
          <div className="hero-document hero-document-back"><span /><span /><span /></div>
          <div className="hero-document hero-document-front"><FileSpreadsheet size={28} /><span /><span /></div>
          <div className="hero-dot hero-dot-one" /><div className="hero-dot hero-dot-two" />
        </div>
      </div>

      <div className="mb-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <div className="stat-card" key={index}><div className="skeleton h-8 w-8 rounded-lg" /><div className="mt-6 space-y-2"><div className="skeleton h-3 w-20" /><div className="skeleton h-7 w-16" /></div></div>)
        ) : summaryQuery.isError ? (
          <div className="col-span-full"><ErrorState onRetry={() => summaryQuery.refetch()} compact /></div>
        ) : (
          <>
            <StatCard label="Всего шаблонов" value={summary?.totalTemplates} note="в библиотеке" icon={<Library size={17} />} accent="yellow" />
            <StatCard label="Отделов" value={summary?.departments} note="в команде" icon={<Users size={17} />} accent="teal" />
            <StatCard label="Скачиваний" value={summary?.downloadsThisMonth} note="в этом месяце" icon={<Download size={17} />} accent="blue" />
            <StatCard label="Новых файлов" value={summary?.newThisMonth} note="за этот месяц" icon={<BarChart3 size={17} />} accent="coral" />
          </>
        )}
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="eyebrow">Библиотека</p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Недавно обновлённые</h2>
            </div>
            <Link href="/templates" data-testid="link-view-all-templates" className="button button-ghost text-xs">
              Все шаблоны <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="surface-card overflow-hidden">
            <div className="hidden border-b border-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:flex">
              <span className="flex-1">Название</span><span className="w-[116px]">Категория</span><span className="w-[72px]">Версия</span><span className="w-14 text-right">Исп.</span><span className="w-5" />
            </div>
            {templatesQuery.isLoading ? <div className="p-4"><LoadingRows count={4} /></div> : templatesQuery.isError ? <ErrorState onRetry={() => templatesQuery.refetch()} /> : recentTemplates.length === 0 ? <EmptyState title="Библиотека пока пуста" description="Добавьте первый шаблон, чтобы команда могла начать работу." action={<Link href="/upload" data-testid="link-empty-upload" className="button button-primary mt-4">Добавить шаблон</Link>} /> : <div>{recentTemplates.map((template) => <TemplateRow key={template.id} template={template} />)}</div>}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="eyebrow">Лента событий</p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Последняя активность</h2>
            </div>
            <Clock3 size={17} className="mb-1 text-muted-foreground" />
          </div>
          <div className="surface-card">
            {activityQuery.isLoading ? <div className="p-4"><LoadingRows count={3} /></div> : activityQuery.isError ? <ErrorState onRetry={() => activityQuery.refetch()} compact /> : activities.length === 0 ? <EmptyState title="Событий пока нет" description="Здесь появятся действия команды с шаблонами." /> : <div className="divide-y divide-border/70">{activities.slice(0, 6).map((activity) => <ActivityItem key={activity.id} activity={activity} />)}</div>}
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-teal-900/10 bg-teal-50/70 p-4">
            <ShieldCheck size={20} className="shrink-0 text-teal-700" />
            <p className="text-xs leading-5 text-teal-900/75">Версии файлов сохраняются — вы всегда можете вернуться к актуальному варианту.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Templates() {
  const [location] = useLocation();
  const initialSearch = new URLSearchParams(location.split('?')[1] || '').get('search') ?? '';
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const params = useMemo(() => ({ search: search || undefined, category: category || undefined, department: department || undefined }), [search, category, department]);
  const templatesQuery = useListTemplates(params, { query: { queryKey: getListTemplatesQueryKey(params) } });
  const templates = (templatesQuery.data as Template[] | undefined) ?? [];

  return (
    <div className="animate-page">
      <PageTitle
        eyebrow="Каталог"
        title="Все шаблоны"
        description="Ищите, открывайте и используйте проверенные рабочие файлы команды."
        action={<Link href="/upload" data-testid="link-catalog-upload" className="button button-primary"><CloudUpload size={16} /> Добавить шаблон</Link>}
      />
      <div className="surface-card mb-6 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="search-field flex-1">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-template-search" type="search" placeholder="Поиск по названию или описанию..." />
            {search && <button type="button" data-testid="button-clear-search" onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={15} /></button>}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="select-field">
              <Filter size={15} />
              <select value={category} onChange={(event) => setCategory(event.target.value)} data-testid="select-category">
                <option value="">Все категории</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-field">
              <Users size={15} />
              <select value={department} onChange={(event) => setDepartment(event.target.value)} data-testid="select-department">
                <option value="">Все отделы</option>
                {departments.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3 text-xs text-muted-foreground">
          <span>{templatesQuery.isLoading ? 'Загрузка...' : `${formatNumber(templates.length)} ${templates.length === 1 ? 'шаблон' : 'шаблонов'}`}</span>
          {(category || department || search) && <button type="button" data-testid="button-reset-filters" onClick={() => { setSearch(''); setCategory(''); setDepartment(''); }} className="font-semibold text-teal-700 hover:text-teal-900">Сбросить фильтры</button>}
        </div>
      </div>
      <div className="surface-card overflow-hidden">
        <div className="hidden border-b border-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:flex">
          <span className="flex-1">Название</span><span className="w-[116px]">Категория</span><span className="w-[72px]">Версия</span><span className="w-14 text-right">Исп.</span><span className="w-5" />
        </div>
        {templatesQuery.isLoading ? <div className="p-4"><LoadingRows count={6} /></div> : templatesQuery.isError ? <ErrorState onRetry={() => templatesQuery.refetch()} /> : templates.length === 0 ? <EmptyState title="Ничего не нашли" description="Попробуйте изменить поисковый запрос или убрать фильтры." action={<button type="button" data-testid="button-empty-reset" className="button button-secondary mt-4" onClick={() => { setSearch(''); setCategory(''); setDepartment(''); }}>Очистить фильтры</button>} /> : templates.map((template) => <TemplateRow key={template.id} template={template} />)}
      </div>
    </div>
  );
}

function TemplateDetails() {
  const params = useParams<{ id?: string }>();
  const id = Number(params.id);
  const templateQuery = useGetTemplate(id, { query: { enabled: Number.isFinite(id), queryKey: getGetTemplateQueryKey(id) } });
  const deleteTemplate = useDeleteTemplate();
  const [notice, setNotice] = useState('');
  const [, setLocation] = useLocation();
  const template = templateQuery.data as Template | undefined;

  if (!Number.isFinite(id)) return <NotFound />;
  if (templateQuery.isLoading) return <div className="animate-page"><div className="skeleton h-5 w-28" /><div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]"><div className="surface-card h-96 p-7"><div className="skeleton h-12 w-12 rounded-xl" /><div className="mt-6 skeleton h-8 w-2/3" /><div className="mt-3 skeleton h-4 w-full" /></div><div className="surface-card h-72 p-6"><div className="skeleton h-4 w-1/3" /></div></div></div>;
  if (templateQuery.isError || !template) return <ErrorState onRetry={() => templateQuery.refetch()} />;

  const handleDelete = () => {
    if (!window.confirm('Удалить этот шаблон? Действие нельзя отменить.')) return;
    deleteTemplate.mutate({ id: template.id }, { onSuccess: () => setLocation('/templates') });
  };

  return (
    <div className="animate-page">
      <Link href="/templates" data-testid="link-back-templates" className="button button-ghost -ml-3 mb-7"><ArrowLeft size={16} /> Назад к шаблонам</Link>
      {notice && <div className="notice-banner mb-5" data-testid="status-download-success"><Check size={16} /> {notice}<button type="button" data-testid="button-dismiss-notice" onClick={() => setNotice('')}><X size={14} /></button></div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="surface-card overflow-hidden">
          <div className="detail-hero">
            <div className="flex items-start justify-between gap-4">
              <FileBadge type={template.fileType} large />
              <StatusPill status={template.status} />
            </div>
            <h1 className="mt-7 max-w-2xl font-display text-[30px] font-bold leading-tight tracking-[-0.05em] sm:text-[38px]">{template.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{template.description || 'Проверенный рабочий шаблон вашей команды.'}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              <span className="meta-chip">{template.category}</span><span className="meta-chip">{template.department}</span><span className="meta-chip font-mono">{template.version || 'v1.0'}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border border-t border-border sm:grid-cols-4">
            <div className="detail-stat"><span>Размер файла</span><strong>{template.fileSize || '—'}</strong></div>
            <div className="detail-stat"><span>Скачиваний</span><strong>{formatNumber(template.downloads)}</strong></div>
            <div className="detail-stat"><span>Обновлён</span><strong>{formatDate(template.updatedAt)}</strong></div>
            <div className="detail-stat"><span>Автор</span><strong className="truncate">{template.updatedBy || 'Команда'}</strong></div>
          </div>
        </section>
        <aside className="space-y-4">
          <div className="surface-card p-5">
            <p className="eyebrow">Действия</p>
            <a href={template.fileUrl || undefined} download={template.fileName} data-testid="button-download-template" className={cn('button button-primary mt-4 w-full justify-center', !template.fileUrl && 'pointer-events-none opacity-60')} onClick={() => setNotice(`Файл «${template.fileName || template.name}» скачивается`)}>
              <Download size={16} /> Скачать файл
            </a>
            <button type="button" data-testid="button-copy-template-link" className="button button-secondary mt-2 w-full justify-center" onClick={() => { navigator.clipboard?.writeText(window.location.href); setNotice('Ссылка скопирована в буфер обмена'); }}>
              <Copy size={16} /> Скопировать ссылку
            </button>
          </div>
          <div className="surface-card p-5">
            <p className="eyebrow">Информация о файле</p>
            <dl className="mt-4 space-y-4">
              <div className="flex justify-between gap-4 text-xs"><dt className="text-muted-foreground">Имя файла</dt><dd className="max-w-[180px] truncate text-right font-medium">{template.fileName || 'Не указано'}</dd></div>
              <div className="flex justify-between gap-4 text-xs"><dt className="text-muted-foreground">Последнее изменение</dt><dd className="text-right font-medium">{formatDateLong(template.updatedAt)}</dd></div>
              <div className="flex justify-between gap-4 text-xs"><dt className="text-muted-foreground">Формат</dt><dd className="font-mono font-medium uppercase">{template.fileType || 'xlsx'}</dd></div>
            </dl>
          </div>
          <button type="button" data-testid="button-delete-template" className="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent py-2.5 text-xs font-semibold text-destructive transition-colors hover:border-destructive/20 hover:bg-destructive/5" onClick={handleDelete} disabled={deleteTemplate.isPending}>
            <Trash2 size={14} /> {deleteTemplate.isPending ? 'Удаляем...' : 'Удалить шаблон'}
          </button>
        </aside>
      </div>
    </div>
  );
}

function Upload() {
  const createTemplate = useCreateTemplate();
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<TemplateInput>({ name: '', description: '', category: '', department: '', fileName: '', fileSize: '', fileType: 'xlsx', accessGroup: 'all', fileUrl: '' });
  const [error, setError] = useState('');
  const updateField = (field: keyof TemplateInput, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const onFileChange = (selected: File | undefined) => {
    if (!selected) return;
    const extension = selected.name.split('.').pop()?.toLowerCase() || 'xlsx';
    setFile(selected);
    setForm((current) => ({ ...current, fileName: selected.name, fileSize: `${(selected.size / 1024 / 1024).toFixed(1)} МБ`, fileType: extension }));
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.category || !form.department || !file) {
      setError('Заполните название, выберите файл, категорию и отдел.');
      return;
    }
    setError('');
    createTemplate.mutate({ data: { ...form, fileUrl: form.fileUrl || form.fileName } }, { onSuccess: (template) => setLocation(`/templates/${template.id}`), onError: () => setError('Не удалось сохранить шаблон. Попробуйте ещё раз.') });
  };

  return (
    <div className="animate-page">
      <PageTitle eyebrow="Новая запись" title="Добавить шаблон" description="Загрузите рабочий файл, чтобы команда всегда использовала актуальную версию." />
      <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="surface-card p-5 sm:p-7">
          <div className="mb-7 flex items-center gap-3 border-b border-border pb-5">
            <div className="step-number">01</div>
            <div><h2 className="text-sm font-bold">Данные шаблона</h2><p className="mt-0.5 text-xs text-muted-foreground">Как команда найдёт этот файл</p></div>
          </div>
          <div className="space-y-5">
            <label className="form-label">Название шаблона <span>*</span><input value={form.name} onChange={(event) => updateField('name', event.target.value)} data-testid="input-template-name" className="text-input mt-2" placeholder="Например, План продаж на месяц" /></label>
            <label className="form-label">Короткое описание <textarea value={form.description} onChange={(event) => updateField('description', event.target.value)} data-testid="input-template-description" className="text-input mt-2 min-h-[100px] resize-y" placeholder="Для чего используется этот шаблон и что в нём важно..." /></label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="form-label">Категория <span>*</span><span className="select-wrap mt-2"><select value={form.category} onChange={(event) => updateField('category', event.target.value)} data-testid="select-upload-category" className="text-input appearance-none"><option value="">Выберите категорию</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={15} /></span></label>
              <label className="form-label">Ответственный отдел <span>*</span><span className="select-wrap mt-2"><select value={form.department} onChange={(event) => updateField('department', event.target.value)} data-testid="select-upload-department" className="text-input appearance-none"><option value="">Выберите отдел</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={15} /></span></label>
            </div>
            <label className="form-label">Доступ к шаблону<span className="select-wrap mt-2"><select value={form.accessGroup} onChange={(event) => updateField('accessGroup', event.target.value)} data-testid="select-upload-access" className="text-input appearance-none"><option value="all">Вся команда</option><option value="agronomists">Только агрономы</option></select><ChevronDown size={15} /></span></label>
          </div>
          {error && <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-medium text-destructive" data-testid="status-upload-error">{error}</div>}
          <div className="mt-8 flex flex-col-reverse justify-end gap-3 border-t border-border pt-5 sm:flex-row">
            <Link href="/" data-testid="link-cancel-upload" className="button button-ghost justify-center">Отмена</Link>
            <button type="submit" data-testid="button-submit-upload" disabled={createTemplate.isPending} className="button button-primary justify-center">{createTemplate.isPending ? 'Сохраняем...' : 'Сохранить шаблон'} <ArrowUpRight size={15} /></button>
          </div>
        </section>
        <aside>
          <div className="surface-card p-5 sm:p-6">
            <div className="mb-7 flex items-center gap-3 border-b border-border pb-5">
              <div className="step-number">02</div>
              <div><h2 className="text-sm font-bold">Файл</h2><p className="mt-0.5 text-xs text-muted-foreground">Только Excel-файлы</p></div>
            </div>
            <label className={cn('upload-dropzone', !!file && 'upload-dropzone-filled')} data-testid="dropzone-file-upload">
              <input type="file" accept=".xlsx,.xls,.csv" data-testid="input-template-file" onChange={(event) => onFileChange(event.target.files?.[0])} />
              {file ? <><div className="file-badge file-badge-lg mx-auto"><FileSpreadsheet size={25} /><span>{form.fileType.toUpperCase()}</span></div><p className="mt-4 truncate px-3 text-center text-sm font-bold">{file.name}</p><p className="mt-1 text-xs text-muted-foreground">{form.fileSize} · Готов к загрузке</p><span role="button" tabIndex={0} data-testid="button-remove-upload-file" className="mt-4 text-xs font-semibold text-destructive hover:underline" onClick={(event) => { event.preventDefault(); setFile(null); setForm((current) => ({ ...current, fileName: '', fileSize: '' })); }}>Удалить файл</span></> : <><div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><CloudUpload size={21} /></div><p className="mt-4 text-sm font-bold">Перетащите файл сюда</p><p className="mt-1 text-xs text-muted-foreground">или выберите на компьютере</p><span className="button button-secondary mt-4">Выбрать файл</span><p className="mt-4 text-[10px] text-muted-foreground">XLSX, XLS или CSV · до 25 МБ</p></>}
            </label>
          </div>
          <div className="mt-4 flex gap-3 rounded-xl border border-border bg-card p-4"><ShieldCheck size={18} className="shrink-0 text-teal-700" /><p className="text-xs leading-5 text-muted-foreground">Файлы доступны только участникам вашего рабочего пространства.</p></div>
        </aside>
      </form>
    </div>
  );
}

function Settings() {
  const [saved, setSaved] = useState(false);
  const [workspace, setWorkspace] = useState('Команда операционного развития');
  const [role, setRole] = useState('Администратор');
  const [notifications, setNotifications] = useState(true);
  const [archive, setArchive] = useState(true);
  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3200);
  };
  return (
    <div className="animate-page">
      <PageTitle eyebrow="Рабочее пространство" title="Настройки" description="Управляйте командой, доступами и правилами общей библиотеки." />
      {saved && <div className="notice-banner mb-6" data-testid="status-settings-saved"><Check size={16} /> Изменения сохранены</div>}
      <form onSubmit={saveSettings} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="surface-card p-5 sm:p-7">
            <div className="section-heading"><div className="setting-icon"><Users size={17} /></div><div><h2>Команда и доступ</h2><p>Кто может работать с базой шаблонов</p></div></div>
            <div className="mt-7 space-y-5">
              <label className="form-label">Название команды<input value={workspace} onChange={(event) => setWorkspace(event.target.value)} data-testid="input-workspace-name" className="text-input mt-2" /></label>
              <label className="form-label">Ваша роль<span className="select-wrap mt-2"><select value={role} onChange={(event) => setRole(event.target.value)} data-testid="select-user-role" className="text-input appearance-none"><option>Администратор</option><option>Редактор</option><option>Наблюдатель</option></select><ChevronDown size={15} /></span></label>
            </div>
          </section>
          <section className="surface-card p-5 sm:p-7">
            <div className="section-heading"><div className="setting-icon setting-icon-yellow"><SlidersHorizontal size={17} /></div><div><h2>Правила библиотеки</h2><p>Настройте поведение пространства под команду</p></div></div>
            <div className="mt-6 divide-y divide-border">
              <label className="setting-row"><span><strong>Уведомлять об изменениях</strong><small>Получать письмо, когда файл обновлён</small></span><input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} data-testid="toggle-notifications" className="toggle-input" /></label>
              <label className="setting-row"><span><strong>Сохранять архивные версии</strong><small>Не удалять старые файлы после обновления</small></span><input type="checkbox" checked={archive} onChange={(event) => setArchive(event.target.checked)} data-testid="toggle-archive" className="toggle-input" /></label>
            </div>
          </section>
          <button type="submit" data-testid="button-save-settings" className="button button-primary">Сохранить изменения <Check size={15} /></button>
        </div>
        <aside className="space-y-4">
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border bg-muted/30 p-5"><p className="eyebrow">Ваш тариф</p><div className="mt-3 flex items-center justify-between"><h2 className="font-display text-2xl font-bold tracking-[-0.04em]">Командный</h2><span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-accent-foreground">PRO</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Для команд, где порядок в документах — часть процесса.</p></div>
            <div className="space-y-3 p-5 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Шаблоны</span><strong>Без ограничений</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Участники</span><strong>12 из 25</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Хранилище</span><strong>2.4 ГБ из 10 ГБ</strong></div></div>
          </div>
          <div className="surface-card p-5"><div className="flex items-center gap-3"><div className="avatar avatar-md avatar-blue">АК</div><div><p className="text-sm font-bold">Алексей Крылов</p><p className="text-xs text-muted-foreground">alexey@severin.team</p></div></div><button type="button" data-testid="button-manage-profile" className="button button-secondary mt-5 w-full justify-center" onClick={() => window.alert('Управление профилем доступно через администратора рабочего пространства.')}>Управление профилем</button></div>
          <div className="flex gap-3 rounded-xl border border-border bg-card p-4"><ShieldCheck size={18} className="shrink-0 text-teal-700" /><p className="text-xs leading-5 text-muted-foreground">Данные рабочего пространства защищены и доступны только вашей команде.</p></div>
        </aside>
      </form>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Shell>
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/templates/:id" component={TemplateDetails} />
          <Route path="/templates" component={Templates} />
          <Route path="/upload" component={Upload} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </RoutedErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;