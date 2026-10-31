import { GetGpsWorkAreaQueryParams, GetGpsWorkAreaResponse } from "@workspace/api-zod";

/** No provider is connected yet. Never substitute manually entered hectares for telemetry. */
export function parseGpsSelection(query: Record<string, unknown>) {
  for (const key of ["equipmentId", "implement", "startsAt", "endsAt"]) {
    if (typeof query[key] !== "string" || !(query[key] as string).trim()) {
      throw new Error("Выберите технику, агрегат и обе границы периода.");
    }
  }
  const parsed = GetGpsWorkAreaQueryParams.safeParse({
    ...query, implement: (query.implement as string).trim(),
  });
  if (!parsed.success || !Number.isSafeInteger(parsed.data.equipmentId)) {
    throw new Error("Проверьте технику и название агрегата (до 200 символов).");
  }
  const input = parsed.data;
  // Explicit offset is mandatory: the server must not guess the operator's timezone.
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  const start = Date.parse(input.startsAt);
  const end = Date.parse(input.endsAt);
  if (!iso.test(input.startsAt) || !iso.test(input.endsAt) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Укажите корректный период: окончание позже начала, время — с часовым поясом.");
  }
  return { ...input, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}

export function disconnectedGpsResult(selection: ReturnType<typeof parseGpsSelection>) {
  return GetGpsWorkAreaResponse.parse({
    ...selection,
    status: "not_connected",
    areaHa: null,
    source: "autograph",
    message: "АвтоГРАФ пока не подключён. Данные GPS о выполненной площади недоступны. Выбранные техника, агрегат и период готовы для запроса после подключения.",
  });
}
