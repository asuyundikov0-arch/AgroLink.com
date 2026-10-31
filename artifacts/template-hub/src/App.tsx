import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  LogOut,
  Menu,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  X,
  RotateCcw,
  Settings as SettingsIcon,
  Sprout,
  Wrench,
} from "lucide-react";
import {
  type RoleRequest,
  getGetMyRoleRequestQueryKey,
  getListRoleRequestsQueryKey,
  getListUsersQueryKey,
  useCreateRoleRequest,
  useGetMyRoleRequest,
  useListRoleRequests,
  useListUsers,
  useDeleteUser,
  useReviewRoleRequest,
} from "@workspace/api-client-react";
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import EngineeringWorkspace from "@/components/engineering/EngineeringWorkspace";
import AgroWorkspace from "@/components/agro/AgroWorkspace";
import ReportsWorkspace, { canViewReports } from "@/components/reports/ReportsWorkspace";
import PaymentRegister from "@/components/economic/PaymentRegister";
import EmployeeDirectory from "@/components/employees/EmployeeDirectory";
import { ChemicalBalanceCard } from "@/components/agro/chemicals/Custody";
import HRWorkspace from "@/components/hr/HRWorkspace";
import PayrollRegisterWorkspace from "@/components/economic/PayrollRegisterWorkspace";
import FinancialWorkspace from "@/components/economic/FinancialWorkspace";
import { Toaster } from "@/components/ui/toaster";
import { ThemeSwitch, useTheme, type AppTheme } from "@/components/theme-switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import companyEmblem from "@assets/IMG_0731_1787404427367.jpeg";
import fieldBackdrop from "@assets/4EEAF023-8B35-41FE-8D91-A04A016B4736_1793193861034.png";
import "./index.css";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const departments = ["АПК Арыстан Grain", "АФ Веденовка", "Агрономия", "Инженерная служба", "Финансовый отдел", "Управление"];
const roleLabels = {
  agronomist: "Агроном",
  chief_agronomist: "Главный агроном",
  grain_manager: "Заведующий током",
  weigher: "Весовщица",
  dispatcher: "Диспетчер",
  farm_director: "Директор хозяйства",
  general_director: "Генеральный директор",
  engineer: "Инженер",
  chief_engineer: "Главный инженер",
  storekeeper: "Заведующий складом",
  fuel_manager: "Заведующий нефтебазой",
  motor_pool_manager: "Заведующий автобазой",
  hr: "Отдел кадров",
  economist: "Экономист",
} as const;
type AppRole = keyof typeof roleLabels;
const appRoles = Object.keys(roleLabels) as AppRole[];
function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && value in roleLabels;
}
function roleLabel(value: unknown) {
  return isAppRole(value) ? roleLabels[value] : "Роль больше не используется";
}

function clerkAppearanceFor(theme: AppTheme) {
  const light = theme === "light";
  const c = light
    ? { fg: "#0f2238", muted: "#4f6378", bg: "#ffffff", input: "#f3f7fc", primary: "#0d5fb8", primaryFg: "#ffffff", danger: "#c53b33" }
    : { fg: "#ece9e2", muted: "#9a978f", bg: "#151515", input: "#1d1d1d", primary: "#ece9e2", primaryFg: "#121212", danger: "#e0605a" };
  return {
    theme: shadcn,
    cssLayerName: "clerk",
    options: { logoPlacement: "inside" as const, logoLinkUrl: basePath || "/", logoImageUrl: companyEmblem },
    variables: {
      colorPrimary: c.primary, colorPrimaryForeground: c.primaryFg, colorForeground: c.fg, colorMutedForeground: c.muted,
      colorBackground: c.bg, colorInput: c.input, colorInputForeground: c.fg, colorDanger: c.danger, colorNeutral: c.fg,
      fontFamily: "DM Sans, sans-serif", borderRadius: "0.75rem",
    },
    elements: {
      rootBox: "w-full flex justify-center",
      cardBox: light ? "w-[440px] max-w-full overflow-hidden rounded-2xl border border-[#c9d7e8] bg-white/95 shadow-2xl backdrop-blur" : "w-[440px] max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#151515]/95 shadow-2xl backdrop-blur",
      card: "!border-0 !bg-transparent !shadow-none",
      footer: "!border-0 !bg-transparent !shadow-none",
      headerTitle: light ? "text-[#0f2238]" : "text-[#ece9e2]",
      headerSubtitle: light ? "text-[#4f6378]" : "text-[#9a978f]",
      socialButtonsBlockButtonText: light ? "text-[#0f2238]" : "text-[#ece9e2]",
      formFieldLabel: light ? "text-[#1d3550]" : "text-[#d8d5ce]",
      footerActionLink: light ? "text-[#0d5fb8]" : "text-[#d9b46a]",
      footerActionText: light ? "text-[#4f6378]" : "text-[#9a978f]",
      dividerText: light ? "text-[#5d7088]" : "text-[#7d7a73]",
      identityPreviewEditButton: light ? "text-[#0d5fb8]" : "text-[#d9b46a]",
      formFieldSuccessText: light ? "text-[#0d5fb8]" : "text-[#d9b46a]",
      alertText: light ? "text-[#0f2238]" : "text-[#ece9e2]",
      logoBox: "pb-2",
      logoImage: "h-10 w-10",
      socialButtonsBlockButton: light ? "border-[#c9d7e8] bg-[#f3f7fc]" : "border-white/15 bg-[#1d1d1d]",
      formButtonPrimary: light ? "bg-[#0d5fb8] text-white hover:bg-[#0a4d96]" : "bg-[#ece9e2] text-[#121212] hover:bg-white/80",
      formFieldInput: light ? "border-[#c9d7e8] bg-[#f3f7fc] text-[#0f2238]" : "border-white/15 bg-[#1d1d1d] text-[#ece9e2]",
      footerAction: light ? "border-[#c9d7e8]" : "border-white/10",
      dividerLine: light ? "bg-[#c9d7e8]" : "bg-white/10",
      alert: light ? "border-[#c9d7e8] bg-[#f3f7fc]" : "border-white/10 bg-[#1d1d1d]",
      otpCodeFieldInput: light ? "border-[#c9d7e8]" : "border-white/15",
      formFieldRow: "gap-2",
      main: "gap-4",
    },
  };
}

