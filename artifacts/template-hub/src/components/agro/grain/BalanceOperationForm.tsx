import { type ComponentProps, useState } from "react";
import MovementForm from "./MovementForm";
import SeedForm from "../seeds/SeedForm";

export default function BalanceOperationForm({ grain, seeds, seedsReady }: {
  grain: ComponentProps<typeof MovementForm>; seeds: ComponentProps<typeof SeedForm>; seedsReady: boolean;
}) {
  const [material, setMaterial] = useState<"grain" | "seeds">("grain");
  const switcher = (busy: boolean) => <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Материал операции">
    {([["grain", "Зерно"], ["seeds", "Семена"]] as const).map(([key, label]) =>
      <button key={key} type="button" disabled={busy || (key === "seeds" && !seedsReady)} aria-pressed={material === key}
        onClick={() => setMaterial(key)} data-testid={`button-operation-material-${key}`}
        className={`rounded-md px-3 py-2 text-xs font-bold disabled:opacity-50 ${material === key ? "bg-foreground text-background" : "text-muted-foreground"}`}>{label}</button>)}
  </div>;
  return material === "grain" ? <MovementForm {...grain} operationSwitcher={switcher} /> : <SeedForm {...seeds} operationSwitcher={switcher} />;
}
