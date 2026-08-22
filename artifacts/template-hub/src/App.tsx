import { type FormEvent, type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
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
  Download,
  Upload as UploadIcon,
} from "lucide-react";
import {
  type Report,
  type RoleRequest,
  getGetMyRoleRequestQueryKey,
  getListReportsQueryKey,
  getListRoleRequestsQueryKey,
  useCreateReport,
  useCreateRoleRequest,
  useGetMyRoleRequest,
  useListReports,
  useListRoleRequests,
  useReviewRoleRequest,
  useUpdateReportStatus,
} from "@workspace/api-client-react";
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const departments = ["АПК Арыстан Grain", "АФ Веденовка", "Агрономия", "Финансовый отдел", "Управление"];
const roleLabels = {
  agronomist: "Агроном",
  chief_agronomist: "Главный агроном",
  economist: "Экономист",
  farm_director: "Директор хозяйства",
  general_director: "Генеральный директор",
} as const;
type AppRole = keyof typeof roleLabels;

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
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
    footerActionLink: "text-teal-700",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-teal-700",
    formFieldSuccessText: "text-teal-700",
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
        <div className="brand-mark"><FileSpreadsheet size={22} /></div>
        <p className="eyebrow mt-7">Единая база шаблонов</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.05em] text-foreground">Рабочие документы.<br /><span className="text-teal-700">Понятные роли.</span></h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Каждый сотрудник выбирает роль при регистрации. Доступ к отчётам открывается только после согласования руководителем.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`${basePath}/sign-in`} className="button button-primary">Войти <UserRound size={16} /></a>
          <a href={`${basePath}/sign-up`} className="button button-secondary">Зарегистрироваться</a>
        </div>
      </section>
      <aside className="auth-landing-aside">
        <ShieldCheck size={28} className="text-teal-700" />
        <h2 className="mt-5 font-display text-2xl font-bold tracking-[-0.04em]">Доступ под контролем</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">После регистрации заявка попадает в очередь руководителя. До согласования действия по рабочим ролям недоступны.</p>
      </aside>
    </main>
  );
}

function SignInPage() {
  return <main className="auth-screen"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main>;
}