const backdropStyle = { "--app-backdrop": `url("${fieldBackdrop}")` } as CSSProperties;

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "С";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function BrandEmblem({ size = "md" }: { size?: "md" | "lg" }) {
  return <img src={companyEmblem} alt="AgroLink operation" className={cn("brand-emblem", size === "lg" ? "brand-emblem-lg" : "brand-emblem-md")} />;
}

type WorkspaceSection = "cabinet" | "agro" | "engineering" | "reports" | "economic" | "employees" | "hr" | "settings";

function LoadingRows({ count = 3 }: { count?: number }) {
  return <div className="space-y-3" data-testid="status-loading">{Array.from({ length: count }).map((_, index) => <div className="skeleton-row" key={index}><div className="skeleton h-10 w-10 rounded-lg" /><div className="min-w-0 flex-1 space-y-2"><div className="skeleton h-3.5 w-2/5" /><div className="skeleton h-3 w-1/4" /></div></div>)}</div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="empty-state" data-testid="status-error"><div className="empty-icon empty-icon-error"><X size={20} /></div><h3 className="mt-4 text-sm font-bold">Не удалось загрузить данные</h3><p className="mt-1 max-w-xs text-center text-xs leading-5 text-muted-foreground">Проверьте соединение и попробуйте ещё раз.</p><button type="button" className="button button-secondary mt-4" onClick={onRetry}>Повторить</button></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><div className="empty-icon"><ClipboardCheck size={20} /></div><h3 className="mt-4 text-sm font-bold">{title}</h3><p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">{description}</p></div>;
}

function PublicLanding() {
  return (
    <main className="auth-landing app-backdrop" style={backdropStyle}>
      <ThemeSwitch className="theme-switch-floating" />
      <div className="auth-landing-grid" aria-hidden="true" />
      <section className="auth-landing-card">
        <div className="landing-brand"><BrandEmblem size="lg" /><div><p className="landing-brand-name">AgroLink operation</p><p className="landing-brand-caption">Операционная система хозяйства</p></div></div>
        <p className="eyebrow mt-7">Поле, ток, техника, люди</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.05em] text-foreground">Операции в одном месте.<br /><span className="text-[hsl(var(--accent))]">Понятные роли.</span></h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Каждый сотрудник выбирает роль при регистрации. Полевые работы, баланс зерна, склад химии, ремонт техники и наряды открываются только после согласования роли руководителем.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`${basePath}/sign-in`} className="button button-primary">Войти <UserRound size={16} /></a>
          <a href={`${basePath}/sign-up`} className="button button-secondary">Зарегистрироваться</a>
        </div>
      </section>
      <aside className="auth-landing-aside">
        <ShieldCheck size={28} className="text-foreground" />
        <h2 className="mt-5 font-display text-2xl font-bold tracking-[-0.04em]">Доступ под контролем</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">После регистрации заявка попадает в очередь руководителя. До согласования действия по рабочим ролям недоступны.</p>
      </aside>
    </main>
  );
}

