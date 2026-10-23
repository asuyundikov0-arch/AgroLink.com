import { useMemo, useState, type ReactNode } from "react";
import { Boxes, ClipboardCheck, Wrench } from "lucide-react";
import {
  type FleetEquipment,
  getListFleetEquipmentQueryKey,
  useListFleetEquipment,
} from "@workspace/api-client-react";
import RepairDashboard from "./RepairDashboard";
import SparePartsWarehouse from "./SparePartsWarehouse";
import { POLL_MS, SectionError, errorInfo } from "./repairs/shared";

export default function EngineeringWorkspace({ role, children }: { role: string; children: ReactNode }) {
  const [tab, setTab] = useState<"repairs" | "warehouse" | "documents">("repairs");
  return (
    <div>
      <div className="mb-7 flex flex-wrap gap-2" role="tablist" aria-label="Разделы инженерного блока">
        <button type="button" role="tab" aria-selected={tab === "repairs"} aria-controls="engineering-panel"
          className={`workspace-tab ${tab === "repairs" ? "workspace-tab-active" : ""}`}
          onClick={() => setTab("repairs")} data-testid="tab-engineering-repairs">
          <Wrench size={15} />Ремонт техники
        </button>
        <button type="button" role="tab" aria-selected={tab === "warehouse"} aria-controls="engineering-panel"
          className={`workspace-tab ${tab === "warehouse" ? "workspace-tab-active" : ""}`}
          onClick={() => setTab("warehouse")} data-testid="tab-engineering-warehouse">
          <Boxes size={15} />Склад запчастей
        </button>
        <button type="button" role="tab" aria-selected={tab === "documents"} aria-controls="engineering-panel"
          className={`workspace-tab ${tab === "documents" ? "workspace-tab-active" : ""}`}
          onClick={() => setTab("documents")} data-testid="tab-engineering-documents">
          <ClipboardCheck size={15} />Шаблоны и документы
        </button>
      </div>
      <div id="engineering-panel" role="tabpanel">
        {tab === "repairs" ? <RepairDashboard role={role} />
          : tab === "warehouse" ? <WarehousePanel role={role} />
            : children}
      </div>
    </div>
  );
}

function WarehousePanel({ role }: { role: string }) {
  const fleetQuery = useListFleetEquipment({
    query: { queryKey: getListFleetEquipmentQueryKey(), refetchInterval: POLL_MS },
  });
  const fleet = fleetQuery.data ?? [];
  const fleetById = useMemo(() => new Map<number, FleetEquipment>(fleet.map((item) => [item.id, item])), [fleet]);

  if (fleetQuery.isLoading) {
    return <div className="space-y-3" data-testid="status-warehouse-fleet-loading"><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-64 rounded-xl" /></div>;
  }
  if (fleetQuery.isError) {
    return <div className="surface-card"><SectionError text={errorInfo(fleetQuery.error).message} onRetry={() => { void fleetQuery.refetch(); }} testId="status-warehouse-fleet-error" /></div>;
  }
  return <SparePartsWarehouse role={role} fleet={fleet} fleetById={fleetById} />;
}
