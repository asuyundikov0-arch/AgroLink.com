import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileSpreadsheet,
  LogOut,
  Menu,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  X,
  RotateCcw,
  Search,
  Scale,
  Settings as SettingsIcon,
  Download,
  Upload as UploadIcon,
  Sprout,
  Wrench,
} from "lucide-react";
import {
  type Report,
  type ArchiveCell,
  type RoleRequest,
  type Activity,
  type DashboardSummary,
  type Template,
  type TemplateInput,
  getGetMyRoleRequestQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetTemplateQueryKey,
  getListArchivesQueryKey,
  getListReportsQueryKey,
  getListRoleRequestsQueryKey,
  getListUsersQueryKey,
  getListTemplatesQueryKey,
  useCreateReport,
  useCreateRoleRequest,
  useCreateTemplate,
  useDeleteReport,
  useDeleteTemplate,
  useGetDashboardSummary,
  useGetTemplate,
  useGetMyRoleRequest,
  useListActivity,
  useListArchives,
  useListReports,
  useListRoleRequests,
  useListUsers,
  useListTemplates,
  useDeleteUser,
  useReviewRoleRequest,
  useUpdateReportStatus,
  useRequestReportUploadUrl,
} from "@workspace/api-client-react";
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import EngineeringWorkspace from "@/components/engineering/EngineeringWorkspace";
import AgroWorkspace from "@/components/agro/AgroWorkspace";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import companyEmblem from "@assets/IMG_0731_1787404427367.jpeg";
import "./index.css";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const departments = ["АПК Арыстан Grain", "АФ Веденовка", "Агрономия", "Инженерная служба", "Финансовый отдел", "Юридический отдел", "Управление"];
const archiveOptions = {
  agronomical: {
    label: "Агрономический",
    subarchives: [
      { key: "seeding_reports", label: "Отчёты о посеве" },
      { key: "chemistry_reports", label: "Отчёт по химии" },
      { key: "harvesting_reports", label: "Отчёт по уборке" },
      { key: "crop_rotations", label: "Севобороты" },
      { key: "tech_maps", label: "Техкарты" },
    ],
  },
  engineering: { label: "Инженерский", subarchives: [{ key: "general", label: "Общие документы" }] },
  economic: { label: "Экономический", subarchives: [{ key: "general", label: "Общие документы" }] },
  accounting: { label: "Бухгалтерский", subarchives: [{ key: "general", label: "Общие документы" }] },
  legal: { label: "Юридический", subarchives: [{ key: "general", label: "Общие документы" }] },
} as const;
type ArchiveSectionKey = keyof typeof archiveOptions;
type ArchiveSubarchiveKey = (typeof archiveOptions)[ArchiveSectionKey]["subarchives"][number]["key"];
const roleLabels = {
  agronomist: "Агроном",
  chief_agronomist: "Главный агроном",
  economist: "Экономист",
  farm_director: "Директор хозяйства",
  general_director: "Генеральный директор",
  engineer: "Инженер",
  chief_engineer: "Главный инженер",
  lawyer: "Юрист",
} as const;
type AppRole = keyof typeof roleLabels;

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: companyEmblem,
  },
  variables: {
    colorPrimary: "#243649",
    colorForeground: "#293744",
    colorMutedForeground: "#71808a",
    colorBackground: "#fffdf8",
    colorInput: "#ffffff",
    colorInputForeground: "#293744",
    colorDanger: "#d54a43",
    colorNeutral: "#ded8cc",
    fontFamily: "DM Sans, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-[440px] max-w-full overflow-hidden rounded-2xl bg-[#fffdf8] shadow-xl",
    card: "!border-0 !bg-transparent !shadow-none",
    footer: "!border-0 !bg-transparent !shadow-none",
    headerTitle: "text-slate-800",
    headerSubtitle: "text-slate-500",
    socialButtonsBlockButtonText: "text-slate-700",
    formFieldLabel: "text-slate-700",
    footerActionLink: "text-[#0b679e]",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-[#0b679e]",
    formFieldSuccessText: "text-[#0b679e]",
    alertText: "text-slate-700",
    logoBox: "pb-2",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border-stone-200 bg-white",
    formButtonPrimary: "bg-slate-800 hover:bg-slate-700",
    formFieldInput: "border-stone-200 bg-white",
    footerAction: "border-stone-200",
    dividerLine: "bg-stone-200",
    alert: "border-stone-200 bg-stone-50",
    otpCodeFieldInput: "border-stone-200",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

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
  return <img src={companyEmblem} alt="Agrolink" className={cn("brand-emblem", size === "lg" ? "brand-emblem-lg" : "brand-emblem-md")} />;
}

type WorkspaceSection = "cabinet" | "templates" | "archive" | "agro" | "engineering" | "economic" | "legal" | "settings";

type SidebarSection = Exclude<WorkspaceSection, "templates">;

function FileBadge() {
  return <div className="file-badge"><FileSpreadsheet size={19} strokeWidth={1.8} /><span>XLSX</span></div>;
}

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
    <main className="auth-landing">
      <div className="auth-landing-grid" aria-hidden="true" />
      <section className="auth-landing-card">
        <div className="landing-brand"><BrandEmblem size="lg" /><div><p className="landing-brand-name">AGROLINK</p><p className="landing-brand-caption">Корпоративная база документов</p></div></div>
        <p className="eyebrow mt-7">Единая база шаблонов</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.05em] text-foreground">Рабочие документы.<br /><span className="text-[#0b679e]">Понятные роли.</span></h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Каждый сотрудник выбирает роль при регистрации. Доступ к отчётам открывается только после согласования руководителем.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`${basePath}/sign-in`} className="button button-primary">Войти <UserRound size={16} /></a>
          <a href={`${basePath}/sign-up`} className="button button-secondary">Зарегистрироваться</a>
        </div>
      </section>
      <aside className="auth-landing-aside">
        <ShieldCheck size={28} className="text-[#0b679e]" />
        <h2 className="mt-5 font-display text-2xl font-bold tracking-[-0.04em]">Доступ под контролем</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">После регистрации заявка попадает в очередь руководителя. До согласования действия по рабочим ролям недоступны.</p>
      </aside>
    </main>
  );
}

const demoRoleScenarios: Record<AppRole, { workspace: string; title: string; description: string; document: string; action: string; result: string }> = {
  agronomist: { workspace: "АгроБлок", title: "Отчёт агронома", description: "Заполните форму и направьте отчёт главному агроному.", document: "Сводка по уборке · АПК Арыстан Grain", action: "Отправить на проверку", result: "Демо: отчёт направлен главному агроному." },
  chief_agronomist: { workspace: "Личный кабинет", title: "Очередь главного агронома", description: "Проверьте поступивший отчёт и направьте его дальше.", document: "Сводка по уборке · АПК Арыстан Grain", action: "Принять документ", result: "Демо: отчёт принят и готов к следующему этапу." },
  economist: { workspace: "Личный кабинет", title: "Ежедневный реестр", description: "Подайте финансовый реестр директору хозяйства.", document: "Реестр финансирования · АФ Веденовка", action: "Отправить директору", result: "Демо: реестр направлен директору хозяйства." },
  farm_director: { workspace: "Личный кабинет", title: "Очередь директора хозяйства", description: "Согласуйте финансовый реестр и направьте его генеральному директору.", document: "Реестр финансирования · АФ Веденовка", action: "Направить генеральному директору", result: "Демо: реестр направлен на финальное согласование." },
  general_director: { workspace: "Личный кабинет", title: "Финальное согласование", description: "Утвердите документ и разместите его в соответствующем архиве.", document: "Акт технического осмотра · Инженерная служба", action: "Одобрить и в архив", result: "Демо: документ утверждён и помещён в инженерский архив." },
  engineer: { workspace: "Инженерный блок", title: "Отправка инженерного документа", description: "Откройте шаблон, подготовьте Excel или PDF и передайте его главному инженеру.", document: "Акт технического осмотра · Инженерная служба", action: "Отправить главному инженеру", result: "Демо: инженерный документ направлен главному инженеру." },
  chief_engineer: { workspace: "Личный кабинет", title: "Очередь главного инженера", description: "Проверьте инженерный документ, верните его на доработку или направьте генеральному директору.", document: "Акт технического осмотра · Инженерная служба", action: "Принять и направить директору", result: "Демо: документ согласован главным инженером и направлен генеральному директору." },
  lawyer: { workspace: "Юридический блок", title: "Отправка юридического документа", description: "Подготовьте документ и направьте его на финальное согласование генеральному директору.", document: "Юридическое заключение · Юридический отдел", action: "Отправить генеральному директору", result: "Демо: юридический документ направлен генеральному директору." },
};

