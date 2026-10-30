import { useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, RefreshCw, Send, TriangleAlert } from "lucide-react";
import {
  type SupportingTask, getGetFieldDashboardQueryKey, getListSupportingTasksQueryKey,
  useGetFieldDashboard, useListSupportingTasks, useSendSupportingTask,
} from "@workspace/api-client-react";
import { cx, errorInfo } from "../fields/shared";
import { TaskCard } from "./TaskCard";
import { type OpContext, TaskForm } from "./TaskForm";
import { NOT_EXPENSE_TEXT, TASKS_POLL_MS, canCreateTasks, taskErr, useInvalidateTasks } from "./shared";

type Props = { role: string; demo?: boolean; fieldId?: number; seasonId?: number; year?: number; compact?: boolean };

/** Creator / chief / GD view of supporting tasks. Scoped to a field season when fieldId+seasonId given. */
export function SupportingTasksPanel({ role, demo = false, fieldId, seasonId, year, compact }: Props) {
  const readAllowed = ["agronomist", "chief_agronomist", "general_director"].includes(role);
  const enabled = readAllowed && !demo;
  const creator = canCreateTasks(role) && enabled;
  const q = useListSupportingTasks(undefined, { query: { queryKey: getListSupportingTasksQueryKey(), enabled, refetchInterval: enabled ? TASKS_POLL_MS : false } });
  const dash = useGetFieldDashboard({ query: { queryKey: getGetFieldDashboardQueryKey(), enabled: creator } });
  const [form, setForm] = useState<{ task?: SupportingTask } | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "sent">("all");

  const candidates = useMemo<OpContext[]>(() => {
    const d = dash.data; if (!d) return [];
    const seasons = new Map(d.seasons.map((s) => [s.id, s]));
    const fields = new Map(d.fields.map((f) => [f.id, f]));
    return d.operations.filter((o) => o.status !== "completed" && o.status !== "cancelled" && !o.isUnplanned && (o.supportingWorks?.length ?? 0) > 0 && (seasonId === undefined || o.seasonId === seasonId))
      .flatMap((o) => { const s = seasons.get(o.seasonId); const f = s && fields.get(s.fieldId); return s && f && f.isActive ? [{ op: o, fieldNumber: f.number, farm: f.unit, year: s.year }] : []; })
      .sort((a, b) => a.fieldNumber.localeCompare(b.fieldNumber, "ru", { numeric: true }) || a.op.plannedStart.localeCompare(b.op.plannedStart));
  }, [dash.data, seasonId]);

  const tasks = useMemo(() => (q.data ?? []).filter((t) => (fieldId === undefined || t.fieldId === fieldId) && (year === undefined || t.year === year))
    .filter((t) => filter === "all" || t.status === filter).sort((a, b) => b.id - a.id), [q.data, fieldId, year, filter]);
  const drafts = (q.data ?? []).filter((t) => t.status === "draft" && (fieldId === undefined || t.fieldId === fieldId) && (year === undefined || t.year === year)).length;

  if (!readAllowed) return null;
  return <section className={cx(compact ? "px-4 py-3 sm:px-5" : "surface-card overflow-hidden")} data-testid={compact ? "section-supporting-tasks-field" : "section-supporting-tasks"}>
    <div className={cx("flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", !compact && "border-b border-border px-4 py-3 sm:px-5")}>
      <div>
        <h3 className={cx("flex items-center gap-2 font-bold", compact ? "text-xs" : "text-sm")}><ClipboardList size={14} />Задания службам
          {drafts > 0 && <span className="rounded-full bg-muted px-1.5 font-mono text-[10px]" data-testid="badge-task-drafts">{drafts} черн.</span>}
          {q.isFetching && !q.isLoading && <RefreshCw size={11} className="animate-spin text-muted-foreground" />}</h3>
        <p className="text-[10.5px] text-muted-foreground">Отдельные задания для тока, автобазы и нефтебазы на основе плановых сопутствующих работ. {NOT_EXPENSE_TEXT}.</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex rounded-md border border-border p-0.5">{(["all", "draft", "sent"] as const).map((k) => <button key={k} type="button" onClick={() => setFilter(k)} className={cx("rounded px-2 py-0.5 text-[10.5px] font-bold", filter === k ? "bg-foreground text-background" : "text-muted-foreground")} data-testid={`tab-tasks-filter-${k}`}>{k === "all" ? "Все" : k === "draft" ? "Черновики" : "Отправленные"}</button>)}</div>
        {creator && <button type="button" className="button button-primary !min-h-[30px] !px-2.5 text-[11px]" disabled={dash.isLoading || candidates.length === 0} title={candidates.length === 0 ? "Нет плановых операций с сопутствующими работами" : undefined} onClick={() => setForm({})} data-testid="button-task-new"><Plus size={13} />Новое задание</button>}
      </div>
    </div>
    {!canCreateTasks(role) && enabled && <p className="px-4 pt-2 text-[10.5px] text-muted-foreground sm:px-5" data-testid="text-tasks-readonly">Режим просмотра: задания создают агрономы.</p>}
    {creator && dash.isError && <p className="px-4 pt-2 text-[10.5px] text-destructive sm:px-5">Не удалось загрузить операции: {errorInfo(dash.error).message} <button type="button" className="underline" onClick={() => { void dash.refetch(); }} data-testid="button-tasks-dash-retry">повторить</button></p>}
    {creator && !dash.isLoading && !dash.isError && candidates.length === 0 && <p className="px-4 pt-2 text-[10.5px] text-muted-foreground sm:px-5" data-testid="text-tasks-no-candidates">Нет плановых (не начатых) операций с сопутствующими работами{fieldId !== undefined ? " на этом поле" : ""}.</p>}
    {notice && <div className="notice-banner mx-4 mt-2 sm:mx-5" role="status" data-testid="text-tasks-notice">{notice}<button type="button" aria-label="Скрыть" onClick={() => setNotice("")}>×</button></div>}
    <div className={cx("space-y-2", compact ? "mt-2" : "p-4 sm:p-5")}>
      {demo ? <p className="text-[11px] text-muted-foreground" data-testid="status-tasks-demo">В демо-режиме задания службам не загружаются и не отправляются.</p>
        : q.isLoading ? <div className="space-y-2" data-testid="status-tasks-loading"><div className="skeleton h-24 rounded-lg" /><div className="skeleton h-24 rounded-lg" /></div>
        : q.isError ? <div className="flex flex-wrap items-center gap-2 text-[11px] text-destructive" data-testid="status-tasks-error"><TriangleAlert size={13} />{errorInfo(q.error).message}<button type="button" className="button button-secondary !min-h-[28px] text-foreground" onClick={() => { void q.refetch(); }} data-testid="button-tasks-retry">Повторить</button></div>
        : tasks.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground" data-testid="status-tasks-empty">{filter === "all" ? "Заданий службам пока нет." : "В этом фильтре заданий нет."}</p>
        : tasks.map((t) => <TaskCard key={t.id} task={t} actions={creator && t.status === "draft" ? <DraftActions task={t} onEdit={() => setForm({ task: t })} onSent={(m) => setNotice(m)} /> : undefined} />)}
    </div>
    {form && <TaskForm candidates={candidates} task={form.task} onClose={() => setForm(null)} onSaved={(_t, m) => { setForm(null); setNotice(m); }} />}
  </section>;
}

