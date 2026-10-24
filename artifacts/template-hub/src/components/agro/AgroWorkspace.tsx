import { type ReactNode, useState } from "react";
import { FileSpreadsheet, LandPlot, Route, Wheat } from "lucide-react";
import GrainBalance from "./GrainBalance";
import FieldsWorkspace from "./fields/FieldsWorkspace";
import DispatcherWorkspace from "./DispatcherWorkspace";

export default function AgroWorkspace({ role, children }: { role: string; children: ReactNode }) {
  const allowed = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"].includes(role);
  const [tab, setTab] = useState<"grain" | "fields" | "dispatch" | "documents">(allowed ? "grain" : "documents");
  if (role === "dispatcher") return <DispatcherWorkspace />;
  if (!allowed) return <div className="surface-card empty-state" data-testid="status-agro-forbidden"><h2 className="text-sm font-bold">Нет доступа к АгроБлоку</h2><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Раздел доступен агроному, главному агроному, заведующему током, весовщице и генеральному директору.</p></div>;
  return <div>
    <div className="mb-7 flex flex-wrap gap-2" role="tablist" aria-label="Разделы агроблока">
      {allowed && <button type="button" className={`workspace-tab ${tab === "grain" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "grain"} onClick={() => setTab("grain")} data-testid="tab-agro-grain"><Wheat size={15} />Баланс зерна</button>}
      {allowed && <button type="button" className={`workspace-tab ${tab === "fields" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "fields"} onClick={() => setTab("fields")} data-testid="tab-agro-fields"><LandPlot size={15} />Полевые работы</button>}
      {role === "general_director" && <button type="button" className={`workspace-tab ${tab === "dispatch" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "dispatch"} onClick={() => setTab("dispatch")} data-testid="tab-agro-dispatch"><Route size={15} />Диспетчерская</button>}
      <button type="button" className={`workspace-tab ${tab === "documents" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "documents"} onClick={() => setTab("documents")} data-testid="tab-agro-documents"><FileSpreadsheet size={15} />Шаблоны и отчёты</button>
    </div>
    <div role="tabpanel">{tab === "grain" && allowed ? <GrainBalance role={role} /> : tab === "fields" && allowed ? <FieldsWorkspace role={role} /> : tab === "dispatch" && role === "general_director" ? <DispatcherWorkspace /> : children}</div>
  </div>;
}