function PublicDemo() {
  const [role, setRole] = useState<AppRole>("engineer");
  const [message, setMessage] = useState("");
  const scenario = demoRoleScenarios[role];
  return <main className="min-h-screen bg-background px-4 py-6 sm:px-7 sm:py-10">
    <div className="mx-auto max-w-5xl">
      <div className="mb-7 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><BrandEmblem /><div><p className="landing-brand-name">AGROLINK</p><p className="text-xs text-muted-foreground">Интерактивная демо-версия</p></div></div><a href={basePath || "/"} className="button button-secondary text-xs"><ArrowLeft size={14} />К стартовой странице</a></div>
      <section className="surface-card mb-6 border-l-[4px] border-l-amber-400 p-5 sm:p-7"><p className="eyebrow">Без регистрации и доступа к данным</p><h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.05em]">Посмотрите работу каждой роли</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Это безопасная учебная копия интерфейса. Все действия работают только внутри этого экрана и не создают пользователей, документы или заявки.</p><label className="form-label mt-6 block max-w-sm">Роль для демонстрации<select className="text-input mt-2" value={role} onChange={(event) => { setRole(event.target.value as AppRole); setMessage(""); }} data-testid="select-public-demo-role">{(Object.keys(roleLabels) as AppRole[]).map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></label></section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]"><section className="surface-card overflow-hidden"><div className="border-b border-border bg-muted/25 px-5 py-5 sm:px-7"><p className="eyebrow">{scenario.workspace}</p><h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.045em]">{scenario.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{scenario.description}</p></div><div className="p-5 sm:p-7"><article className="rounded-xl border border-border bg-card p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-3"><FileBadge /><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{scenario.document}</h3><span className="meta-chip">Демо-документ</span></div><p className="mt-1 text-xs text-muted-foreground">Excel/PDF · маршрут согласования показан на примере</p></div></div><button type="button" className="button button-primary shrink-0 text-xs" onClick={() => setMessage(scenario.result)} data-testid="button-run-demo-action"><Check size={14} />{scenario.action}</button></div></article>{message && <div className="notice-banner mt-5"><Check size={16} />{message}<button type="button" aria-label="Закрыть" onClick={() => setMessage("")}><X size={14} /></button></div>}</div></section>
        <aside className="surface-card p-5 sm:p-6"><div className="section-heading"><div className="setting-icon"><Users size={17} /></div><div><h2>Маршрут роли</h2><p>Без настоящих прав доступа.</p></div></div><ol className="mt-6 space-y-4 text-sm"><li className="flex gap-3"><span className="meta-chip">1</span><span>Выберите роль в списке.</span></li><li className="flex gap-3"><span className="meta-chip">2</span><span>Посмотрите доступный ей рабочий раздел.</span></li><li className="flex gap-3"><span className="meta-chip">3</span><span>Нажмите действие и увидите результат в демо-режиме.</span></li></ol><a href={`${basePath}/sign-up`} className="button button-secondary mt-7 w-full justify-center text-xs">Перейти к настоящей регистрации</a></aside>
      </div>
    </div>
  </main>;
}

function AuthBackButton() {
  return <a href={basePath || "/"} className="auth-back-button" data-testid="button-auth-back"><ArrowLeft size={16} />Назад</a>;
}

function SignInPage() {
  return <main className="auth-screen"><AuthBackButton /><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main>;
}

function SignUpPage() {
  return <main className="auth-screen"><AuthBackButton /><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main>;
}

