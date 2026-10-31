import { useState } from "react";
import { CheckCheck, Inbox, RefreshCw, TriangleAlert } from "lucide-react";
import { type SupportingService, type SupportingTask, getListSupportingTasksQueryKey, useAcceptSupportingTask, useListSupportingTasks } from "@workspace/api-client-react";
import { cx, errorInfo } from "../fields/shared";
import { TaskCard } from "./TaskCard";
import { NOT_EXPENSE_TEXT, TASKS_POLL_MS, serviceLabel, taskErr, useInvalidateTasks } from "./shared";

/** Inbox of sent supporting tasks for one service. Accept only when canAccept. */
export function ServiceTaskInbox({ service, canAccept, demo = false }: { service: SupportingService; canAccept: boolean; demo?: boolean }) {
  const params = { service };
  const q = useListSupportingTasks(params, { query: { queryKey: getListSupportingTasksQueryKey(params), enabled: !demo, refetchInterval: demo ? false : TASKS_POLL_MS } });
  const [filter, setFilter] = useState<"new" | "accepted">("new");
  const list = (q.data ?? []).filter((t) => t.status === "sent");
  const st = (t: SupportingTask) => t.deliveries.find((d) => d.service === service)?.status;
  const fresh = list.filter((t) => st(t) === "sent").length;
  const visible = list.filter((t) => filter === "new" ? st(t) !== "accepted" : st(t) === "accepted").sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "") || b.id - a.id);

  return <section className="surface-card overflow-hidden" data-testid={`section-service-inbox-${service}`}>
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold"><Inbox size={14} />Задания службам · {serviceLabel(service)}
          {fresh > 0 && <span className="rounded-full bg-foreground px-1.5 font-mono text-[10px] text-background" data-testid={`badge-inbox-${service}`}>{fresh}</span>}
          {q.isFetching && !q.isLoading && <RefreshCw size={11} className="animate-spin text-muted-foreground" />}</h3>
        <p className="text-[10.5px] text-muted-foreground">Задания от агрономов. {NOT_EXPENSE_TEXT}.{!canAccept && " Режим просмотра."}</p>
      </div>
      <div className="inline-flex rounded-md border border-border p-0.5">{(["new", "accepted"] as const).map((k) => <button key={k} type="button" onClick={() => setFilter(k)} className={cx("rounded px-2 py-0.5 text-[10.5px] font-bold", filter === k ? "bg-foreground text-background" : "text-muted-foreground")} data-testid={`tab-inbox-${service}-${k}`}>{k === "new" ? "Новые" : "В исполнении"}</button>)}</div>
    </div>
    <div className="space-y-2 p-4 sm:p-5">
      {demo ? <p className="text-[11px] text-muted-foreground" data-testid={`status-inbox-demo-${service}`}>В демо-режиме задания не загружаются.</p>
        : q.isLoading ? <div className="space-y-2" data-testid={`status-inbox-loading-${service}`}><div className="skeleton h-24 rounded-lg" /><div className="skeleton h-24 rounded-lg" /></div>
        : q.isError ? <div className="flex flex-wrap items-center gap-2 text-[11px] text-destructive" data-testid={`status-inbox-error-${service}`}><TriangleAlert size={13} />{errorInfo(q.error).message}<button type="button" className="button button-secondary !min-h-[28px] text-foreground" onClick={() => { void q.refetch(); }} data-testid={`button-inbox-retry-${service}`}>Повторить</button></div>
        : visible.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground" data-testid={`status-inbox-empty-${service}`}>{filter === "new" ? "Новых заданий нет." : "Заданий в исполнении нет."}</p>
        : visible.map((t) => <TaskCard key={t.id} task={t} highlight={st(t) === "sent"} actions={canAccept && st(t) === "sent" ? <AcceptBtn task={t} service={service} /> : undefined} />)}
    </div>
  </section>;
}

function AcceptBtn({ task, service }: { task: SupportingTask; service: SupportingService }) {
  const m = useAcceptSupportingTask();
  const invalidate = useInvalidateTasks();
  const [err, setErr] = useState("");
  return <>
    {err && <span className="max-w-[260px] text-[10.5px] font-semibold text-destructive" role="alert" data-testid={`text-accept-error-${task.id}`}>{err}</span>}
    <button type="button" className="button button-primary !min-h-[28px] !px-2 text-[10.5px]" disabled={m.isPending} data-testid={`button-task-accept-${task.id}-${service}`}
      onClick={() => { setErr(""); m.mutate({ id: task.id, data: { version: task.version, service } }, { onSuccess: () => { void invalidate(); }, onError: (e) => { setErr(taskErr(e).message); void invalidate(); } }); }}>
      {m.isPending ? <RefreshCw size={12} className="animate-spin" /> : <CheckCheck size={12} />}Исполнить задание
    </button>
  </>;
}
