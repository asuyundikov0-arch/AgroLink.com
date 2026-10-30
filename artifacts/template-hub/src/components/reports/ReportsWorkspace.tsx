import { useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardList, Sprout } from "lucide-react";
import DailySeedingReportWorkspace from "../agro/DailySeedingReportWorkspace";

export const canViewReports = (role: string) =>
  ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"].includes(role);

export default function ReportsWorkspace({ role }: { role: string }) {
  const [section, setSection] = useState<"catalog" | "agro">("catalog");
  if (!canViewReports(role)) return <div className="surface-card empty-state" data-testid="status-reports-forbidden">
    <h2 className="text-sm font-bold">Нет доступа к отчётам</h2>
    <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Агро отчёты доступны агрономам, заведующему током, весовщице и генеральному директору.</p>
  </div>;
  if (section === "agro") return <div className="space-y-5" data-testid="reports-agro">
    <button type="button" className="button button-secondary" onClick={() => setSection("catalog")} data-testid="button-reports-back"><ArrowLeft size={14} />Все отчёты</button>
    <div className="flex items-center gap-2 text-sm font-semibold"><Sprout size={16} />Агро отчёты</div>
    <DailySeedingReportWorkspace />
  </div>;
  return <div className="space-y-6" data-testid="reports-workspace">
    <header>
      <p className="eyebrow">Сводки подразделений</p>
      <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Отчёты</h1>
      <p className="mt-1 text-xs text-muted-foreground">Отчёты автоматически формируются из внесённых рабочих данных.</p>
    </header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <button type="button" onClick={() => setSection("agro")} className="surface-card group flex min-h-[170px] flex-col items-start gap-4 p-5 text-left transition-colors hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground" data-testid="button-reports-agro">
        <ClipboardList size={24} aria-hidden="true" />
        <span className="flex w-full items-center justify-between gap-3"><span className="text-base font-bold">Агро отчёты</span><ArrowRight size={17} aria-hidden="true" /></span>
        <span className="text-xs leading-5 text-muted-foreground">Ежедневный отчёт по посеву: выработка за день и общий посев по культурам.</span>
      </button>
    </div>
  </div>;
}
