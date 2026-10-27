import { ArrowLeft, BadgeCheck } from "lucide-react";
import PayrollRegisterWorkspace from "../economic/PayrollRegisterWorkspace";

export default function HRWorkspace({ demoActive = false, onExitDemo }: { demoActive?: boolean; onExitDemo?: () => void }) {
  return <div className="animate-page space-y-5" data-testid="hr-workspace">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">Рабочее пространство</p>
        <h1 className="mt-1.5 flex items-center gap-2 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl"><BadgeCheck size={24} className="text-[#0b679e]" />Отдел кадров</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Диспетчер направляет ежедневные наряды по перевозке зерна и полевым работам. Только после вашего подтверждения строки попадают в накопительные начисления сотрудников и в реестр экономиста. Суммы и расценки здесь не редактируются.</p>
      </div>
      {demoActive && onExitDemo && <button type="button" className="button button-secondary text-xs" onClick={onExitDemo} data-testid="button-hr-exit-demo"><ArrowLeft size={14} />Выйти из демо-роли</button>}
    </header>
    <PayrollRegisterWorkspace canManage={false} canApprove />
  </div>;
}