const demoRoleScenarios: Record<AppRole, { workspace: string; title: string; description: string; document: string; action: string; result: string }> = {
  agronomist: { workspace: "АгроБлок", title: "Ход полевых работ", description: "Внесите выполненные за день гектары, механизатора и технику по операции на поле.", document: "Посев пшеницы · поле № 14 · АПК Арыстан Grain", action: "Сохранить выполнение", result: "Демо: гектары учтены, ежедневная сводка по посеву обновлена автоматически." },
  chief_agronomist: { workspace: "АгроБлок", title: "Согласование внеплановых работ", description: "Проверьте внеплановую операцию агронома и подтвердите её или верните.", document: "Боронование · поле № 7 · АФ Веденовка", action: "Согласовать операцию", result: "Демо: операция согласована и учтена в плане поля." },
  grain_manager: { workspace: "АгроБлок", title: "Согласование зерновых операций", description: "Проверьте поступившие от весовщицы операции и подтвердите или верните их.", document: "Приход зерна · АФ Веденовка", action: "Согласовать операцию", result: "Демо: операция передана в общий баланс." },
  weigher: { workspace: "АгроБлок", title: "Ввод зерновых операций", description: "Внесите взвешивание и отправьте запись заведующему током на согласование.", document: "Приход зерна с поля · АПК Арыстан Grain", action: "Отправить на согласование", result: "Демо: запись передана заведующему током." },
  dispatcher: { workspace: "Диспетчерская", title: "Рейсы и фактические расценки", description: "Проверьте поездки по зерну и завершённые полевые работы, затем внесите фактические ставки.", document: "Рейс зерна · АФ Веденовка", action: "Сохранить расценку", result: "Демо: ставка сохранена и сумма рассчитана." },
  farm_director: { workspace: "Личный кабинет", title: "Заявки сотрудников на роли", description: "Проверьте заявку нового сотрудника хозяйства и откройте ему доступ.", document: "Заявка на роль «Весовщица» · АФ Веденовка", action: "Согласовать роль", result: "Демо: роль согласована, сотруднику открыт рабочий раздел." },
  general_director: { workspace: "Платежи и зарплата", title: "Оплата согласованных запчастей", description: "Проверьте позицию в реестре платежей и отметьте её оплаченной.", document: "Подшипник ступицы · К-744 · Инженерная служба", action: "Отметить оплату", result: "Демо: позиция оплачена и передана складу на приёмку." },
  engineer: { workspace: "Инженерный блок", title: "Заявка на запчасти", description: "Укажите технику и нужные позиции, затем направьте заявку главному инженеру.", document: "Заявка на запчасти · К-744 · Инженерная служба", action: "Отправить главному инженеру", result: "Демо: заявка направлена главному инженеру." },
  chief_engineer: { workspace: "Инженерный блок", title: "Проверка заявок на запчасти", description: "Проверьте позиции заявки инженера и направьте их генеральному директору.", document: "Заявка на запчасти · К-744 · Инженерная служба", action: "Согласовать и направить", result: "Демо: заявка согласована и направлена генеральному директору." },
  storekeeper: { workspace: "Инженерный блок", title: "Приёмка запчастей", description: "Проверьте одобренные заявки, внесите фактическое поступление по накладной и пополните склад.", document: "Заявка на покупку запчастей · Инженерная служба", action: "Оприходовать накладную", result: "Демо: поступление по заявке оприходовано на складе." },
  fuel_manager: { workspace: "Инженерный блок", title: "Учёт нефтебазы", description: "Внесите приход топлива по накладной и выдачу на технику с указанием поля и операции.", document: "Выдача ДТ · К-744 · поле № 14", action: "Провести выдачу", result: "Демо: выдача топлива учтена, остаток нефтебазы уменьшен." },
  motor_pool_manager: { workspace: "Инженерный блок", title: "Автобаза", description: "Рассчитайте зарплату водителей за рейсы и тонно-километры, затем отправьте наряд в отдел кадров.", document: "Рейс КамАЗа на элеватор", action: "Рассчитать зарплату", result: "Демо: сумма рейса рассчитана для отправки в отдел кадров." },
  hr: { workspace: "Отдел кадров", title: "Подтверждение ежедневных нарядов", description: "Проверьте дневной наряд диспетчера по всем сотрудникам и подтвердите начисления.", document: "Ежедневный наряд · АФ Веденовка", action: "Подтвердить начисления", result: "Демо: наряд подтверждён и передан в накопительный зарплатный реестр." },
  economist: { workspace: "Экономический блок", title: "Производственный бюджет и Cash Flow", description: "Внесите помесячный план и фактические затраты, поступления и выплаты.", document: "Бюджет и движение денег", action: "Сохранить запись", result: "Демо: запись учтена в помесячной таблице." },
};

