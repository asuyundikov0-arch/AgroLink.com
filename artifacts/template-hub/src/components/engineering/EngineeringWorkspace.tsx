import { useMemo, useState } from "react";
import { Boxes, ClipboardList, Fuel, Wrench } from "lucide-react";
import {
  type FleetEquipment,
  getListFleetEquipmentQueryKey,
  useListFleetEquipment,
} from "@workspace/api-client-react";
import RepairDashboard from "./RepairDashboard";
import SparePartsWarehouse from "./SparePartsWarehouse";
import SparePartRequests from "./SparePartRequests";
import FuelDepot from "./FuelDepot";
import { POLL_MS, SectionError, errorInfo } from "./repairs/shared";

type EngineeringTab = "repairs" | "warehouse" | "requests" | "petroleum";
const PETROLEUM_ROLES = ["fuel_manager", "engineer", "chief_engineer", "general_director"];

export default function EngineeringWorkspace({ role, demoActive = false }: { role: string; demoActive?: boolean }) {
  const storekeeper = role === "storekeeper";
  const fuelOnly = role === "fuel_manager";
  const [tab, setTab] = useState<EngineeringTab>(fuelOnly ? "petroleum" : storekeeper ? "warehouse" : "repairs");
  const allTabs = [
    { id: "repairs" as const, label: "Ремонт техники", icon: Wrench },
    { id: "warehouse" as const, label: "Склад запчастей", icon: Boxes },
    { id: "requests" as const, label: "Заявки на запчасти", icon: ClipboardList },
    ...(PETROLEUM_ROLES.includes(role) ? [{ id: "petroleum" as const, label: "Нефтебаза", icon: Fuel }] : []),
  ];
  const tabs = fuelOnly ? allTabs.filter((item) => item.id === "petroleum") : allTabs;
  const active = fuelOnly ? "petroleum" : tab;
  return (
    <div>
      <div className="mb-7 flex flex-wrap gap-2" role="tablist" aria-label="Разделы инженерного блока">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={active === id} aria-controls="engineering-panel"
          className={`workspace-tab ${active === id ? "workspace-tab-active" : ""}`}
          onClick={() => setTab(id)} data-testid={`tab-engineering-${id}`}>
          <Icon size={15} />{label}
        </button>)}
      </div>
      <div id="engineering-panel" role="tabpanel">
        {active === "petroleum" ? <FuelDepot role={role} demoActive={demoActive} />
          : active === "repairs" ? <RepairDashboard role={role} />
            : active === "warehouse" ? <WarehousePanel role={role} />
              : <SparePartRequests role={role as "engineer" | "chief_engineer" | "general_director" | "storekeeper"} />}
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
