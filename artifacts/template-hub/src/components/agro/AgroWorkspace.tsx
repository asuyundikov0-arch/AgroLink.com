import { useState } from "react";
import { Coins, FileStack, FlaskConical, LandPlot, Route, Wheat } from "lucide-react";
import GrainBalance from "./GrainBalance";
import FieldsWorkspace from "./fields/FieldsWorkspace";
import DispatcherWorkspace from "./DispatcherWorkspace";
import ChemicalWarehouse from "./ChemicalWarehouse";
import TokPayrollWorkspace from "./TokPayrollWorkspace";
import PayrollRegisterWorkspace from "../economic/PayrollRegisterWorkspace";

export default function AgroWorkspace({ role, demo = false }: { role: string; demo?: boolean }) {
  const allowed = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"].includes(role);
  const [tab, setTab] = useState<"grain" | "fields" | "chemicals" | "dispatch" | "tokPay" | "tokOrders">("grain");
  const tokPay = role === "grain_manager" || role === "general_director";
  if (role === "dispatcher") return <DispatcherWorkspace />;
  if (!allowed) return <div className="surface-card empty-state" data-testid="status-agro-forbidden"><h2 className="text-sm font-bold">Нет доступа к АгроБлоку</h2><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Раздел доступен агроному, главному агроному, заведующему током, весовщице и генеральному директору.</p></div>;
  return <div>
    <div className="mb-7 flex flex-wrap gap-2" role="tablist" aria-label="Разделы агроблока">
      <button type="button" className={`workspace-tab ${tab === "grain" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "grain"} onClick={() => setTab("grain")} data-testid="tab-agro-grain"><Wheat size={15} />Баланс зерна</button>
      <button type="button" className={`workspace-tab ${tab === "fields" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "fields"} onClick={() => setTab("fields")} data-testid="tab-agro-fields"><LandPlot size={15} />Полевые работы</button>
      <button type="button" className={`workspace-tab ${tab === "chemicals" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "chemicals"} onClick={() => setTab("chemicals")} data-testid="tab-agro-chemicals"><FlaskConical size={15} />Склад химии</button>
      {tokPay && <button type="button" className={`workspace-tab ${tab === "tokPay" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "tokPay"} onClick={() => setTab("tokPay")} data-testid="tab-agro-tok-payroll"><Coins size={15} />Зарплата тока</button>}
      {tokPay && <button type="button" className={`workspace-tab ${tab === "tokOrders" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "tokOrders"} onClick={() => setTab("tokOrders")} data-testid="tab-agro-tok-orders"><FileStack size={15} />Наряды тока</button>}
      {role === "general_director" && <button type="button" className={`workspace-tab ${tab === "dispatch" ? "workspace-tab-active" : ""}`} role="tab" aria-selected={tab === "dispatch"} onClick={() => setTab("dispatch")} data-testid="tab-agro-dispatch"><Route size={15} />Диспетчерская</button>}
    </div>
    <div role="tabpanel">{tab === "tokPay" && tokPay ? <TokPayrollWorkspace demo={demo} /> : tab === "tokOrders" && tokPay ? (demo ? <div className="surface-card empty-state" data-testid="status-tok-orders-demo"><h2 className="text-sm font-bold">Наряды тока недоступны в демо-режиме</h2><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Запросы к серверу в демо-режиме не выполняются.</p></div> : <PayrollRegisterWorkspace canManage sourceGroup="tok" />) : tab === "fields" ? <FieldsWorkspace role={role} /> : tab === "chemicals" ? <ChemicalWarehouse role={role} onOpenFields={() => setTab("fields")} /> : tab === "dispatch" && role === "general_director" ? <DispatcherWorkspace /> : <GrainBalance role={role} />}</div>
  </div>;
}