function DraftActions({ task, onEdit, onSent }: { task: SupportingTask; onEdit: () => void; onSent: (m: string) => void }) {
  const send = useSendSupportingTask();
  const invalidate = useInvalidateTasks();
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  return <>
    {err && <span className="max-w-[260px] text-[10.5px] font-semibold text-destructive" role="alert" data-testid={`text-task-send-error-${task.id}`}>{err}</span>}
    <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10.5px]" disabled={send.isPending} onClick={onEdit} data-testid={`button-task-edit-${task.id}`}><Pencil size={12} />Изменить</button>
    {!confirm ? <button type="button" className="button button-primary !min-h-[28px] !px-2 text-[10.5px]" disabled={send.isPending} onClick={() => { setErr(""); setConfirm(true); }} data-testid={`button-task-send-${task.id}`}><Send size={12} />Отправить службам</button>
      : <button type="button" className="button button-primary !min-h-[28px] !px-2 text-[10.5px]" disabled={send.isPending} data-testid={`button-task-send-confirm-${task.id}`}
        onClick={() => send.mutate({ id: task.id, data: { version: task.version } }, {
          onSuccess: (t) => { setConfirm(false); void invalidate(); onSent(`Задание № ${t.id} отправлено: ${t.services.length} служб(ы). Изменение больше недоступно.`); },
          onError: (e) => { setConfirm(false); setErr(taskErr(e).message); void invalidate(); },
        })}>{send.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}Подтвердить отправку</button>}
  </>;
}
