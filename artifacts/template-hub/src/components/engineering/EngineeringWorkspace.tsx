import { useState, type ReactNode } from "react";
import { ClipboardCheck, Wrench } from "lucide-react";
import RepairDashboard from "./RepairDashboard";

export default function EngineeringWorkspace({ role, children }: { role: string; children: ReactNode }) {
  const [tab, setTab] = useState<"repairs" | "documents">("repairs");
  return (
    <div>
      <div className="mb-7 flex flex-wrap gap-2" role="tablist" aria-label="Разделы инженерного блока">
        <button type="button" role="tab" aria-selected={tab === "repairs"} aria-controls="engineering-panel"
          className={`workspace-tab ${tab === "repairs" ? "workspace-tab-active" : ""}`}
          onClick={() => setTab("repairs")} data-testid="tab-engineering-repairs">
          <Wrench size={15} />Ремонт техники
        </button>
        <button type="button" role="tab" aria-selected={tab === "documents"} aria-controls="engineering-panel"
          className={`workspace-tab ${tab === "documents" ? "workspace-tab-active" : ""}`}
          onClick={() => setTab("documents")} data-testid="tab-engineering-documents">
          <ClipboardCheck size={15} />Шаблоны и документы
        </button>
      </div>
      <div id="engineering-panel" role="tabpanel">
        {tab === "repairs" ? <RepairDashboard role={role} /> : children}
      </div>
    </div>
  );
}
