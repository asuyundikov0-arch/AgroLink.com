type SeedingWork = {
  id: number;
  cropName: string;
  name: string;
  actualOperationName: string;
  actualStart: string | null;
  actualEnd: string | null;
  actualAreaAres: number;
  voidedAt: Date | string | null;
};
type Progress = { operationId: number; reportDate: string; cumulativeAreaAres: number };

export function isSeedingOperation(name: string) {
  return /^(посев|сев)(?:\s|$|[-:])/iu.test(name.normalize("NFKC").trim());
}

/** Integer ares throughout: a daily cumulative report contributes its increase only once. */
export function summarizeDailySeeding(operations: SeedingWork[], progress: Progress[], date: string) {
  const reportsByOperation = new Map<number, Progress[]>();
  for (const report of progress) {
    const reports = reportsByOperation.get(report.operationId) ?? [];
    reports.push(report);
    reportsByOperation.set(report.operationId, reports);
  }
  const crops = new Map<string, { cropName: string; dailyAres: number; totalAres: number }>();
  for (const operation of operations) {
    if (operation.voidedAt || !operation.actualStart || operation.actualStart > date
      || !isSeedingOperation(operation.actualOperationName || operation.name)) continue;
    let dailyAres = 0;
    let totalAres = 0;
    const reports = (reportsByOperation.get(operation.id) ?? []).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    if (reports.length) {
      let previous = 0;
      for (const report of reports) {
        if (report.reportDate > date) break;
        if (report.cumulativeAreaAres < previous) throw new Error("Накопительный факт посева меньше предыдущего отчёта.");
        if (report.reportDate === date) dailyAres += report.cumulativeAreaAres - previous;
        previous = report.cumulativeAreaAres;
        totalAres = previous;
      }
    } else if (operation.actualEnd && operation.actualEnd <= date) {
      totalAres = operation.actualAreaAres;
      if (operation.actualEnd === date) dailyAres = totalAres;
    }
    const key = operation.cropName.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
    const row = crops.get(key) ?? { cropName: operation.cropName.trim(), dailyAres: 0, totalAres: 0 };
    row.dailyAres += dailyAres;
    row.totalAres += totalAres;
    crops.set(key, row);
  }
  const rows = [...crops.values()].sort((a, b) => a.cropName.localeCompare(b.cropName, "ru"));
  return {
    crops: rows.map((row) => ({ cropName: row.cropName, dailyAreaHa: row.dailyAres / 100, totalAreaHa: row.totalAres / 100 })),
    dailyAreaHa: rows.reduce((sum, row) => sum + row.dailyAres, 0) / 100,
    totalAreaHa: rows.reduce((sum, row) => sum + row.totalAres, 0) / 100,
  };
}