function RoleRequestScreen({ request }: { request: RoleRequest | null }) {
  const { user } = useUser();
  const createRequest = useCreateRoleRequest();
  const [requestedRole, setRequestedRole] = useState<AppRole>(request?.requestedRole ?? "agronomist");
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
    <main className="access-page">
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
            ? `Ваша заявка на роль «${roleLabels[request.requestedRole as AppRole]}» передана руководителю. До решения рабочие функции недоступны.`
            : isRejected
              ? (request.reviewComment || "Руководитель отклонил заявку. Исправьте роль или подразделение и отправьте её повторно.")
              : `Здравствуйте, ${user?.firstName || "сотрудник"}. Укажите рабочую роль — руководитель подтвердит её перед открытием доступа.`}
        </p>
        {isPending && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-xs leading-5 text-amber-900"><strong>Уведомление отправлено.</strong> Экран автоматически проверяет результат согласования.</div>}
        {!isPending && (
          <form className="mt-7 grid gap-5 text-left" onSubmit={submit}>
            <label className="form-label">Запрашиваемая роль<span className="select-wrap mt-2"><select className="text-input appearance-none" value={requestedRole} onChange={(event) => setRequestedRole(event.target.value as AppRole)} data-testid="select-requested-role">{(Object.keys(roleLabels) as AppRole[]).map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}</select><ChevronDown size={15} /></span></label>
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
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{request.displayName}</h3><span className="meta-chip">{roleLabels[request.requestedRole as AppRole]}</span></div><p className="mt-1 text-xs text-muted-foreground">{request.email} · {request.department} · {formatDate(request.requestedAt)}</p></div>
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
  onNavigate: (section: SidebarSection) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [topNotice, setTopNotice] = useState("");
  const { signOut } = useClerk();
  const activeSidebarSection: SidebarSection = activeSection === "templates" ? "cabinet" : activeSection;
  const isEngineeringVisible = ["engineer", "chief_engineer", "general_director"].includes(role);
  const isEconomicVisible = ["economist", "farm_director", "general_director"].includes(role);
  const isLegalVisible = ["lawyer", "general_director"].includes(role);
  const navigation = [
    { id: "cabinet" as const, label: "Личный кабинет", icon: ClipboardCheck },
    { id: "archive" as const, label: "Архив", icon: Archive },
    { id: "agro" as const, label: "АгроБлок", icon: Sprout },
    ...(isEngineeringVisible ? [{ id: "engineering" as const, label: "Инженерный блок", icon: Wrench }] : []),
    ...(isEconomicVisible ? [{ id: "economic" as const, label: "Экономический блок", icon: BarChart3 }] : []),
    ...(isLegalVisible ? [{ id: "legal" as const, label: "Юридический блок", icon: Scale }] : []),
    { id: "settings" as const, label: "Настройки", icon: SettingsIcon },
  ];
  const navigateFromSidebar = (section: SidebarSection) => {
    onNavigate(section);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background text-foreground">
      <aside className={cn("fixed inset-y-0 left-0 z-30 w-[256px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0", mobileOpen ? "flex translate-x-0" : "hidden -translate-x-full md:flex")} data-testid="sidebar-navigation">
        <div className="mb-9 flex items-center gap-3 px-2"><BrandEmblem /><div><div className="font-display text-[15px] font-bold tracking-[-0.02em]">AGROLINK</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/55">Единая база шаблонов</div></div></div>
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
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-10"><button type="button" aria-label="Открыть меню" className="icon-button md:hidden" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="size-1.5 rounded-full bg-emerald-500" />Доступ подтверждён</div><div className="ml-auto flex items-center gap-3"><button type="button" className="icon-button" aria-label="Помощь" onClick={() => setTopNotice("По вопросам доступа обратитесь к руководителю, который согласовал вашу роль.")}><CircleHelp size={18} /></button><div className="avatar avatar-sm avatar-blue">{initials(request.displayName)}</div></div></header>
        {topNotice && <div className="mx-5 mt-4 md:mx-10"><div className="notice-banner max-w-xl"><CircleHelp size={16} /><span>{topNotice}</span><button type="button" aria-label="Закрыть" onClick={() => setTopNotice("")}><X size={14} /></button></div></div>}
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  );
}

const reportStatusLabels: Record<Report["status"], string> = {
  submitted: "Ожидает проверки",
  in_review: "На проверке",
  returned: "На доработке",
  approved: "Проверен",
  sent_to_management: "Отправлен начальству",
  archived: "В архиве",
};

function ReportStatusPill({ status }: { status: Report["status"] }) {
  const tone = status === "returned" ? "border-amber-200 bg-amber-50 text-amber-800" : status === "archived" ? "border-orange-200 bg-orange-50 text-orange-800" : status === "sent_to_management" ? "border-blue-200 bg-blue-50 text-blue-800" : status === "approved" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-border bg-muted text-muted-foreground";
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold", tone)}>{reportStatusLabels[status]}</span>;
}

function ArchiveSelectionDialog({ report, onClose, onConfirm, isPending }: {
  report: Report;
  onClose: () => void;
  onConfirm: (section: ArchiveSectionKey, subarchive: ArchiveSubarchiveKey) => void;
  isPending: boolean;
}) {
  const engineeringReport = report.reportType === "engineering_document";
  const [section, setSection] = useState<ArchiveSectionKey>(engineeringReport ? "engineering" : "agronomical");
  const [subarchive, setSubarchive] = useState<ArchiveSubarchiveKey>(engineeringReport ? "general" : "seeding_reports");
  const options = archiveOptions[section].subarchives;
  const sections = engineeringReport ? ["engineering"] as ArchiveSectionKey[] : Object.keys(archiveOptions) as ArchiveSectionKey[];
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title">
    <section className="surface-card w-full max-w-lg p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Финальное согласование</p><h2 id="archive-dialog-title" className="mt-2 font-display text-2xl font-bold tracking-[-0.04em]">Отправить в архив</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Выберите ячейку для документа «{report.title}». После подтверждения файл будет доступен в утверждённом архиве.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть окно" disabled={isPending}><X size={18} /></button></div>
      <div className="mt-6 grid gap-5">
        <label className="form-label">Основной архив
          <select className="text-input mt-2" value={section} onChange={(event) => {
            const nextSection = event.target.value as ArchiveSectionKey;
            setSection(nextSection);
            setSubarchive(archiveOptions[nextSection].subarchives[0].key as ArchiveSubarchiveKey);
          }} data-testid="select-archive-section">
            {sections.map((key) => <option value={key} key={key}>{archiveOptions[key].label}</option>)}
          </select>
        </label>
        <label className="form-label">Подархив
          <select className="text-input mt-2" value={subarchive} onChange={(event) => setSubarchive(event.target.value as ArchiveSubarchiveKey)} data-testid="select-archive-subarchive">
            {options.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-7 flex flex-wrap justify-end gap-3"><button type="button" className="button button-secondary" onClick={onClose} disabled={isPending}>Отмена</button><button type="button" className="button button-primary" onClick={() => onConfirm(section, subarchive)} disabled={isPending} data-testid="button-confirm-archive">{isPending ? "Архивируем..." : "Одобрить и отправить"} <Archive size={15} /></button></div>
    </section>
  </div>;
}

function UserManagement({ role }: { role: AppRole }) {
  const usersQuery = useListUsers({ query: { enabled: role === "general_director", queryKey: getListUsersQueryKey() } });
  const deleteUser = useDeleteUser();
  const [notice, setNotice] = useState("");
  const users = (usersQuery.data as RoleRequest[] | undefined) ?? [];
  if (role !== "general_director") return null;

  const remove = (user: RoleRequest) => {
    const confirmed = window.confirm(`Удалить сотрудника «${user.displayName}» из списка? Доступ к базе будет отозван сразу, а ранее согласованные документы останутся в архиве.`);
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
    <div className="flex flex-col justify-between gap-3 border-b border-border bg-muted/25 px-5 py-5 sm:flex-row sm:items-center"><div><p className="eyebrow">Управление доступом</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Сотрудники</h2><p className="mt-1 text-sm text-muted-foreground">Подтверждённые пользователи корпоративной базы.</p></div><span className="meta-chip">{usersQuery.isLoading ? "Загрузка" : `${users.length} сотрудников`}</span></div>
    {notice && <div className="mx-5 mt-5 notice-banner"><Check size={16} />{notice}<button type="button" aria-label="Закрыть" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {usersQuery.isLoading ? <div className="p-5"><LoadingRows count={3} /></div> : usersQuery.isError ? <ErrorState onRetry={() => usersQuery.refetch()} /> : users.length === 0 ? <EmptyState title="Список сотрудников пуст" description="Подтверждённые роли появятся здесь." /> : <div className="divide-y divide-border/70">{users.map((user) => <article key={user.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{user.displayName}</h3><span className="meta-chip">{roleLabels[user.requestedRole as AppRole]}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{user.email} · {user.department}</p></div><button type="button" className="button button-danger shrink-0 text-xs" disabled={deleteUser.isPending} onClick={() => remove(user)} data-testid={`button-remove-user-${user.id}`}><X size={14} />{deleteUser.isPending ? "Удаляем..." : "Удалить"}</button></article>)}</div>}
  </section>;
}

function Cabinet({ role, actualRole, demoRole, onDemoRoleChange }: {
  role: AppRole;
  actualRole: AppRole;
  demoRole: AppRole | null;
  onDemoRoleChange: (role: AppRole | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [unit, setUnit] = useState("АПК Арыстан Grain");
  const [directorReportTitle, setDirectorReportTitle] = useState("");
  const [directorRecipientRole, setDirectorRecipientRole] = useState<"agronomist" | "engineer" | "economist" | "lawyer">("agronomist");
  const [directorFile, setDirectorFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Report | null>(null);
  const reportsQuery = useListReports(undefined, { query: { queryKey: getListReportsQueryKey() } });
  const templatesQuery = useListTemplates(undefined, { query: { queryKey: getListTemplatesQueryKey() } });
  const createReport = useCreateReport();
  const deleteReport = useDeleteReport();
  const updateReportStatus = useUpdateReportStatus();
  const requestUpload = useRequestReportUploadUrl();
  const [isUploading, setIsUploading] = useState(false);
  const allReports = (reportsQuery.data as Report[] | undefined) ?? [];
  const agronomistTemplates = ((templatesQuery.data as Template[] | undefined) ?? []).filter((template) => template.category === "Шаблоны Сводных отчетов Гл.Агронома");
  const finalApprover = role === "general_director";
  const reports = finalApprover ? allReports : allReports.filter((report) => role === "lawyer"
    ? report.reportType === "legal_document"
    : role === "chief_engineer"
    ? report.reportType === "engineering_document"
    : report.reportType !== "engineering_document");
  const canSubmit = role === "agronomist" || role === "economist" || role === "lawyer";
  const isEconomist = role === "economist";
  const isLawyer = role === "lawyer";
  const reviewer = role === "chief_agronomist" || role === "chief_engineer" || role === "farm_director";
  const directorRecipientOptions = [
    { role: "agronomist" as const, label: "Агрономический блок", unit: "Агрономический отдел" },
    { role: "engineer" as const, label: "Инженерный блок", unit: "Инженерная служба" },
    { role: "economist" as const, label: "Экономический блок", unit: "Экономический отдел" },
    { role: "lawyer" as const, label: "Юридический блок", unit: "Юридический отдел" },
  ];
  const queueTitle = role === "chief_agronomist" ? "Очередь главного агронома" : role === "chief_engineer" ? "Очередь главного инженера" : role === "farm_director" ? "Очередь директора хозяйства" : role === "lawyer" ? "Мои юридические документы" : finalApprover ? "Финальное согласование" : isEconomist ? "Ежедневные реестры" : "Отправленные отчёты";

  const refreshReports = () => queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setNotice("Сначала выберите заполненный файл.");
      return;
    }
    setIsUploading(true);
    setNotice("");
    try {
      const target = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } });
      const uploadResponse = await fetch(target.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!uploadResponse.ok) throw new Error("File upload failed");
      await createReport.mutateAsync({ data: {
         title: isLawyer ? "Юридическое заключение" : isEconomist ? `Реестр финансирования · ${unit}` : `Отчёт по уборке · ${unit}`,
         unit: isLawyer ? "Юридический отдел" : unit,
        fileName: file.name,
        fileSize: `${(file.size / 1024 / 1024).toFixed(1)} МБ`,
        fileUrl: target.objectPath,
      } });
      setFile(null);
       setNotice(isLawyer ? "Документ отправлен генеральному директору." : isEconomist ? "Реестр отправлен директору хозяйства." : "Отчёт отправлен главному агроному.");
      refreshReports();
    } catch (e) {
      setNotice("Не удалось отправить документ.");
    } finally {
      setIsUploading(false);
    }
  };
  const submitDirectorReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!directorReportTitle.trim()) {
      setNotice("Укажите название отчёта.");
      return;
    }
    if (!directorFile) {
      setNotice("Выберите Excel или PDF-файл.");
      return;
    }
    const recipient = directorRecipientOptions.find((item) => item.role === directorRecipientRole)!;
    setIsUploading(true);
    setNotice("");
    try {
      const target = await requestUpload.mutateAsync({ data: { name: directorFile.name, size: directorFile.size, contentType: directorFile.type || "application/octet-stream" } });
      const uploadResponse = await fetch(target.uploadURL, { method: "PUT", body: directorFile, headers: { "Content-Type": directorFile.type || "application/octet-stream" } });
      if (!uploadResponse.ok) throw new Error("File upload failed");
      await createReport.mutateAsync({ data: {
        title: directorReportTitle.trim(),
        unit: recipient.unit,
        fileName: directorFile.name,
        fileSize: `${(directorFile.size / 1024 / 1024).toFixed(1)} МБ`,
        fileUrl: target.objectPath,
        recipientRole: directorRecipientRole,
      } });
      setDirectorReportTitle("");
      setDirectorFile(null);
      setNotice(`Отчёт добавлен в личный кабинет: ${recipient.label}.`);
      refreshReports();
    } catch {
      setNotice("Не удалось добавить отчёт. Проверьте файл и повторите попытку.");
    } finally {
      setIsUploading(false);
    }
  };
  const removeReport = (report: Report) => {
    if (!window.confirm(`Удалить отчёт «${report.title}»? Это действие нельзя отменить.`)) return;
    deleteReport.mutate({ id: report.id }, {
      onSuccess: () => {
        setNotice("Отчёт удалён генеральным директором.");
        refreshReports();
        queryClient.invalidateQueries({ queryKey: getListArchivesQueryKey() });
      },
      onError: () => setNotice("Не удалось удалить отчёт."),
    });
  };
  const moveReport = (report: Report, status: "in_review" | "returned" | "approved" | "sent_to_management" | "archived", reviewerComment: string, archiveTarget?: { section: ArchiveSectionKey; subarchive: ArchiveSubarchiveKey }) => {
    updateReportStatus.mutate({ id: report.id, data: { status, reviewerComment, ...(archiveTarget ? { archiveSection: archiveTarget.section, archiveSubarchive: archiveTarget.subarchive } : {}) } }, { onSuccess: () => {
      setArchiveTarget(null);
      setNotice(status === "returned" ? "Документ возвращён на доработку." : status === "sent_to_management" ? "Документ отправлен начальству." : status === "archived" ? "Документ одобрен и отправлен в архив." : "Статус документа обновлён.");
      refreshReports();
      if (status === "archived") queryClient.invalidateQueries({ queryKey: getListArchivesQueryKey() });
    }, onError: () => setNotice("Не удалось изменить статус документа.") });
  };

  return (
    <div className="animate-page">
      <div className="mb-8"><p className="eyebrow">Согласование отчётов</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em] text-foreground sm:text-[34px]">Личный кабинет</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Ваша роль «{roleLabels[role]}» подтверждена. Доступные действия и документы определяются сервером.</p></div>
      {actualRole === "general_director" && <section className="surface-card mb-7 border-l-[4px] border-l-amber-400 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Демонстрационный режим</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Просмотр интерфейса по ролям</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Переключатель меняет только экран. Доступ к данным и любые действия от имени другой роли заблокированы.</p></div><label className="form-label min-w-60">Роль для просмотра<select className="text-input mt-2" value={demoRole ?? ""} onChange={(event) => onDemoRoleChange(event.target.value ? event.target.value as AppRole : null)} data-testid="select-demo-role"><option value="">Моя роль — генеральный директор</option>{(Object.keys(roleLabels) as AppRole[]).filter((item) => item !== "general_director").map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></label></div></section>}
      <ApprovalQueue role={role} isDemoPreview={Boolean(demoRole)} />
      {role === "chief_agronomist" && <section className="surface-card mb-7 overflow-hidden" data-testid="cell-chief-agronomist-templates"><div className="flex items-center justify-between border-b border-border bg-muted/25 px-5 py-5"><div><p className="eyebrow">Рабочая ячейка</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Шаблоны Сводных отчетов Гл.Агронома</h2><p className="mt-1 text-sm text-muted-foreground">Файлы для подготовки сводных отчётов главного агронома.</p></div><FileSpreadsheet size={20} className="text-muted-foreground" /></div>{templatesQuery.isLoading ? <div className="p-5"><LoadingRows count={1} /></div> : agronomistTemplates.length === 0 ? <div className="p-5"><EmptyState title="Шаблон пока не добавлен" description="Генеральный директор может добавить файл в агрономический блок." /></div> : <div>{agronomistTemplates.map((template) => <article key={template.id} className="flex items-center justify-between gap-4 p-5"><div><h3 className="text-sm font-bold">{template.name}</h3><p className="mt-1 text-xs text-muted-foreground">{template.fileName} · {template.fileSize}</p></div><a href={template.fileUrl} download={template.fileName} className="button button-primary text-xs"><Download size={14} />Скачать</a></article>)}</div>}</section>}
      <UserManagement role={role} />
       {notice && <div className="notice-banner mb-6" data-testid="status-report-notice"><Check size={16} />{notice}<button type="button" aria-label="Закрыть" onClick={() => setNotice("")}><X size={14} /></button></div>}
       {finalApprover && <section className="surface-card mb-7 border-l-[4px] border-l-teal-500 p-5 sm:p-7">
         <div className="section-heading"><div className="setting-icon"><UploadIcon size={17} /></div><div><h2>Добавить отчёт в кабинет специалиста</h2><p>Документ появится в личном кабинете выбранного специалиста и не будет отправлен на повторное согласование.</p></div></div>
         <form onSubmit={submitDirectorReport} className="mt-6 grid gap-5 lg:grid-cols-4 lg:items-end">
           <label className="form-label">Рабочий блок<select value={directorRecipientRole} onChange={(event) => setDirectorRecipientRole(event.target.value as typeof directorRecipientRole)} className="text-input mt-2" data-testid="select-director-report-recipient">{directorRecipientOptions.map((item) => <option value={item.role} key={item.role}>{item.label}</option>)}</select></label>
           <label className="form-label">Название отчёта<input value={directorReportTitle} onChange={(event) => setDirectorReportTitle(event.target.value)} className="text-input mt-2" placeholder="Например, План работ на неделю" data-testid="input-director-report-title" /></label>
           <label className="form-label">Excel или PDF<input type="file" accept=".pdf,.xlsx,.xls" onChange={(event) => setDirectorFile(event.target.files?.[0] ?? null)} className="text-input mt-2 pt-2" data-testid="input-director-report-file" /></label>
           <button type="submit" disabled={createReport.isPending || isUploading} className="button button-primary justify-center" data-testid="button-submit-director-report">{createReport.isPending || isUploading ? "Добавляем..." : "Добавить в кабинет"} <Send size={15} /></button>
         </form>
         {directorFile && <p className="mt-4 flex items-center gap-2 text-xs font-medium text-teal-800"><FileCheck2 size={15} />Выбран файл: {directorFile.name}</p>}
       </section>}
       {canSubmit && <section className="surface-card mb-7 p-5 sm:p-7"><div className="section-heading"><div className="setting-icon"><UploadIcon size={17} /></div><div><h2>{isLawyer ? "Направить документ на согласование" : isEconomist ? "Подать ежедневный реестр до 09:30" : "Передать заполненный отчёт"}</h2><p>{isLawyer ? "Юридический документ поступит напрямую генеральному директору." : isEconomist ? "Реестр сначала поступит директору хозяйства, затем генеральному директору." : "Отчёт поступит главному агроному на проверку."}</p></div></div><form onSubmit={submitReport} className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">{!isLawyer && <label className="form-label">Подразделение<select value={unit} onChange={(event) => setUnit(event.target.value)} className="text-input mt-2"><option>АПК Арыстан Grain</option><option>АФ Веденовка</option></select></label>}{isLawyer && <label className="form-label">Подразделение<input value="Юридический отдел" readOnly className="text-input mt-2" /></label>}<label className="form-label">{isLawyer ? "Юридический Excel или PDF" : isEconomist ? "Ежедневный реестр" : "Заполненный Excel-файл"}<input type="file" accept={isLawyer || isEconomist ? ".pdf,.xlsx,.xls" : ".xlsx,.xls"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-input mt-2 pt-2" data-testid={isLawyer ? "input-legal-document" : "input-completed-report"} /></label><button type="submit" disabled={createReport.isPending || isUploading} className="button button-primary justify-center" data-testid={isLawyer ? "button-submit-legal-document" : "button-submit-report"}>{createReport.isPending || isUploading ? "Отправляем..." : isLawyer ? "Отправить директору" : isEconomist ? "Отправить директору" : "Отправить на проверку"} <Send size={15} /></button></form>{file && <p className="mt-4 flex items-center gap-2 text-xs font-medium text-teal-800"><FileCheck2 size={15} />Выбран файл: {file.name}</p>}</section>}
       <section><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">{reviewer || finalApprover ? "Согласование" : "Мои документы"}</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">{queueTitle}</h2></div><ClipboardCheck size={19} className="text-muted-foreground" /></div>{reportsQuery.isLoading ? <LoadingRows count={3} /> : reportsQuery.isError ? <ErrorState onRetry={() => reportsQuery.refetch()} /> : reports.length === 0 ? <EmptyState title="Здесь пока нет документов" description="Когда документ перейдёт на доступный вам этап, он появится в списке." /> : <div className="space-y-3">{reports.map((report) => <article key={report.id} className="surface-card p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex min-w-0 items-start gap-3"><FileBadge /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{report.title}</h3><ReportStatusPill status={report.status} /></div><p className="mt-1 text-xs text-muted-foreground">{report.unit} · {report.fileName} · {report.submittedBy} · {formatDate(report.submittedAt)}</p>{report.recipientRole && <p className="mt-2 text-xs font-medium text-teal-800">Добавлен в кабинет: {roleLabels[report.recipientRole as AppRole]}</p>}{report.reviewerComment && <p className="mt-2 text-xs text-teal-800">Комментарий: {report.reviewerComment}</p>}</div></div><div className="flex shrink-0 flex-wrap gap-2">{report.fileUrl && <a href={report.fileUrl} download={report.fileName} className="button button-secondary text-xs"><Download size={14} />Открыть файл</a>}{reviewer && report.status === "submitted" && <button type="button" onClick={() => moveReport(report, "in_review", "Документ принят в работу.")} className="button button-primary text-xs">Взять на проверку</button>}{reviewer && report.status === "in_review" && <><button type="button" onClick={() => moveReport(report, "returned", "Проверьте данные и загрузите исправленную версию.")} className="button button-secondary text-xs"><RotateCcw size={14} />На доработку</button><button type="button" onClick={() => moveReport(report, "approved", "Документ проверен.")} className="button button-primary text-xs"><Check size={14} />Принять</button></>}{reviewer && report.status === "approved" && <button type="button" onClick={() => moveReport(report, "sent_to_management", "Документ направлен начальству.")} className="button button-primary text-xs"><Send size={14} />{role === "farm_director" ? "Генеральному директору" : "Отправить начальству"}</button>}{finalApprover && report.status === "sent_to_management" && <button type="button" onClick={() => setArchiveTarget(report)} className="button button-primary text-xs" data-testid={`button-archive-report-${report.id}`}><Archive size={14} />Одобрить и в архив</button>}{finalApprover && <button type="button" onClick={() => removeReport(report)} className="button button-danger text-xs" disabled={deleteReport.isPending} data-testid={`button-delete-report-${report.id}`}><X size={14} />Удалить</button>}</div></div></article>)}</div>}</section>
      {archiveTarget && <ArchiveSelectionDialog report={archiveTarget} onClose={() => setArchiveTarget(null)} isPending={updateReportStatus.isPending} onConfirm={(section, subarchive) => moveReport(archiveTarget, "archived", "Документ одобрен генеральным директором и помещён в архив.", { section, subarchive })} />}
    </div>
  );
}

const templateCategories = ["Финансы", "Продажи", "Кадры", "Маркетинг", "Операции", "Отчётность", "Персонал"];
const engineeringUnits = ["АПК Арыстан Grain", "АФ Веденовка"] as const;

function EngineeringBlock({ role, onOpenTemplate, isDemoPreview = false }: { role: AppRole; onOpenTemplate: (id: number) => void; isDemoPreview?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [unit, setUnit] = useState<(typeof engineeringUnits)[number]>(engineeringUnits[0]);
  const [notice, setNotice] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Report | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const reportsQuery = useListReports(undefined, { query: { queryKey: getListReportsQueryKey(), refetchInterval: 15000 } });
  const templatesQuery = useListTemplates(undefined, { query: { queryKey: getListTemplatesQueryKey() } });
  const requestUpload = useRequestReportUploadUrl();
  const createReport = useCreateReport();
  const updateReportStatus = useUpdateReportStatus();

  const allReports = (reportsQuery.data as Report[] | undefined) ?? [];
  const reports = allReports.filter(r => r.reportType === "engineering_document");
  
  const allTemplates = (templatesQuery.data as Template[] | undefined) ?? [];
  const templates = allTemplates.filter(t => t.accessGroup === "engineers");

  const canSubmit = role === "engineer";
  const reviewer = role === "chief_engineer";
  const finalApprover = role === "general_director";
  const queueTitle = reviewer ? "Очередь главного инженера" : finalApprover ? "Финальное согласование (Инженерия)" : "Мои документы";

  const refreshReports = () => queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { setNotice("Сначала выберите инженерный файл."); return; }
    setIsUploading(true);
    setNotice("");
    try {
      const target = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } });
      const uploadResponse = await fetch(target.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!uploadResponse.ok) throw new Error("File upload failed");
      await createReport.mutateAsync({ data: {
        title: `Инженерный документ · ${unit}`,
        unit,
        fileName: file.name,
        fileSize: `${(file.size / 1024 / 1024).toFixed(1)} МБ`,
        fileUrl: target.objectPath,
      } });
      setFile(null);
      setNotice("Документ отправлен главному инженеру.");
      refreshReports();
    } catch (e) {
      setNotice("Не удалось отправить документ.");
    } finally {
      setIsUploading(false);
    }
  };

  const moveReport = (report: Report, status: "in_review" | "returned" | "approved" | "sent_to_management" | "archived", reviewerComment: string, archiveTargetObj?: { section: ArchiveSectionKey; subarchive: ArchiveSubarchiveKey }) => {
    updateReportStatus.mutate({ id: report.id, data: { status, reviewerComment, ...(archiveTargetObj ? { archiveSection: archiveTargetObj.section, archiveSubarchive: archiveTargetObj.subarchive } : {}) } }, { onSuccess: () => {
      setArchiveTarget(null);
      setNotice(status === "returned" ? "Документ возвращён на доработку." : status === "sent_to_management" ? "Документ отправлен начальству." : status === "archived" ? "Документ одобрен и отправлен в архив." : "Статус документа обновлён.");
      refreshReports();
      if (status === "archived") queryClient.invalidateQueries({ queryKey: getListArchivesQueryKey() });
    }, onError: () => setNotice("Не удалось изменить статус документа.") });
  };

  return (
    <div className="animate-page">
      <div className="mb-8">
        <p className="eyebrow">Рабочее пространство</p>
        <h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em] text-foreground sm:text-[34px]">Инженерный блок</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Библиотека инженерных шаблонов и очередь согласования документов.</p>
      </div>

      {notice && <div className="notice-banner mb-6" data-testid="status-engineering-notice"><Check size={16} />{notice}<button type="button" aria-label="Закрыть" onClick={() => setNotice("")}><X size={14} /></button></div>}

      <section className="surface-card mb-7 p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold tracking-[-0.04em]">Библиотека шаблонов</h2>
          <span className="meta-chip">{templatesQuery.isLoading ? "Загрузка" : `${templates.length} файлов`}</span>
        </div>
        {templatesQuery.isLoading ? <LoadingRows count={2} /> : templatesQuery.isError ? <ErrorState onRetry={() => templatesQuery.refetch()} /> : templates.length === 0 ? <p className="text-sm text-muted-foreground">Нет доступных шаблонов для инженеров.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map(template => (
              <div key={template.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
                 <div className="flex items-start gap-3 min-w-0">
                    <FileBadge />
                    <div className="min-w-0 flex-1">
                       <h3 className="truncate text-sm font-bold">{template.name}</h3>
                       <p className="truncate mt-1 text-[11px] text-muted-foreground">{template.fileName} · {template.fileSize}</p>
                    </div>
                 </div>
                 <button type="button" className="button button-secondary text-xs w-full justify-center" onClick={() => onOpenTemplate(template.id)} data-testid={`button-open-eng-template-${template.id}`}>
                    Открыть <ChevronDown size={14} className="-rotate-90" />
                 </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {canSubmit && (
        <section className="surface-card mb-7 p-5 sm:p-7 border-l-[4px] border-l-[hsl(215_25%_27%)]">
          <div className="section-heading">
            <div className="setting-icon setting-icon-engineering">
              <UploadIcon size={17} />
            </div>
            <div>
              <h2>Отправить файл на подтверждение</h2>
              <p>Документ поступит главному инженеру на проверку и подтверждение.</p>
            </div>
          </div>
          <form onSubmit={submitReport} className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <label className="form-label">Подразделение
              <select value={unit} onChange={(event) => setUnit(event.target.value as (typeof engineeringUnits)[number])} className="text-input mt-2" data-testid="select-eng-unit">
                {engineeringUnits.map((engineeringUnit) => <option key={engineeringUnit}>{engineeringUnit}</option>)}
              </select>
            </label>
            <label className="form-label">Заполненный PDF/Excel-файл
              <input type="file" accept=".pdf,.xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-input mt-2 pt-2" data-testid="input-eng-file" />
            </label>
            <button type="submit" disabled={createReport.isPending || isUploading} className="button button-engineering justify-center" data-testid="button-submit-eng-report">
              {createReport.isPending || isUploading ? "Отправляем..." : "Отправить на подтверждение"} <Send size={15} />
            </button>
          </form>
          {file && <p className="mt-4 flex items-center gap-2 text-xs font-medium text-teal-800"><FileCheck2 size={15} />Выбран файл: {file.name}</p>}
        </section>
      )}

      {role !== "chief_engineer" && <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="eyebrow">{reviewer || finalApprover ? "Согласование" : "Мои документы"}</p>
            <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">{queueTitle}</h2>
          </div>
          <ClipboardCheck size={19} className="text-muted-foreground" />
        </div>
        {reportsQuery.isLoading ? <LoadingRows count={3} /> : reportsQuery.isError ? <ErrorState onRetry={() => reportsQuery.refetch()} /> : reports.length === 0 ? <EmptyState title="Здесь пока нет документов" description="Когда документ перейдёт на доступный вам этап, он появится в списке." /> : (
          <div className="space-y-3">
            {reports.map((report) => (
              <article key={report.id} className="surface-card p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <FileBadge />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-bold">{report.title}</h3>
                        <ReportStatusPill status={report.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{report.unit} · {report.fileName} · {report.submittedBy} · {formatDate(report.submittedAt)}</p>
                      {report.reviewerComment && <p className="mt-2 text-xs text-teal-800">Комментарий: {report.reviewerComment}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {report.fileUrl && <a href={report.fileUrl} download={report.fileName} className="button button-secondary text-xs"><Download size={14} />Открыть файл</a>}
                    {reviewer && report.status === "submitted" && <button type="button" onClick={() => moveReport(report, "in_review", "Документ принят в работу.")} className="button button-engineering text-xs" data-testid={`button-take-eng-report-${report.id}`}>Взять на проверку</button>}
                    {reviewer && report.status === "in_review" && (
                      <>
                        <button type="button" onClick={() => moveReport(report, "returned", "Проверьте данные и загрузите исправленную версию.")} className="button button-secondary text-xs" data-testid={`button-return-eng-report-${report.id}`}><RotateCcw size={14} />На доработку</button>
                        <button type="button" onClick={() => moveReport(report, "approved", "Инженерный документ проверен.")} className="button button-engineering text-xs" data-testid={`button-approve-eng-report-${report.id}`}><Check size={14} />Принять</button>
                      </>
                    )}
                    {reviewer && report.status === "approved" && <button type="button" onClick={() => moveReport(report, "sent_to_management", "Документ направлен генеральному директору.")} className="button button-engineering text-xs" data-testid={`button-send-eng-report-${report.id}`}><Send size={14} />Генеральному директору</button>}
                    {finalApprover && report.status === "sent_to_management" && <button type="button" onClick={() => setArchiveTarget(report)} className="button button-engineering text-xs" data-testid={`button-archive-eng-report-${report.id}`}><Archive size={14} />Одобрить и в архив</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>}
      {archiveTarget && <ArchiveSelectionDialog report={archiveTarget} onClose={() => setArchiveTarget(null)} isPending={updateReportStatus.isPending} onConfirm={(section, subarchive) => moveReport(archiveTarget, "archived", "Документ одобрен генеральным директором и помещён в архив.", { section, subarchive })} />}
    </div>
  );
}

function ArchivePage({ selectedCell, onSelectCell }: { selectedCell: ArchiveCell | null; onSelectCell: (cell: ArchiveCell | null) => void }) {
  const archivesQuery = useListArchives({ query: { queryKey: getListArchivesQueryKey() } });
  const reportParams = selectedCell ? { status: "archived" as const, archiveSection: selectedCell.section, archiveSubarchive: selectedCell.subarchive } : undefined;
  const archivedReportsQuery = useListReports(reportParams, { query: { enabled: Boolean(selectedCell), queryKey: getListReportsQueryKey(reportParams) } });
  const cells = (archivesQuery.data as ArchiveCell[] | undefined) ?? [];
  const reports = (archivedReportsQuery.data as Report[] | undefined) ?? [];
  const visibleSections = (Object.keys(archiveOptions) as ArchiveSectionKey[]).filter((section) => cells.some((cell) => cell.section === section));

  if (selectedCell) {
    return <div className="animate-page">
      <button type="button" onClick={() => onSelectCell(null)} className="button button-ghost -ml-3 mb-6 text-xs" data-testid="button-back-archive">← Ко всем архивам</button>
      <section className="surface-card overflow-hidden">
        <div className="border-b border-border bg-muted/25 px-5 py-5 sm:px-7"><p className="eyebrow">{selectedCell.sectionLabel}</p><h1 className="mt-2 font-display text-2xl font-bold tracking-[-0.04em]">{selectedCell.subarchiveLabel}</h1><p className="mt-2 text-sm text-muted-foreground">Одобренные генеральным директором документы в этой ячейке.</p></div>
        {archivedReportsQuery.isLoading ? <div className="p-5"><LoadingRows count={3} /></div> : archivedReportsQuery.isError ? <ErrorState onRetry={() => archivedReportsQuery.refetch()} /> : reports.length === 0 ? <EmptyState title="Архив пока пуст" description="Следующий финально согласованный документ появится в этой ячейке." /> : <div className="divide-y divide-border/70">{reports.map((report) => <article key={report.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-3"><FileBadge /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-bold">{report.title}</h2><ReportStatusPill status={report.status} /></div><p className="mt-1 text-xs text-muted-foreground">{report.unit} · {report.fileName} · отправил {report.submittedBy}</p><p className="mt-2 text-xs text-muted-foreground">В архиве с {report.archivedAt ? formatDate(report.archivedAt) : "—"} · согласовал {report.archivedBy || "генеральный директор"}</p></div></div><a href={report.fileUrl} download={report.fileName} className="button button-secondary shrink-0 text-xs"><Download size={14} />Скачать</a></article>)}</div>}
      </section>
    </div>;
  }

  return <div className="animate-page">
    <div className="mb-7"><p className="eyebrow">Утверждённые документы</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">Архив</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Документы попадают сюда только после финального согласования генеральным директором. Выберите ячейку, чтобы открыть её содержимое.</p></div>
    {archivesQuery.isLoading ? <LoadingRows count={5} /> : archivesQuery.isError ? <ErrorState onRetry={() => archivesQuery.refetch()} /> : <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{visibleSections.map((section) => {
      const config = archiveOptions[section];
      const sectionCells = cells.filter((cell) => cell.section === section);
      return <section className="surface-card overflow-hidden" key={section} data-testid={`archive-section-${section}`}>
        <div className="flex items-center gap-3 border-b border-border bg-muted/25 px-5 py-4"><div className="empty-icon h-9 w-9 rounded-lg"><Archive size={18} /></div><div><p className="eyebrow">Архив</p><h2 className="mt-1 font-display text-lg font-bold tracking-[-0.03em]">{config.label}</h2></div></div>
        <div className="divide-y divide-border/70">{config.subarchives.map((subarchive) => {
          const cell = sectionCells.find((item) => item.subarchive === subarchive.key);
           return <button type="button" key={subarchive.key} onClick={() => cell && onSelectCell(cell)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-sky-50" disabled={!cell} data-testid={`archive-cell-${section}-${subarchive.key}`}><span className="text-sm font-semibold">{subarchive.label}</span><span className="meta-chip">{cell?.documentCount ?? 0} файлов</span></button>;
        })}</div>
      </section>;
    })}</div>}
  </div>;
}

function TemplateRow({ template, compact = false, onOpen }: { template: Template; compact?: boolean; onOpen: (id: number) => void }) {
  return (
    <article className={cn("flex flex-col gap-4 border-b border-border/70 p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between", compact && "p-3")}>
      <div className="flex min-w-0 items-start gap-3"><FileBadge /><div className="min-w-0"><h3 className="truncate text-sm font-bold">{template.name}</h3><p className="mt-1 text-xs text-muted-foreground">{template.category} · {template.department} · {template.fileName} · {template.fileSize}</p><div className="mt-2 flex flex-wrap gap-2"><span className="meta-chip">{template.version}</span><span className="meta-chip">{formatDate(template.updatedAt)}</span></div></div></div>
      <button type="button" className="button button-secondary shrink-0 self-start text-xs sm:self-center" onClick={() => onOpen(template.id)} data-testid={`button-open-template-${template.id}`}>Открыть <ChevronDown size={14} className="-rotate-90" /></button>
    </article>
  );
}

function TemplateCatalog({ role, onOpen, onUpload }: { role: AppRole; onOpen: (id: number) => void; onUpload: () => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const templatesQuery = useListTemplates({ search: search || undefined, category: category || undefined }, { query: { queryKey: getListTemplatesQueryKey({ search: search || undefined, category: category || undefined }) } });
  const templates = (templatesQuery.data as Template[] | undefined) ?? [];
  return (
    <div className="animate-page">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Библиотека</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">Шаблоны документов</h1><p className="mt-2 text-sm text-muted-foreground">Скачивайте рабочие файлы в исходном формате и используйте их по назначению.</p></div>{role === "general_director" && <button type="button" className="button button-primary self-start text-xs sm:self-auto" onClick={onUpload} data-testid="button-open-template-upload"><UploadIcon size={15} /> Добавить шаблон</button>}</div>
      <section className="surface-card mb-5 p-4"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><label className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input className="text-input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию..." data-testid="input-template-search" /></label><label className="select-wrap"><select className="text-input appearance-none" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Все категории</option>{templateCategories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></label></div></section>
      <section className="surface-card overflow-hidden"><div className="flex items-center justify-between border-b border-border bg-muted/25 px-5 py-4"><h2 className="font-display text-base font-bold">Доступные шаблоны</h2><span className="meta-chip">{templatesQuery.isLoading ? "Загрузка" : `${templates.length} файлов`}</span></div>{templatesQuery.isLoading ? <div className="p-5"><LoadingRows count={4} /></div> : templatesQuery.isError ? <ErrorState onRetry={() => templatesQuery.refetch()} /> : templates.length === 0 ? <EmptyState title="Шаблоны не найдены" description="Измените запрос или категорию поиска." /> : <div>{templates.map((template) => <TemplateRow key={template.id} template={template} onOpen={onOpen} />)}</div>}</section>
    </div>
  );
}

function TemplateDetails({ id, role, onBack }: { id: number; role: AppRole; onBack: () => void }) {
  const templateQuery = useGetTemplate(id, { query: { enabled: Number.isFinite(id), queryKey: getGetTemplateQueryKey(id) } });
  const deleteTemplate = useDeleteTemplate();
  const template = templateQuery.data as Template | undefined;
  if (templateQuery.isLoading) return <LoadingRows count={3} />;
  if (templateQuery.isError || !template) return <ErrorState onRetry={() => templateQuery.refetch()} />;
  const remove = () => {
    if (window.confirm("Удалить этот шаблон из библиотеки?")) deleteTemplate.mutate({ id }, { onSuccess: onBack });
  };
  return <div className="animate-page"><button type="button" onClick={onBack} className="button button-ghost -ml-3 mb-6 text-xs" data-testid="button-back-templates">← Назад к шаблонам</button><section className="surface-card p-6 sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-start"><div className="file-badge file-badge-large"><FileSpreadsheet size={24} /><span>{template.fileType}</span></div><div className="min-w-0"><p className="eyebrow">{template.category}</p><h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.05em]">{template.name}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{template.description || "Рабочий шаблон общей библиотеки документов."}</p></div></div><div className="mt-8 grid gap-3 border-y border-border py-5 text-xs sm:grid-cols-3"><div><span className="text-muted-foreground">Подразделение</span><strong className="mt-1 block">{template.department}</strong></div><div><span className="text-muted-foreground">Версия</span><strong className="mt-1 block">{template.version}</strong></div><div><span className="text-muted-foreground">Обновлён</span><strong className="mt-1 block">{formatDate(template.updatedAt)}</strong></div></div><div className="mt-6 flex flex-wrap gap-3"><a href={template.fileUrl} download={template.fileName} className="button button-primary" data-testid="button-download-template"><Download size={15} /> Скачать {template.fileType}</a>{role === "general_director" && <button type="button" className="button button-danger" onClick={remove} disabled={deleteTemplate.isPending} data-testid="button-delete-template"><X size={15} /> {deleteTemplate.isPending ? "Удаляем..." : "Удалить"}</button>}</div></section></div>;
}

function TemplateUpload({ onSaved, onCancel }: { onSaved: (id: number) => void; onCancel: () => void }) {
  const createTemplate = useCreateTemplate();
  const requestUpload = useRequestReportUploadUrl();
  const [form, setForm] = useState<TemplateInput>({ name: "", description: "", category: "Отчётность", department: "Агрономия", fileName: "", fileSize: "", fileType: "xlsx", accessGroup: "all", fileUrl: "" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const update = (field: keyof TemplateInput, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedFile = file ?? document.querySelector<HTMLInputElement>('[data-testid="input-template-file"]')?.files?.[0] ?? null;
    if (!form.name || !selectedFile) { setError("Укажите название и выберите файл."); return; }
    setError("");
    try {
      const target = await requestUpload.mutateAsync({ data: { name: selectedFile.name, size: selectedFile.size, contentType: selectedFile.type || "application/octet-stream" } });
      const uploadResponse = await fetch(target.uploadURL, { method: "PUT", body: selectedFile, headers: { "Content-Type": selectedFile.type || "application/octet-stream" } });
      if (!uploadResponse.ok) throw new Error("File upload failed");
      const template = await createTemplate.mutateAsync({ data: { ...form, fileUrl: target.objectPath, fileSize: form.fileSize || "Не указан" } });
      onSaved(template.id);
    } catch {
      setError("Не удалось загрузить и сохранить шаблон.");
    }
  };
  return <div className="animate-page"><button type="button" onClick={onCancel} className="button button-ghost -ml-3 mb-6 text-xs">← Назад к шаблонам</button><section className="surface-card max-w-2xl p-6 sm:p-8"><p className="eyebrow">Библиотека</p><h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.05em]">Добавить шаблон</h1><p className="mt-2 text-sm text-muted-foreground">Исходный файл будет доступен сотрудникам с подтверждённой ролью.</p><form onSubmit={submit} className="mt-7 grid gap-5"><label className="form-label">Название<input className="text-input mt-2" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Например, Сводка по уборке" /></label><label className="form-label">Описание<textarea className="text-input mt-2 min-h-24 resize-y" value={form.description} onChange={(event) => update("description", event.target.value)} /></label><div className="grid gap-5 sm:grid-cols-3"><label className="form-label">Группа доступа<select className="text-input mt-2" value={form.accessGroup} onChange={(event) => update("accessGroup", event.target.value)}><option value="all">Все роли</option><option value="agronomists">Агрономы</option><option value="engineers">Инженеры</option></select></label><label className="form-label">Категория<select className="text-input mt-2" value={form.category} onChange={(event) => update("category", event.target.value)}>{templateCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="form-label">Подразделение<select className="text-input mt-2" value={form.department} onChange={(event) => update("department", event.target.value)}><option>Агрономия</option><option>Финансовый отдел</option><option>АФ Веденовка</option><option>АПК Арыстан Grain</option></select></label></div><label className="form-label">Файл<input className="text-input mt-2 pt-2" type="file" accept=".xlsx,.xls,.pdf" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) setForm((current) => ({ ...current, fileName: selected.name, fileSize: `${(selected.size / 1024).toFixed(0)} КБ`, fileType: selected.name.toLowerCase().endsWith(".pdf") ? "pdf" : "xlsx" })); }} data-testid="input-template-file" /></label>{error && <p className="text-xs font-medium text-destructive">{error}</p>}<div className="flex flex-wrap justify-end gap-3 pt-2"><button type="button" className="button button-secondary" onClick={onCancel}>Отмена</button><button type="submit" className="button button-primary" disabled={createTemplate.isPending} data-testid="button-save-template">{createTemplate.isPending ? "Сохраняем..." : "Сохранить шаблон"} <Check size={15} /></button></div></form></section></div>;
}

function AgroBlock({ onOpen }: { onOpen: (id: number) => void }) {
  const templatesQuery = useListTemplates(undefined, { query: { queryKey: getListTemplatesQueryKey() } });
  const templates = (templatesQuery.data as Template[] | undefined) ?? [];
  const units = [{ name: "АПК Арыстан Grain", color: "bg-accent", hint: "Отчёты по уборке и производственным показателям" }, { name: "АФ Веденовка", color: "bg-teal-400", hint: "Финансовые реестры и отчётность подразделения" }];
  return <div className="animate-page"><div className="mb-7"><p className="eyebrow">Специализированный раздел</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">АгроБлок</h1><p className="mt-2 text-sm text-muted-foreground">Шаблоны АПК Арыстан Grain и АФ Веденовка.</p></div><div className="grid gap-5 lg:grid-cols-2">{units.map((unit) => { const unitTemplates = templates.filter((item) => item.department === unit.name || item.name.includes(unit.name.includes("Арыстан") ? "Арыстан" : "Веденовка")); return <section className="surface-card overflow-hidden" key={unit.name}><div className={cn("h-2", unit.color)} /><div className="p-6"><p className="eyebrow">Подразделение</p><h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.04em]">{unit.name}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{unit.hint}</p>{unitTemplates.length ? <div className="mt-6">{unitTemplates.map((template) => <TemplateRow key={template.id} template={template} compact onOpen={onOpen} />)}</div> : <p className="mt-6 text-xs text-muted-foreground">Шаблоны пока не добавлены.</p>}</div></section>; })}</div></div>;
}

function EconomicBlock({ role, actualRole, demoRole, onDemoRoleChange }: {
  role: AppRole;
  actualRole: AppRole;
  demoRole: AppRole | null;
  onDemoRoleChange: (role: AppRole | null) => void;
}) {
  return <div className="animate-page">
    <div className="mb-7"><p className="eyebrow">Специализированный раздел</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">Экономический блок</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Ежедневные реестры, согласование через директора хозяйства и экономический архив.</p></div>
    <Cabinet role={role} actualRole={actualRole} demoRole={demoRole} onDemoRoleChange={onDemoRoleChange} />
  </div>;
}

function LegalBlock({ role, actualRole, demoRole, onDemoRoleChange }: {
  role: AppRole;
  actualRole: AppRole;
  demoRole: AppRole | null;
  onDemoRoleChange: (role: AppRole | null) => void;
}) {
  return <div className="animate-page">
    <div className="mb-7"><p className="eyebrow">Специализированный раздел</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">Юридический блок</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Юридические заключения и документы, направляемые напрямую генеральному директору.</p></div>
    <Cabinet role={role} actualRole={actualRole} demoRole={demoRole} onDemoRoleChange={onDemoRoleChange} />
  </div>;
}

function EngineeringBlockDraft({ role, onOpen }: { role: AppRole; onOpen: (id: number) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Report | null>(null);
  const templatesQuery = useListTemplates(undefined, { query: { queryKey: getListTemplatesQueryKey() } });
  const reportsQuery = useListReports(undefined, { query: { queryKey: getListReportsQueryKey() } });
  const requestUpload = useRequestReportUploadUrl();
  const createReport = useCreateReport();
  const updateReportStatus = useUpdateReportStatus();
  const allTemplates = (templatesQuery.data as Template[] | undefined) ?? [];
  const templates = allTemplates.filter((template) => template.accessGroup === "engineers");
  const allReports = (reportsQuery.data as Report[] | undefined) ?? [];
  const reports = allReports.filter((report) => report.reportType === "engineering_document");
  const canSubmit = role === "engineer";
  const reviewer = role === "chief_engineer";
  const finalApprover = role === "general_director";
  const queueTitle = reviewer ? "Очередь главного инженера" : finalApprover ? "Финальное согласование" : "Мои инженерные документы";

  const refreshReports = () => queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
  const submitDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setNotice("Сначала выберите Excel или PDF-документ.");
      return;
    }
    if (!title.trim()) {
      setNotice("Укажите название документа.");
      return;
    }
    setNotice("");
    try {
      const target = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } });
      const uploadResponse = await fetch(target.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("File upload failed");
      await createReport.mutateAsync({ data: {
        title: title.trim(),
        unit: "Инженерная служба",
        fileName: file.name,
        fileSize: `${(file.size / 1024 / 1024).toFixed(1)} МБ`,
        fileUrl: target.objectPath,
      } });
      setTitle("");
      setFile(null);
      setNotice("Документ отправлен главному инженеру на согласование.");
      refreshReports();
    } catch {
      setNotice("Не удалось загрузить и отправить документ. Повторите попытку.");
    }
  };
  const moveReport = (report: Report, status: "in_review" | "returned" | "approved" | "sent_to_management" | "archived", reviewerComment: string, archiveTarget?: { section: ArchiveSectionKey; subarchive: ArchiveSubarchiveKey }) => {
    updateReportStatus.mutate({ id: report.id, data: { status, reviewerComment, ...(archiveTarget ? { archiveSection: archiveTarget.section, archiveSubarchive: archiveTarget.subarchive } : {}) } }, {
      onSuccess: () => {
        setArchiveTarget(null);
        setNotice(status === "returned" ? "Документ возвращён инженеру на доработку." : status === "sent_to_management" ? "Документ направлен генеральному директору." : status === "archived" ? "Документ одобрен и помещён в инженерский архив." : "Статус документа обновлён.");
        refreshReports();
        if (status === "archived") queryClient.invalidateQueries({ queryKey: getListArchivesQueryKey() });
      },
      onError: () => setNotice("Не удалось изменить статус документа."),
    });
  };

  return <div className="animate-page">
    <div className="mb-7"><p className="eyebrow">Специализированный раздел</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">Инженерный блок</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Шаблоны, технические документы и маршрут согласования: инженер → главный инженер → генеральный директор.</p></div>
    {notice && <div className="notice-banner mb-6"><Check size={16} />{notice}<button type="button" aria-label="Закрыть" onClick={() => setNotice("")}><X size={14} /></button></div>}
    <section className="surface-card mb-7 overflow-hidden"><div className="flex items-center gap-3 border-b border-border bg-muted/25 px-5 py-5"><div className="setting-icon"><FileSpreadsheet size={17} /></div><div><p className="eyebrow">Рабочая ячейка</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">Шаблоны</h2><p className="mt-1 text-sm text-muted-foreground">Исходные инженерные Excel и PDF-файлы, доступные вашей роли.</p></div></div>{templatesQuery.isLoading ? <div className="p-5"><LoadingRows count={2} /></div> : templatesQuery.isError ? <ErrorState onRetry={() => templatesQuery.refetch()} /> : templates.length === 0 ? <EmptyState title="Инженерных шаблонов пока нет" description="Генеральный директор сможет добавить их в общую библиотеку с доступом для инженерной службы." /> : <div>{templates.map((template) => <TemplateRow key={template.id} template={template} onOpen={onOpen} />)}</div>}</section>
    {canSubmit && <section className="surface-card mb-7 p-5 sm:p-7"><div className="section-heading"><div className="setting-icon"><UploadIcon size={17} /></div><div><h2>Отправить документ на согласование</h2><p>Файл сначала поступит главному инженеру, затем — генеральному директору.</p></div></div><form className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end" onSubmit={submitDocument}><label className="form-label">Название документа<input value={title} onChange={(event) => setTitle(event.target.value)} className="text-input mt-2" placeholder="Например, Акт технического осмотра" data-testid="input-engineering-document-title" /></label><label className="form-label">Excel или PDF<input type="file" accept=".xlsx,.xls,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-input mt-2 pt-2" data-testid="input-engineering-document-file" /></label><button type="submit" className="button button-primary justify-center" disabled={requestUpload.isPending || createReport.isPending} data-testid="button-submit-engineering-document">{requestUpload.isPending || createReport.isPending ? "Отправляем..." : "Отправить главному инженеру"} <Send size={15} /></button></form>{file && <p className="mt-4 flex items-center gap-2 text-xs font-medium text-teal-800"><FileCheck2 size={15} />Выбран файл: {file.name}</p>}</section>}
    <section><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">{reviewer || finalApprover ? "Согласование" : "Мои документы"}</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">{queueTitle}</h2></div><Wrench size={19} className="text-muted-foreground" /></div>{reportsQuery.isLoading ? <LoadingRows count={3} /> : reportsQuery.isError ? <ErrorState onRetry={() => reportsQuery.refetch()} /> : reports.length === 0 ? <EmptyState title="Здесь пока нет инженерных документов" description="Документы появятся после отправки или поступления на ваш этап согласования." /> : <div className="space-y-3">{reports.map((report) => <article key={report.id} className="surface-card p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex min-w-0 items-start gap-3"><FileBadge /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{report.title}</h3><ReportStatusPill status={report.status} /></div><p className="mt-1 text-xs text-muted-foreground">{report.fileName} · {report.submittedBy} · {formatDate(report.submittedAt)}</p>{report.reviewerComment && <p className="mt-2 text-xs text-teal-800">Комментарий: {report.reviewerComment}</p>}</div></div><div className="flex shrink-0 flex-wrap gap-2">{report.fileUrl && <a href={report.fileUrl} download={report.fileName} className="button button-secondary text-xs"><Download size={14} />Открыть файл</a>}{reviewer && report.status === "submitted" && <button type="button" onClick={() => moveReport(report, "in_review", "Документ принят в работу главным инженером.")} className="button button-primary text-xs">Взять на проверку</button>}{reviewer && report.status === "in_review" && <><button type="button" onClick={() => moveReport(report, "returned", "Проверьте документ и загрузите исправленную версию.")} className="button button-secondary text-xs"><RotateCcw size={14} />На доработку</button><button type="button" onClick={() => moveReport(report, "approved", "Документ проверен главным инженером.")} className="button button-primary text-xs"><Check size={14} />Принять</button></>}{reviewer && report.status === "approved" && <button type="button" onClick={() => moveReport(report, "sent_to_management", "Документ направлен генеральному директору.")} className="button button-primary text-xs"><Send size={14} />Генеральному директору</button>}{finalApprover && report.status === "sent_to_management" && <button type="button" onClick={() => setArchiveTarget(report)} className="button button-primary text-xs" data-testid={`button-archive-engineering-${report.id}`}><Archive size={14} />Одобрить и в архив</button>}</div></div></article>)}</div>}</section>
    {archiveTarget && <ArchiveSelectionDialog report={archiveTarget} onClose={() => setArchiveTarget(null)} isPending={updateReportStatus.isPending} onConfirm={(section, subarchive) => moveReport(archiveTarget, "archived", "Документ одобрен генеральным директором и помещён в инженерский архив.", { section, subarchive })} />}
  </div>;
}

function SettingsPage({ role, request }: { role: AppRole; request: RoleRequest }) {
  const summaryQuery = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const activityQuery = useListActivity();
  const summary = summaryQuery.data as DashboardSummary | undefined;
  const activities = (activityQuery.data as Activity[] | undefined) ?? [];
  return <div className="animate-page"><div className="mb-7"><p className="eyebrow">Рабочее пространство</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em]">Настройки и доступ</h1><p className="mt-2 text-sm text-muted-foreground">Параметры профиля и состояние общей библиотеки.</p></div><div className="grid gap-5 lg:grid-cols-2"><section className="surface-card p-6"><div className="section-heading"><div className="setting-icon"><UserRound size={17} /></div><div><h2>Профиль</h2><p>Подтверждённые данные текущей заявки.</p></div></div><dl className="mt-6 space-y-4 text-sm"><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">Сотрудник</dt><dd className="text-right font-semibold">{request.displayName}</dd></div><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">E-mail</dt><dd className="text-right font-semibold">{request.email}</dd></div><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">Роль</dt><dd className="text-right font-semibold text-teal-800">{roleLabels[role]}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Подразделение</dt><dd className="text-right font-semibold">{request.department}</dd></div></dl></section><section className="surface-card p-6"><div className="section-heading"><div className="setting-icon"><BarChart3 size={17} /></div><div><h2>Состояние библиотеки</h2><p>Сводка доступных рабочих материалов.</p></div></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Всего шаблонов</p><strong className="mt-2 block font-display text-2xl">{summary?.totalTemplates ?? "—"}</strong></div><div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Активность</p><strong className="mt-2 block font-display text-2xl">{activities.length || "—"}</strong></div></div></section></div></div>;
}

function Workspace({ role, actualRole, demoRole, request, section, onSectionChange, onDemoRoleChange }: {
  role: AppRole;
  actualRole: AppRole;
  demoRole: AppRole | null;
  request: RoleRequest;
  section: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
  onDemoRoleChange: (role: AppRole | null) => void;
}) {
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedArchiveCell, setSelectedArchiveCell] = useState<ArchiveCell | null>(null);
  const openTemplate = (id: number) => { setTemplateId(id); setUploading(false); onSectionChange("templates"); };
  return <>
    {(section === "cabinet" || section === "templates") && <div className="mb-7 flex flex-wrap gap-2" role="tablist" aria-label="Разделы кабинета">
      <button type="button" role="tab" aria-selected={section === "cabinet"} className={cn("workspace-tab", section === "cabinet" && "workspace-tab-active")} onClick={() => onSectionChange("cabinet")} data-testid="tab-workspace-cabinet"><ClipboardCheck size={15} />Личный кабинет</button>
      <button type="button" role="tab" aria-selected={section === "templates"} className={cn("workspace-tab", section === "templates" && "workspace-tab-active")} onClick={() => onSectionChange("templates")} data-testid="tab-workspace-templates"><FileSpreadsheet size={15} />Шаблоны</button>
    </div>}
    {section === "cabinet" && <Cabinet role={role} actualRole={actualRole} demoRole={demoRole} onDemoRoleChange={onDemoRoleChange} />}
    {section === "templates" && (templateId ? <TemplateDetails id={templateId} role={role} onBack={() => setTemplateId(null)} /> : uploading ? <TemplateUpload onCancel={() => setUploading(false)} onSaved={(id) => { setUploading(false); setTemplateId(id); queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() }); }} /> : <TemplateCatalog role={role} onOpen={openTemplate} onUpload={() => setUploading(true)} />)}
    {section === "archive" && <ArchivePage selectedCell={selectedArchiveCell} onSelectCell={setSelectedArchiveCell} />}
    {section === "agro" && <AgroWorkspace role={role}><AgroBlock onOpen={openTemplate} /></AgroWorkspace>}
    {section === "engineering" && <EngineeringWorkspace role={role}><EngineeringBlock role={role} onOpenTemplate={openTemplate} isDemoPreview={Boolean(demoRole)} /></EngineeringWorkspace>}
    {section === "economic" && <EconomicBlock role={role} actualRole={actualRole} demoRole={demoRole} onDemoRoleChange={onDemoRoleChange} />}
    {section === "legal" && <LegalBlock role={role} actualRole={actualRole} demoRole={demoRole} onDemoRoleChange={onDemoRoleChange} />}
    {section === "settings" && <SettingsPage role={role} request={request} />}
  </>;
}

function AccessGate() {
  const requestQuery = useGetMyRoleRequest({ query: { queryKey: getGetMyRoleRequestQueryKey(), refetchInterval: 12000 } });
  const [section, setSection] = useState<WorkspaceSection>("cabinet");
  const [demoRole, setDemoRole] = useState<AppRole | null>(null);
  useEffect(() => {
    window.localStorage.removeItem("agrolink-role-context");
  }, []);
  const request = (requestQuery.data as RoleRequest | null | undefined) ?? null;
  if (requestQuery.isLoading) return <main className="access-page"><LoadingRows count={2} /></main>;
  if (requestQuery.isError) return <main className="access-page"><ErrorState onRetry={() => requestQuery.refetch()} /></main>;
  if (request?.status !== "approved") return <RoleRequestScreen request={request} />;
  const actualRole = request.requestedRole as AppRole;
  const canUseDemo = actualRole === "general_director";
  const role = canUseDemo && demoRole ? demoRole : actualRole;
  const changeDemoRole = (nextRole: AppRole | null) => {
    setDemoRole(nextRole);
    if (nextRole) window.localStorage.setItem("agrolink-role-context", nextRole);
    else window.localStorage.removeItem("agrolink-role-context");
    queryClient.clear();
  };
  return <Shell role={role} request={request} activeSection={section} onNavigate={setSection}><Workspace role={role} actualRole={actualRole} demoRole={canUseDemo ? demoRole : null} request={request} section={section} onSectionChange={setSection} onDemoRoleChange={changeDemoRole} /></Shell>;
}

function Home() {
  return <><Show when="signed-in"><AccessGate /></Show><Show when="signed-out"><PublicLanding /></Show></>;
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
      <QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><Switch><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route component={Home} /></Switch></ErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  if (!clerkPubKey) throw new Error("Не настроен ключ авторизации");
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