function PublicDemo() {
  const [role, setRole] = useState<AppRole>("engineer");
  const [message, setMessage] = useState("");
  const scenario = demoRoleScenarios[role];
  return <main className="app-backdrop min-h-[100dvh] px-4" style={backdropStyle}><div className="py-6 sm:py-10">
    <div className="mx-auto max-w-5xl">
      <div className="mb-7 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><BrandEmblem /><div><p className="landing-brand-name">AgroLink operation</p><p className="text-xs text-muted-foreground">Интерактивная демо-версия</p></div></div><div className="flex items-center gap-2"><ThemeSwitch /><a href={basePath || "/"} className="button button-secondary text-xs"><ArrowLeft size={14} />К стартовой странице</a></div></div>
      <section className="surface-card mb-6 border-l-[4px] border-l-[hsl(var(--accent))] p-5 sm:p-7"><p className="eyebrow">Без регистрации и доступа к данным</p><h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.05em]">Посмотрите работу каждой роли</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Это безопасная учебная копия интерфейса. Все действия работают только внутри этого экрана и не создают пользователей, записи или заявки.</p><label className="form-label mt-6 block max-w-sm">Роль для демонстрации<select className="text-input mt-2" value={role} onChange={(event) => { setRole(event.target.value as AppRole); setMessage(""); }} data-testid="select-public-demo-role">{appRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></label></section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]"><section className="surface-card overflow-hidden"><div className="border-b border-border bg-muted/25 px-5 py-5 sm:px-7"><p className="eyebrow">{scenario.workspace}</p><h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.045em]">{scenario.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{scenario.description}</p></div><div className="p-5 sm:p-7"><article className="rounded-xl border border-border bg-card p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-3"><div className="setting-icon"><ClipboardCheck size={17} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{scenario.document}</h3><span className="meta-chip">Демо-запись</span></div><p className="mt-1 text-xs text-muted-foreground">Рабочая операция · маршрут показан на примере</p></div></div><button type="button" className="button button-primary shrink-0 text-xs" onClick={() => setMessage(scenario.result)} data-testid="button-run-demo-action"><Check size={14} />{scenario.action}</button></div></article>{message && <div className="notice-banner mt-5"><Check size={16} />{message}<button type="button" aria-label="Закрыть" onClick={() => setMessage("")}><X size={14} /></button></div>}</div></section>
        <aside className="surface-card p-5 sm:p-6"><div className="section-heading"><div className="setting-icon"><Users size={17} /></div><div><h2>Маршрут роли</h2><p>Без настоящих прав доступа.</p></div></div><ol className="mt-6 space-y-4 text-sm"><li className="flex gap-3"><span className="meta-chip">1</span><span>Выберите роль в списке.</span></li><li className="flex gap-3"><span className="meta-chip">2</span><span>Посмотрите доступный ей рабочий раздел.</span></li><li className="flex gap-3"><span className="meta-chip">3</span><span>Нажмите действие и увидите результат в демо-режиме.</span></li></ol><a href={`${basePath}/sign-up`} className="button button-secondary mt-7 w-full justify-center text-xs">Перейти к настоящей регистрации</a></aside>
      </div>
    </div>
  </div></main>;
}

function AuthBackButton() {
  return <a href={basePath || "/"} className="auth-back-button" data-testid="button-auth-back"><ArrowLeft size={16} />Назад</a>;
}

function SignInPage() {
  return <main className="auth-screen app-backdrop" style={backdropStyle}><AuthBackButton /><ThemeSwitch className="theme-switch-floating" /><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main>;
}

function SignUpPage() {
  return <main className="auth-screen app-backdrop" style={backdropStyle}><AuthBackButton /><ThemeSwitch className="theme-switch-floating" /><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main>;
}

function RoleRequestScreen({ request }: { request: RoleRequest | null }) {
  const { user } = useUser();
  const createRequest = useCreateRoleRequest();
  const [requestedRole, setRequestedRole] = useState<AppRole>(isAppRole(request?.requestedRole) ? request.requestedRole : "agronomist");
  const [department, setDepartment] = useState(request?.department ?? "АПК Арыстан Grain");
  const [message, setMessage] = useState("");
  const isPending = request?.status === "pending";
  const isRejected = request?.status === "rejected";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    createRequest.mutate({ data: { requestedRole, department } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyRoleRequestQueryKey() });
        setMessage("Заявка отправлена руководителю. Обновите страницу позже — доступ появится после согласования.");
      },
      onError: () => setMessage("Не удалось отправить заявку. Проверьте выбранные данные и повторите попытку."),
    });
  };

  return (
    <main className="access-page app-backdrop" style={backdropStyle}>
      <ThemeSwitch className="theme-switch-floating" />
      <section className="access-card">
        <div className={cn("access-icon", isPending ? "access-icon-waiting" : isRejected ? "access-icon-rejected" : "")}>
          {isPending ? <Clock3 size={24} /> : isRejected ? <RotateCcw size={24} /> : <ShieldCheck size={24} />}
        </div>
        <p className="eyebrow mt-6">Доступ к рабочему пространству</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.05em]">
          {isPending ? "Заявка на согласовании" : isRejected ? "Роль не согласована" : "Выберите роль"}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {isPending
            ? `Ваша заявка на роль «${roleLabel(request.requestedRole)}» передана руководителю. До решения рабочие функции недоступны.`
            : isRejected
              ? (request.reviewComment || "Руководитель отклонил заявку. Исправьте роль или подразделение и отправьте её повторно.")
              : `Здравствуйте, ${user?.firstName || "сотрудник"}. Укажите рабочую роль — руководитель подтвердит её перед открытием доступа.`}
        </p>
        {isPending && <div className="mt-6 rounded-xl border border-border bg-muted/60 p-4 text-left text-xs leading-5 text-foreground"><strong>Уведомление отправлено.</strong> Экран автоматически проверяет результат согласования.</div>}
        {!isPending && (
          <form className="mt-7 grid gap-5 text-left" onSubmit={submit}>
            <label className="form-label">Запрашиваемая роль<span className="select-wrap mt-2"><select className="text-input appearance-none" value={requestedRole} onChange={(event) => setRequestedRole(event.target.value as AppRole)} data-testid="select-requested-role">{appRoles.map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}</select><ChevronDown size={15} /></span></label>
            <label className="form-label">Подразделение<span className="select-wrap mt-2"><select className="text-input appearance-none" value={department} onChange={(event) => setDepartment(event.target.value)} data-testid="select-request-department">{departments.map((item) => <option value={item} key={item}>{item}</option>)}</select><ChevronDown size={15} /></span></label>
            {requestedRole === "general_director" && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">Первый генеральный директор назначается администратором в защищённой настройке запуска. Последующие заявки согласуются действующим руководством.</p>}
            <button type="submit" className="button button-primary justify-center" disabled={createRequest.isPending} data-testid="button-submit-role-request">{createRequest.isPending ? "Отправляем..." : isRejected ? "Отправить повторно" : "Отправить на согласование"} <Send size={15} /></button>
          </form>
        )}
        {message && <p className="notice-banner mt-5"><Check size={16} />{message}</p>}
      </section>
    </main>
  );
}