function SignUpPage() {
  return <main className="auth-screen"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main>;
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

function ApprovalQueue({ role }: { role: AppRole }) {
  const enabled = ["chief_agronomist", "farm_director", "general_director"].includes(role);
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

function Shell({ children, role, request }: { children: ReactNode; role: AppRole; request: RoleRequest }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [topNotice, setTopNotice] = useState("");
  const { signOut } = useClerk();
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={cn("fixed inset-y-0 left-0 z-30 flex w-[256px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-9 flex items-center gap-3 px-2"><div className="brand-mark"><FileSpreadsheet size={20} /></div><div><div className="font-display text-[15px] font-bold tracking-[-0.02em]">Единая база</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/45">Шаблонов</div></div></div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/35">Рабочее пространство</div>
        <div className="nav-item nav-item-active"><ClipboardCheck size={17} /><span>Личный кабинет</span></div>
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
};

function ReportStatusPill({ status }: { status: Report["status"] }) {
  const tone = status === "returned" ? "border-amber-200 bg-amber-50 text-amber-800" : status === "sent_to_management" ? "border-blue-200 bg-blue-50 text-blue-800" : status === "approved" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-border bg-muted text-muted-foreground";
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold", tone)}>{reportStatusLabels[status]}</span>;
}

function Cabinet({ role }: { role: AppRole }) {
  const [file, setFile] = useState<File | null>(null);
  const [unit, setUnit] = useState("АПК Арыстан Grain");
  const [notice, setNotice] = useState("");
  const reportsQuery = useListReports(undefined, { query: { queryKey: getListReportsQueryKey() } });
  const createReport = useCreateReport();
  const updateReportStatus = useUpdateReportStatus();
  const reports = (reportsQuery.data as Report[] | undefined) ?? [];
  const canSubmit = role === "agronomist" || role === "economist";
  const isEconomist = role === "economist";
  const reviewer = role === "chief_agronomist" || role === "farm_director";
  const queueTitle = role === "chief_agronomist" ? "Очередь главного агронома" : role === "farm_director" ? "Очередь директора хозяйства" : role === "general_director" ? "Отчёты для начальства" : isEconomist ? "Ежедневные реестры" : "Отправленные отчёты";

  const refreshReports = () => queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
  const submitReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setNotice("Сначала выберите заполненный файл.");
      return;
    }
    createReport.mutate({ data: {
      title: isEconomist ? `Реестр финансирования · ${unit}` : `Отчёт по уборке · ${unit}`,
      unit,
      fileName: file.name,
      fileSize: `${(file.size / 1024 / 1024).toFixed(1)} МБ`,
      fileUrl: isEconomist ? "/files/reestr-finansirovaniya-vedenovka.pdf" : "/files/svodka-uborka-arysan-green.xlsx",
    } }, { onSuccess: () => { setFile(null); setNotice(isEconomist ? "Реестр отправлен директору хозяйства." : "Отчёт отправлен главному агроному."); refreshReports(); }, onError: () => setNotice("Не удалось отправить документ.") });
  };
  const moveReport = (report: Report, status: "in_review" | "returned" | "approved" | "sent_to_management", reviewerComment: string) => {
    updateReportStatus.mutate({ id: report.id, data: { status, reviewerComment } }, { onSuccess: () => { setNotice(status === "returned" ? "Документ возвращён на доработку." : status === "sent_to_management" ? "Документ отправлен начальству." : "Статус документа обновлён."); refreshReports(); }, onError: () => setNotice("Не удалось изменить статус документа.") });
  };

  return (
    <div className="animate-page">
      <div className="mb-8"><p className="eyebrow">Согласование отчётов</p><h1 className="mt-2 font-display text-[28px] font-bold tracking-[-0.045em] text-foreground sm:text-[34px]">Личный кабинет</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Ваша роль «{roleLabels[role]}» подтверждена. Доступные действия и документы определяются сервером.</p></div>
      <ApprovalQueue role={role} />
      {notice && <div className="notice-banner mb-6" data-testid="status-report-notice"><Check size={16} />{notice}<button type="button" aria-label="Закрыть" onClick={() => setNotice("")}><X size={14} /></button></div>}
      {canSubmit && <section className="surface-card mb-7 p-5 sm:p-7"><div className="section-heading"><div className="setting-icon"><UploadIcon size={17} /></div><div><h2>{isEconomist ? "Подать ежедневный реестр до 09:30" : "Передать заполненный отчёт"}</h2><p>{isEconomist ? "Реестр сначала поступит директору хозяйства, затем генеральному директору." : "Отчёт поступит главному агроному на проверку."}</p></div></div><form onSubmit={submitReport} className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end"><label className="form-label">Подразделение<select value={unit} onChange={(event) => setUnit(event.target.value)} className="text-input mt-2"><option>АПК Арыстан Grain</option><option>АФ Веденовка</option></select></label><label className="form-label">{isEconomist ? "Ежедневный реестр" : "Заполненный Excel-файл"}<input type="file" accept={isEconomist ? ".pdf,.xlsx,.xls" : ".xlsx,.xls"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-input mt-2 pt-2" data-testid="input-completed-report" /></label><button type="submit" disabled={createReport.isPending} className="button button-primary justify-center" data-testid="button-submit-report">{createReport.isPending ? "Отправляем..." : isEconomist ? "Отправить директору" : "Отправить на проверку"} <Send size={15} /></button></form>{file && <p className="mt-4 flex items-center gap-2 text-xs font-medium text-teal-800"><FileCheck2 size={15} />Выбран файл: {file.name}</p>}</section>}
      <section><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">{reviewer ? "Согласование" : "Мои документы"}</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">{queueTitle}</h2></div><ClipboardCheck size={19} className="text-muted-foreground" /></div>{reportsQuery.isLoading ? <LoadingRows count={3} /> : reportsQuery.isError ? <ErrorState onRetry={() => reportsQuery.refetch()} /> : reports.length === 0 ? <EmptyState title="Здесь пока нет документов" description="Когда документ перейдёт на доступный вам этап, он появится в списке." /> : <div className="space-y-3">{reports.map((report) => <article key={report.id} className="surface-card p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex min-w-0 items-start gap-3"><FileBadge /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{report.title}</h3><ReportStatusPill status={report.status} /></div><p className="mt-1 text-xs text-muted-foreground">{report.unit} · {report.fileName} · {report.submittedBy} · {formatDate(report.submittedAt)}</p>{report.reviewerComment && <p className="mt-2 text-xs text-teal-800">Комментарий: {report.reviewerComment}</p>}</div></div><div className="flex shrink-0 flex-wrap gap-2">{report.fileUrl && <a href={report.fileUrl} download={report.fileName} className="button button-secondary text-xs"><Download size={14} />Открыть файл</a>}{reviewer && report.status === "submitted" && <button type="button" onClick={() => moveReport(report, "in_review", "Документ принят в работу.")} className="button button-primary text-xs">Взять на проверку</button>}{reviewer && report.status === "in_review" && <><button type="button" onClick={() => moveReport(report, "returned", "Проверьте данные и загрузите исправленную версию.")} className="button button-secondary text-xs"><RotateCcw size={14} />На доработку</button><button type="button" onClick={() => moveReport(report, "approved", "Документ проверен.")} className="button button-primary text-xs"><Check size={14} />Принять</button></>}{reviewer && report.status === "approved" && <button type="button" onClick={() => moveReport(report, "sent_to_management", "Документ направлен начальству.")} className="button button-primary text-xs"><Send size={14} />{role === "farm_director" ? "Генеральному директору" : "Отправить начальству"}</button>}</div></div></article>)}</div>}</section>
    </div>
  );
}

function AccessGate() {
  const requestQuery = useGetMyRoleRequest({ query: { queryKey: getGetMyRoleRequestQueryKey(), refetchInterval: 12000 } });
  const request = (requestQuery.data as RoleRequest | null | undefined) ?? null;
  if (requestQuery.isLoading) return <main className="access-page"><LoadingRows count={2} /></main>;
  if (requestQuery.isError) return <main className="access-page"><ErrorState onRetry={() => requestQuery.refetch()} /></main>;
  if (request?.status !== "approved") return <RoleRequestScreen request={request} />;
  return <Shell role={request.requestedRole as AppRole} request={request}><Cabinet role={request.requestedRole as AppRole} /></Shell>;
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