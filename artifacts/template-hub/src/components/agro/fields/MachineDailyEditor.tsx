import type { FieldMachineAssignment, FieldMachineReport } from "@workspace/api-client-react";
import { haStr, parseHa } from "./shared";

export type MachineDailyRow = FieldMachineAssignment & { area: string; rate: string };
export function dailyMachineRows(rows: FieldMachineAssignment[], reports?: FieldMachineReport[], rate?: number | null): MachineDailyRow[] {
  return rows.map(r => {
    const saved = reports?.find(s => s.equipmentId === r.equipmentId);
    return { ...r, area: saved ? haStr(saved.dailyAreaHa) : "", rate: String(saved?.ratePerHa ?? rate ?? "") };
  });
}
export function collectMachineReports(rows: MachineDailyRow[]): { reports: FieldMachineReport[]; area: number | null; error: string } {
  let areaAres = 0;
  const reports: FieldMachineReport[] = [];
  for (const r of rows) {
    const area = r.area.trim() ? parseHa(r.area) : null;
    const rate = Number(r.rate.replace(",", "."));
    if (area === null || !r.rate.trim() || !Number.isFinite(rate) || rate <= 0 || rate > 1e9
      || Math.abs(rate * 100 - Math.round(rate * 100)) > 0.00001)
      return { reports: [], area: null, error: "Для каждой машины укажите гектары (можно 0) и положительную ставку до 0,01 ₸/га." };
    areaAres += Math.round(area * 100);
    reports.push({ equipmentId: r.equipmentId, employeeId: r.employeeId, equipmentName: r.equipmentName,
      employeeName: r.employeeName, implement: r.implement, dailyAreaHa: area, ratePerHa: rate });
  }
  return { reports, area: areaAres / 100, error: "" };
}

export function MachineDailyEditor({ rows, onChange, areaLocked, error }: {
  rows: MachineDailyRow[]; onChange: (r: MachineDailyRow[]) => void; areaLocked: boolean; error?: string;
}) {
  return <section className="space-y-3 rounded-lg border border-border p-3" data-testid="daily-machine-reports">
    <h3 className="text-xs font-bold">Выполненная работа по каждой технике</h3>
    <p className="text-[11px] text-muted-foreground">Введите площадь каждой машины, а не общую площадь для всех. Если машина не работала — укажите 0 га.</p>
    {rows.map((r, i) => <div key={r.equipmentId} className="space-y-2 rounded-md border border-border p-3" data-testid={`daily-machine-${r.equipmentId}`}>
      <p className="text-xs font-semibold">{r.equipmentName} · {r.employeeName}</p>
      <p className="text-[11px] text-muted-foreground">{r.implement}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">Выполнено за день, га<input className="text-input mt-1 font-mono" inputMode="decimal" value={r.area} readOnly={areaLocked}
          onChange={e => onChange(rows.map((x, j) => j === i ? { ...x, area: e.target.value } : x))} data-testid={`daily-machine-area-${i + 1}`} /></label>
        <label className="text-xs">Ставка, ₸/га<input className="text-input mt-1 font-mono" inputMode="decimal" value={r.rate}
          onChange={e => onChange(rows.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} data-testid={`daily-machine-rate-${i + 1}`} /></label>
      </div>
      <p className="text-xs">Начислено: {Number.isFinite(Number(r.area.replace(",", ".")) * Number(r.rate.replace(",", "."))) ? (Math.round(Number(r.area.replace(",", ".")) * Number(r.rate.replace(",", ".")) * 100) / 100).toLocaleString("ru-RU") : "—"} ₸</p>
    </div>)}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>;
}