function ApprovalQueue({ role, isDemoPreview = false }: { role: AppRole; isDemoPreview?: boolean }) {
  const enabled = ["chief_agronomist", "farm_director", "general_director", "chief_engineer"].includes(role);
  const requestsQuery = useListRoleRequests({ query: { enabled, queryKey: getListRoleRequestsQueryKey(), refetchInterval: 15000 } });
  const reviewRequest = useReviewRoleRequest();
  const rows = (requestsQuery.data as RoleRequest[] | undefined) ?? [];
  if (!enabled) return null;

  const decide = (request: RoleRequest, decision: "approved" | "rejected") => {
    const reviewComment = decision === "approved"
      ? "Роль согласована. Доступ к рабочему кабинету открыт."
      : (window.prompt("Укажите причину отказа для сотрудника:", "Проверьте выбранную роль и подразделение.") ?? "Заявка отклонена руководителем.");
    reviewRequest.mutate({ id: request.id, data: { decision, reviewComment } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRoleRequestsQueryKey() });
      },
    });
  };

  return (
    <section className="surface-card mb-7 overflow-hidden" data-testid="role-approval-queue">
      <div className="flex flex-col justify-between gap-3 border-b border-border bg-muted/25 px-5 py-4 sm:flex-row sm:items-center">
        <div><p className="eyebrow">Уведомления</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Заявки на роли</h2></div>
        <span className="meta-chip">{requestsQuery.isLoading ? "Загрузка" : `${rows.length} ожидают решения`}</span>
      </div>
      {requestsQuery.isLoading ? <div className="p-5"><LoadingRows count={2} /></div> : requestsQuery.isError ? <ErrorState onRetry={() => requestsQuery.refetch()} /> : rows.length === 0 ? <div className="px-5 py-8 text-sm text-muted-foreground">Новых заявок нет.</div> : (
        <div className="divide-y divide-border/70">{rows.map((request) => (
          <article key={request.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{request.displayName}</h3><span className="meta-chip">{roleLabel(request.requestedRole)}</span></div><p className="mt-1 text-xs text-muted-foreground">{request.email} · {request.department} · {formatDate(request.requestedAt)}</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" className="button button-secondary text-xs" disabled={reviewRequest.isPending} onClick={() => decide(request, "rejected")} data-testid={`button-reject-role-${request.id}`}>Отклонить</button><button type="button" className="button button-primary text-xs" disabled={reviewRequest.isPending} onClick={() => decide(request, "approved")} data-testid={`button-approve-role-${request.id}`}><Check size={14} /> Согласовать</button></div>
          </article>
        ))}</div>
      )}
    </section>
  );
}
function Shell({
  children,
  role,
  request,
  activeSection,
  onNavigate,
}: {
  children: ReactNode;
  role: AppRole;
  request: RoleRequest;
  activeSection: WorkspaceSection;
  onNavigate: (section: WorkspaceSection) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [topNotice, setTopNotice] = useState("");
  const { signOut } = useClerk();
  const activeSidebarSection = activeSection;
  const isDispatcher = role === "dispatcher";
  const isHr = role === "hr";
  const isHrVisible = isHr || role === "general_director";
  const isAgroVisible = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "dispatcher", "general_director"].includes(role);
  const isEngineeringVisible = ["engineer", "chief_engineer", "storekeeper", "fuel_manager", "motor_pool_manager", "general_director"].includes(role);
  const isEconomicVisible = role === "general_director" || role === "economist";
  const isEmployeesVisible = ["general_director", "chief_agronomist", "chief_engineer", "dispatcher"].includes(role);
  const navigation = [
    ...(!isDispatcher && !isHr ? [
      { id: "cabinet" as const, label: "Личный кабинет", icon: ClipboardCheck },
    ] : []),
    ...(isAgroVisible ? [{ id: "agro" as const, label: isDispatcher ? "Диспетчерская" : "АгроБлок", icon: Sprout }] : []),
    ...(isEngineeringVisible ? [{ id: "engineering" as const, label: "Инженерный блок", icon: Wrench }] : []),
    ...(canViewReports(role) ? [{ id: "reports" as const, label: "Отчёты", icon: ClipboardList }] : []),
    ...(isEconomicVisible ? [{ id: "economic" as const, label: "Экономический блок", icon: BarChart3 }] : []),
    ...(isEmployeesVisible ? [{ id: "employees" as const, label: "Сотрудники", icon: Users }] : []),
    ...(isHrVisible ? [{ id: "hr" as const, label: "Отдел кадров", icon: BadgeCheck }] : []),
    { id: "settings" as const, label: "Настройки", icon: SettingsIcon },
  ];
  const navigateFromSidebar = (section: WorkspaceSection) => {
    onNavigate(section);
    setMobileOpen(false);
  };

  return (
    <div className="app-backdrop min-h-[100dvh] overflow-x-clip text-foreground" style={backdropStyle}>
      <aside className={cn("fixed inset-y-0 left-0 z-30 w-[256px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0", mobileOpen ? "flex translate-x-0" : "hidden -translate-x-full md:flex")} data-testid="sidebar-navigation">
        <div className="mb-9 flex items-center gap-3 px-2"><BrandEmblem /><div><div className="font-display text-[15px] font-bold tracking-[-0.02em]">AgroLink operation</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/55">Операционный контур</div></div></div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/35">Рабочее пространство</div>
        <nav className="grid gap-1" aria-label="Разделы рабочего пространства">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={cn("nav-item w-full text-left", activeSidebarSection === id && "nav-item-active")}
              onClick={() => navigateFromSidebar(id)}
              aria-current={activeSidebarSection === id ? "page" : undefined}
              data-testid={`nav-workspace-${id}`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border px-2 pt-4"><div className="flex items-center gap-3"><div className="avatar avatar-sm avatar-accent">{initials(request.displayName)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{request.displayName}</p><p className="truncate text-[11px] text-sidebar-foreground/45">{roleLabels[role]}</p></div><button type="button" className="icon-button-dark" title="Выйти" aria-label="Выйти" onClick={() => signOut({ redirectUrl: basePath || "/" })}><LogOut size={16} /></button></div></div>
      </aside>
      {mobileOpen && <button type="button" aria-label="Закрыть меню" className="fixed inset-0 z-20 bg-sidebar/40 md:hidden" onClick={() => setMobileOpen(false)} />}
      <main className="min-h-[100dvh] md:pl-[256px]">
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-10"><button type="button" aria-label="Открыть меню" className="icon-button md:hidden" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="size-1.5 rounded-full bg-emerald-500" />Доступ подтверждён</div><div className="ml-auto flex items-center gap-3"><ThemeSwitch /><button type="button" className="icon-button" aria-label="Помощь" onClick={() => setTopNotice("По вопросам доступа обратитесь к руководителю, который согласовал вашу роль.")}><CircleHelp size={18} /></button><div className="avatar avatar-sm avatar-blue">{initials(request.displayName)}</div></div></header>
        {topNotice && <div className="mx-5 mt-4 md:mx-10"><div className="notice-banner max-w-xl"><CircleHelp size={16} /><span>{topNotice}</span><button type="button" aria-label="Закрыть" onClick={() => setTopNotice("")}><X size={14} /></button></div></div>}
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  );
}

function UserManagement({ role }: { role: AppRole }) {
  const usersQuery = useListUsers({ query: { enabled: role === "general_director", queryKey: getListUsersQueryKey() } });
  const deleteUser = useDeleteUser();
  const [notice, setNotice] = useState("");
  const users = (usersQuery.data as RoleRequest[] | undefined) ?? [];
  if (role !== "general_director") return null;

  const remove = (user: RoleRequest) => {
    const confirmed = window.confirm(`Удалить сотрудника «${user.displayName}» из списка? Доступ к базе будет отозван сразу, а внесённые им операции сохранятся.`);
    if (!confirmed) return;
    deleteUser.mutate({ id: user.id }, {
      onSuccess: () => {
        setNotice(`Доступ сотрудника «${user.displayName}» отозван.`);
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: () => setNotice("Не удалось удалить сотрудника. Проверьте, что это не ваш собственный или последний директорский доступ."),
    });
  };

  return <section className="surface-card mb-7 overflow-hidden">
    <div className="flex flex-col justify-between gap-3 border-b border-border bg-muted/25 px-5 py-5 sm:flex-row sm:items-center"><div><p className="eyebrow">Управление доступом</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Сотрудники</h2><p className="mt-1 text-sm text-muted-foreground">Подтверждённые пользователи системы.</p></div><span className="meta-chip">{usersQuery.isLoading ? "Загрузка" : `${users.length} сотрудников`}</span></div>
    {notice && <div className="mx-5 mt-5 notice-banner"><Check size={16} />{notice}<button type="button" aria-label="Закрыть" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {usersQuery.isLoading ? <div className="p-5"><LoadingRows count={3} /></div> : usersQuery.isError ? <ErrorState onRetry={() => usersQuery.refetch()} /> : users.length === 0 ? <EmptyState title="Список сотрудников пуст" description="Подтверждённые роли появятся здесь." /> : <div className="divide-y divide-border/70">{users.map((user) => <article key={user.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{user.displayName}</h3><span className="meta-chip">{roleLabel(user.requestedRole)}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{user.email} · {user.department}</p></div><button type="button" className="button button-danger shrink-0 text-xs" disabled={deleteUser.isPending} onClick={() => remove(user)} data-testid={`button-remove-user-${user.id}`}><X size={14} />{deleteUser.isPending ? "Удаляем..." : "Удалить"}</button></article>)}</div>}
  </section>;
}

function Cabinet({ role, actualRole, demoRole, onDemoRoleChange }: {
  role: AppRole;
  actualRole: AppRole;
  demoRole: AppRole | null;
  onDemoRoleChange: (role: AppRole | null) => void;
}) {
  return (
    <div className="animate-page">
      <div className="mb-8"><p className="eyebrow">Рабочее пространство</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em] text-foreground sm:text-[34px]">Личный кабинет</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Ваша роль «{roleLabels[role]}» подтверждена. Рабочие разделы в меню слева открыты в соответствии с ролью.</p></div>
      {actualRole === "general_director" && <section className="surface-card mb-7 border-l-[4px] border-l-[hsl(var(--accent))] p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Демонстрационный режим</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Просмотр интерфейса по ролям</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Переключатель меняет только экран. Доступ к данным и любые действия от имени другой роли заблокированы.</p></div><label className="form-label min-w-60">Роль для просмотра<select className="text-input mt-2" value={demoRole ?? ""} onChange={(event) => onDemoRoleChange(event.target.value ? event.target.value as AppRole : null)} data-testid="select-demo-role"><option value="">Моя роль — генеральный директор</option>{appRoles.filter((item) => item !== "general_director").map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></label></div></section>}
      <ApprovalQueue role={role} isDemoPreview={Boolean(demoRole)} />
      {(role === "agronomist" || role === "general_director") && <ChemicalBalanceCard seeAll={role === "general_director"} />}
      <UserManagement role={role} />
    </div>
  );
}

function FinanceBlock({ role, actualRole, demoRole }: { role: AppRole; actualRole: AppRole; demoRole: AppRole | null }) {
  const [tab, setTab] = useState<"payments" | "payroll">("payments");
  if (role !== "general_director" && role !== "economist") return <div className="surface-card"><EmptyState title="Раздел недоступен" description="Экономический блок доступен экономисту и генеральному директору." /></div>;
  const canManage = ["general_director", "economist"].includes(actualRole) && !demoRole;
  return <div className="animate-page">
    <FinancialWorkspace canManage={canManage} canVoid={actualRole === "general_director" && !demoRole} />
    <details className="surface-card mt-7 p-5" data-testid="economic-existing-registers">
    <summary className="cursor-pointer text-sm font-semibold">Действующие реестры согласованных платежей{role === "general_director" ? " и зарплаты" : ""}</summary>
    <p className="my-4 text-xs leading-6 text-muted-foreground">Платежи по запчастям проходят ранее установленное согласование. Оплаченные позиции автоматически отражаются в факте Cash Flow — повторно вручную их вносить не нужно. Затраты в бюджет экономист вносит отдельно.</p>
    <div className="mb-5 inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Платежи и зарплата">
      <button type="button" role="tab" aria-selected={tab === "payments"} className={`rounded-md px-3 py-1.5 text-xs font-bold ${tab === "payments" ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setTab("payments")} data-testid="tab-economic-payments">Реестр платежей</button>
      {role === "general_director" && <button type="button" role="tab" aria-selected={tab === "payroll"} className={`rounded-md px-3 py-1.5 text-xs font-bold ${tab === "payroll" ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setTab("payroll")} data-testid="tab-economic-payroll">Зарплатный реестр</button>}
    </div>
    {tab === "payments" || role === "economist" ? <PaymentRegister canMarkPaid={canManage} /> : <PayrollRegisterWorkspace canManage={canManage} />}
    </details>
  </div>;
}

function SettingsPage({ role, request }: { role: AppRole; request: RoleRequest }) {
  return <div className="animate-page"><div className="mb-7"><p className="eyebrow">Рабочее пространство</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">Настройки и доступ</h1><p className="mt-2 text-sm text-muted-foreground">Параметры профиля и подтверждённой роли.</p></div><section className="surface-card max-w-2xl p-6"><div className="section-heading"><div className="setting-icon"><UserRound size={17} /></div><div><h2>Профиль</h2><p>Подтверждённые данные текущей заявки.</p></div></div><dl className="mt-6 space-y-4 text-sm"><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">Сотрудник</dt><dd className="text-right font-semibold">{request.displayName}</dd></div><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">E-mail</dt><dd className="text-right font-semibold">{request.email}</dd></div><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">Роль</dt><dd className="text-right font-semibold text-foreground">{roleLabels[role]}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Подразделение</dt><dd className="text-right font-semibold">{request.department}</dd></div></dl></section></div>;
}

function Workspace({ role, actualRole, demoRole, request, section, onDemoRoleChange }: {
  role: AppRole;
  actualRole: AppRole;
  demoRole: AppRole | null;
  request: RoleRequest;
  section: WorkspaceSection;
  onDemoRoleChange: (role: AppRole | null) => void;
}) {
  return <>
    {section === "cabinet" && <Cabinet role={role} actualRole={actualRole} demoRole={demoRole} onDemoRoleChange={onDemoRoleChange} />}
    {section === "agro" && <AgroWorkspace role={role} demo={Boolean(demoRole)} />}
    {section === "reports" && <ReportsWorkspace role={role} />}
    {section === "engineering" && <EngineeringWorkspace role={role} demoActive={Boolean(demoRole)} />}
    {section === "economic" && <FinanceBlock role={role} actualRole={actualRole} demoRole={demoRole} />}
    {section === "employees" && <EmployeeDirectory canManage={["general_director", "chief_agronomist", "chief_engineer", "dispatcher"].includes(role) && !demoRole} />}
    {section === "hr" && (role === "hr" || role === "general_director") && <HRWorkspace demoActive={Boolean(demoRole)} onExitDemo={() => onDemoRoleChange(null)} />}
    {section === "settings" && <SettingsPage role={role} request={request} />}
  </>;
}

function AccessGate() {
  const requestQuery = useGetMyRoleRequest({ query: { queryKey: getGetMyRoleRequestQueryKey(), refetchInterval: 12000 } });
  const [demoRole, setDemoRole] = useState<AppRole | null>(null);
  const [section, setSection] = useState<WorkspaceSection>("cabinet");
  useEffect(() => {
    window.localStorage.removeItem("agrolink-role-context");
  }, []);
  const request = (requestQuery.data as RoleRequest | null | undefined) ?? null;
  useEffect(() => {
    if (request?.status === "approved" && request.requestedRole === "dispatcher") setSection("agro");
    if (request?.status === "approved" && request.requestedRole === "motor_pool_manager") setSection("engineering");
    if (request?.status === "approved" && request.requestedRole === "hr") setSection("hr");
    if (request?.status === "approved" && request.requestedRole === "economist") setSection("economic");
  }, [request?.requestedRole, request?.status]);
  if (requestQuery.isLoading) return <main className="access-page app-backdrop" style={backdropStyle}><LoadingRows count={2} /></main>;
  if (requestQuery.isError) return <main className="access-page app-backdrop" style={backdropStyle}><ErrorState onRetry={() => requestQuery.refetch()} /></main>;
  if (request?.status !== "approved" || !isAppRole(request.requestedRole)) return <RoleRequestScreen request={request && request.status === "approved" ? { ...request, status: "rejected", reviewComment: "Ваша прежняя роль больше не используется. Выберите актуальную роль и отправьте заявку повторно." } : request} />;
  const actualRole = request.requestedRole;
  const canUseDemo = actualRole === "general_director";
  const role = canUseDemo && demoRole ? demoRole : actualRole;
  const changeDemoRole = (nextRole: AppRole | null) => {
    setDemoRole(nextRole);
    setSection(nextRole === "dispatcher" ? "agro" : nextRole === "motor_pool_manager" ? "engineering" : nextRole === "hr" ? "hr" : nextRole === "economist" ? "economic" : "cabinet");
    if (nextRole) window.localStorage.setItem("agrolink-role-context", nextRole);
    else window.localStorage.removeItem("agrolink-role-context");
    queryClient.clear();
  };
  return <Shell role={role} request={request} activeSection={section} onNavigate={setSection}><Workspace role={role} actualRole={actualRole} demoRole={canUseDemo ? demoRole : null} request={request} section={section} onDemoRoleChange={changeDemoRole} /></Shell>;
}

function Home() {
  return <><Show when="signed-in"><AccessGate /></Show><Show when="signed-out"><PublicLanding /></Show></>;
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const theme = useTheme();
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearanceFor(theme)} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
      <QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><Switch><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route component={Home} /></Switch></ErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  if (!clerkPubKey) throw new Error("Не настроен ключ авторизации");
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
