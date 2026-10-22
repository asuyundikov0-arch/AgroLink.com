import { useState } from "react";
import { useCreateGrainCrop, useCreateGrainLocation, type GrainCrop, type GrainLocation } from "@workspace/api-client-react";
import { ErrorBox, KIND_LABEL, UNITS, type Unit, errorInfo, useInvalidateGrain } from "./shared";

export default function Directory({ crops, locations, canEdit }: { crops: GrainCrop[]; locations: GrainLocation[]; canEdit: boolean }) {
  const [crop, setCrop] = useState("");
  const [loc, setLoc] = useState({ name: "", kind: "warehouse" as GrainLocation["kind"], unit: UNITS[0] as Unit });
  const [cErr, setCErr] = useState(""); const [lErr, setLErr] = useState("");
  const cm = useCreateGrainCrop(); const lm = useCreateGrainLocation();
  const invalidate = useInvalidateGrain();
  const addCrop = () => { if (!crop.trim()) { setCErr("Введите название"); return; } setCErr(""); cm.mutate({ data: { name: crop.trim() } }, { onSuccess: () => { setCrop(""); invalidate(); }, onError: (e) => setCErr(errorInfo(e).message) }); };
  const addLoc = () => { if (!loc.name.trim()) { setLErr("Введите название"); return; } setLErr(""); lm.mutate({ data: { ...loc, name: loc.name.trim() } }, { onSuccess: () => { setLoc((p) => ({ ...p, name: "" })); invalidate(); }, onError: (e) => setLErr(errorInfo(e).message) }); };
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="surface-card p-4">
        <p className="eyebrow">Культуры ({crops.length})</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">{crops.map((c) => <li key={c.id} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold" data-testid={`text-crop-${c.id}`}>{c.name}</li>)}</ul>
        {canEdit && <div className="mt-4 space-y-2" data-testid="form-add-crop">
          <div className="flex gap-2"><input aria-label="Новая культура" className="text-input min-w-0 flex-1" maxLength={100} value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Например, ячмень" data-testid="input-crop-name" />
            <button type="button" className="button button-primary" onClick={addCrop} disabled={cm.isPending} data-testid="button-add-crop">Добавить</button></div>
          <ErrorBox message={cErr} testId="error-add-crop" /></div>}
      </div>
      <div className="surface-card p-4">
        <p className="eyebrow">Места хранения ({locations.length})</p>
        <ul className="mt-2 space-y-1">{locations.map((l) => <li key={l.id} className="text-xs" data-testid={`text-location-${l.id}`}><b>{l.name}</b> <span className="text-muted-foreground">— {KIND_LABEL[l.kind]} · {l.unit}</span></li>)}</ul>
        {canEdit && <div className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="form-add-location">
          <input aria-label="Название места" className="text-input sm:col-span-2" maxLength={100} value={loc.name} onChange={(e) => setLoc((p) => ({ ...p, name: e.target.value }))} placeholder="Например, Склад 3" data-testid="input-location-name" />
          <select aria-label="Тип места" className="text-input" value={loc.kind} onChange={(e) => setLoc((p) => ({ ...p, kind: e.target.value as GrainLocation["kind"] }))} data-testid="select-location-kind">{(Object.keys(KIND_LABEL) as GrainLocation["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
          <select aria-label="Хозяйство" className="text-input" value={loc.unit} onChange={(e) => setLoc((p) => ({ ...p, unit: e.target.value as Unit }))} data-testid="select-location-unit">{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          <button type="button" className="button button-primary sm:col-span-2 justify-center" onClick={addLoc} disabled={lm.isPending} data-testid="button-add-location">Добавить место</button>
          <div className="sm:col-span-2"><ErrorBox message={lErr} testId="error-add-location" /></div></div>}
        {!canEdit && <p className="mt-3 text-[11px] text-muted-foreground">Справочники пополняют главный агроном, директор хозяйства и генеральный директор.</p>}
      </div>
    </section>
  );
}
