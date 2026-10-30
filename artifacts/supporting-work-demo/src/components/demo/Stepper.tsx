import { Lock, Check } from "lucide-react";
import { STAGES, blockReason, isDone, type DemoState, type StageId } from "@/demo/model";

export function Stepper({ state, active, onSelect }: { state: DemoState; active: StageId; onSelect: (id: StageId) => void }) {
  return (
    <nav className="flex gap-px overflow-x-auto border border-border bg-border" aria-label="Роли и этапы">
      {STAGES.map((s) => {
        const done = isDone(state, s.id);
        const locked = !done && !!blockReason(state, s.id);
        const on = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            data-testid={`tab-stage-${s.id}`}
            onClick={() => onSelect(s.id)}
            className={`min-w-[112px] flex-1 px-3 py-3 text-left transition-colors ${on ? "bg-foreground text-background" : "bg-background hover:bg-muted"}`}
          >
            <div className="flex items-center justify-between">
              <span className="num text-[11px] opacity-70">0{s.id}</span>
              {done ? <Check className="h-3.5 w-3.5" /> : locked ? <Lock className="h-3 w-3 opacity-50" /> : <span className="h-2 w-2 bg-accent" />}
            </div>
            <div className="mt-1 text-[13px] font-semibold leading-tight">{s.short}</div>
            <div className={`text-[11px] leading-tight ${on ? "opacity-70" : "text-muted-foreground"}`}>{s.role}</div>
          </button>
        );
      })}
    </nav>
  );
}
