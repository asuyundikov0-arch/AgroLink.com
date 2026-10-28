import { type ChemicalDailyExpectation, type ChemicalWorkflow } from "@workspace/api-client-react";
import { cx, dateFmt } from "../grain/shared";
import { cqty } from "./Workflow";

const nf2 = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(v);
export const expectationOpen = (e: ChemicalDailyExpectation) => e.returnedQuantity < e.expectedQuantity - 0.0005;
export const openExpectations = (data?: ChemicalWorkflow) => (data?.dailyExpectations ?? []).filter(expectationOpen).length;

/** Daily expected chemical use by dispatcher hectares × norm vs empty containers returned. */
export function ExpectationsTable({ data, testId = "table-chem-expectations" }: { data: ChemicalWorkflow; testId?: string }) {
  const rows = [...(data.dailyExpectations ?? [])].sort((a, b) => Number(expectationOpen(b)) - Number(expectationOpen(a)) || b.reportDate.localeCompare(a.reportDate) || a.fieldNumber.localeCompare(b.fieldNumber, "ru", { numeric: true }));
  if (rows.length === 0) return <div className="px-4 py-8 text-center text-xs text-muted-foreground" data-testid={`${testId}-empty`}>Ожидаемого расхода пока нет. Строки появятся, когда диспетчер внесёт площадь за день по работе с химией.</div>;
  return <div className="overflow-x-auto" data-testid={testId}>
    <table className="w-full min-w-[900px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground">
      <th className="px-3 py-2.5">День</th><th className="px-3">Поле · хозяйство</th><th className="px-3">Препарат</th><th className="px-3 text-right">Га × норма</th><th className="px-3 text-right">Ожидается</th><th className="px-3 text-right">Тары, шт.</th><th className="px-3 text-right">Сдано</th><th className="px-3 text-right">Отклонение</th>
    </tr></thead>
      <tbody className="divide-y divide-border/70">{rows.map((e) => {
        const open = expectationOpen(e);
        const dev = e.deviationQuantity;
        return <tr key={`${e.operationId}-${e.batchId}-${e.reportDate}`} className={cx(open && "bg-[hsl(38_92%_50%/.06)]")} data-testid={`row-chem-expectation-${e.operationId}-${e.batchId}-${e.reportDate.slice(0, 10)}`}>
          <td className="px-3 py-2.5 font-mono">{dateFmt(e.reportDate)}</td>
          <td className="px-3"><b>№ {e.fieldNumber}</b><div className="text-[10px] text-muted-foreground">{e.farm}</div></td>
          <td className="px-3 font-semibold">{e.name}</td>
          <td className="px-3 text-right font-mono">{nf2(e.dailyAreaHa)} га × {cqty(e.ratePerHa)}</td>
          <td className="px-3 text-right font-mono font-bold">{cqty(e.expectedQuantity)} {e.unit}</td>
          <td className="px-3 text-right font-mono">{e.expectedContainerCount == null ? <span className="text-muted-foreground">тара не указана</span> : <>{nf2(e.expectedContainerCount)}{e.containerVolume ? <div className="text-[10px] text-muted-foreground">по {cqty(e.containerVolume)} {e.unit}</div> : null}</>}</td>
          <td className="px-3 text-right font-mono">{cqty(e.returnedQuantity)} {e.unit}<div className="text-[10px] text-muted-foreground">{e.returnedContainerCount} шт.</div></td>
          <td className={cx("px-3 text-right font-mono font-bold", dev < -0.0005 ? "text-[hsl(30_80%_32%)]" : dev > 0.0005 ? "text-destructive" : "text-[hsl(161_45%_30%)]")} data-testid={`text-chem-expectation-dev-${e.operationId}-${e.batchId}-${e.reportDate.slice(0, 10)}`}>
            {dev < -0.0005 ? `ещё ${cqty(-dev)} ${e.unit}` : dev > 0.0005 ? `сверх нормы ${cqty(dev)} ${e.unit}` : "сдано по норме"}
          </td>
        </tr>;
      })}</tbody></table>
  </div>;
}
