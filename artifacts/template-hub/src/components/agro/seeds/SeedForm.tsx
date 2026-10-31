import { type ReactNode, useMemo, useRef, useState } from "react";
import { getGetFieldDashboardQueryKey, getGetGrainTransportTripsQueryKey, getListEmployeesQueryKey, getListPayrollAccrualsQueryKey, getListSupportingTasksQueryKey, useCreateSeedMovement, useGetFieldDashboard, useListEmployees, useListSupportingTasks, type GrainBalance as GrainBalanceRow, type GrainCrop, type GrainLocation, type SeedMovementInput, type SeedStock } from "@workspace/api-client-react";
import { isSowing } from "../fields/SeedPlanEditor";
import { Drawer, ErrorBox, Field, UNITS, type Unit, cx, dateFmt, errorInfo, isProcessor } from "../grain/shared";
import { useQueryClient } from "@tanstack/react-query";
import { eligibleSeedTasks, validateSeedTransport } from "./seedTask";
import { SEED_KIND_LABEL, kzt, newRequestId, parsePos, tn, useInvalidateSeeds } from "./shared";

type Kind = SeedMovementInput["kind"];

export default function SeedForm({ role, crops, locations, balances, stocks, asOfDate, defaultUnit, onClose, onDone, operationSwitcher }: {
  role: string; crops: GrainCrop[]; locations: GrainLocation[]; balances: GrainBalanceRow[]; stocks: SeedStock[]; asOfDate: string; defaultUnit: Unit; onClose: () => void; onDone: (msg: string) => void; operationSwitcher?: (busy: boolean) => ReactNode;
}) {
  const [f, setF] = useState({ kind: "receipt" as Kind, unit: defaultUnit, cropId: "", occurredOn: asOfDate, qty: "", price: "", invoiceNumber: "", supplier: "", fromLocationId: "", seasonId: "", operationId: "", notes: "", forTask: false, taskId: "", truckNumber: "", driverEmployeeId: "", basis: "per_trip" as "per_trip" | "ton_km", distanceKm: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [serverErr, setServerErr] = useState("");
  const reqRef = useRef<{ key: string; id: string } | null>(null);
  const create = useCreateSeedMovement();
  const invalidate = useInvalidateSeeds();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const gd = role === "general_director";

  const fd = useGetFieldDashboard({ query: { queryKey: getGetFieldDashboardQueryKey(), enabled: f.kind === "issue" } });
  const qc = useQueryClient();
  const taskParams = { service: "tok" as const };
  const tasksQ = useListSupportingTasks(taskParams, { query: { queryKey: getListSupportingTasksQueryKey(taskParams), enabled: f.kind === "issue" && !!f.seasonId, refetchInterval: 20000 } });
  const empQ = useListEmployees({ query: { queryKey: getListEmployeesQueryKey(), enabled: f.kind === "issue" } });
  const drivers = useMemo(() => (empQ.data ?? []).filter((e) => e.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")), [empQ.data]);
  const cropId = Number(f.cropId) || 0;
  const crop = crops.find((c) => c.id === cropId);
  const stock = stocks.find((s) => s.unit === f.unit && s.cropId === cropId);

  const sources = useMemo(() => {
    const byLoc = new Map<number, number>();
    for (const b of balances) if (b.unit === f.unit && b.cropId === cropId && (b.stockKind ?? "grain") === "grain") byLoc.set(b.locationId, (byLoc.get(b.locationId) ?? 0) + b.quantityTons);
    return locations.filter((l) => l.unit === f.unit && !isProcessor(l.kind) && (byLoc.get(l.id) ?? 0) > 0.0005).map((l) => ({ loc: l, tons: byLoc.get(l.id) ?? 0 }));
  }, [balances, locations, f.unit, cropId]);
  const srcTons = sources.find((s) => String(s.loc.id) === f.fromLocationId)?.tons ?? 0;

  const seasons = useMemo(() => {
    const d = fd.data; if (!d) return [];
    const fields = new Map(d.fields.filter((x) => x.unit === f.unit && x.isActive).map((x) => [x.id, x]));
    return d.seasons.filter((s) => fields.has(s.fieldId)).map((s) => ({ s, field: fields.get(s.fieldId)! }))
      .sort((a, b) => b.s.year - a.s.year || a.field.number.localeCompare(b.field.number, "ru", { numeric: true }));
  }, [fd.data, f.unit]);
  const season = seasons.find((x) => String(x.s.id) === f.seasonId);
  const ops = useMemo(() => (fd.data?.operations ?? []).filter((o) => String(o.seasonId) === f.seasonId && o.status !== "cancelled" && !o.voidedAt && (o.approvalStatus ?? "approved") === "approved" && isSowing(o.name)), [fd.data, f.seasonId]);
  const tasks = useMemo(() => eligibleSeedTasks(tasksQ.data ?? [], season?.s, ops), [tasksQ.data, season, ops]);
  const task = f.forTask ? tasks.find((t) => String(t.id) === f.taskId) : undefined;
  const pickTask = (id: string) => { const t = tasks.find((x) => String(x.id) === id); setF((p) => ({ ...p, taskId: id, operationId: t ? String(t.operationId) : "" })); };
  const cropMismatch = season && crop && season.s.cropName.trim().toLowerCase() !== crop.name.trim().toLowerCase();

  const qtyParsed = parsePos(f.qty, 3, 1e6);
  const priceParsed = parsePos(f.price, 2, 1e9);
  const estIssue = f.kind === "issue" && stock && qtyParsed.value ? qtyParsed.value * stock.pricePerTon : null;

  const changeKind = (k: Kind) => { setF((p) => ({ ...p, kind: k, price: "", invoiceNumber: "", supplier: "", fromLocationId: "", seasonId: "", operationId: "", forTask: false, taskId: "" })); setErrs({}); setServerErr(""); };
  const changeUnit = (u: Unit) => setF((p) => ({ ...p, unit: u, fromLocationId: "", seasonId: "", operationId: "", forTask: false, taskId: "" }));

  const submit = async () => {
    if (create.isPending) return;
    const e: Record<string, string> = {};
    if (!cropId) e.cropId = "Выберите культуру";
    if (!f.occurredOn) e.occurredOn = "Укажите дату";
    else if (f.occurredOn > asOfDate) e.occurredOn = "Дата не может быть в будущем";
    if (qtyParsed.err) e.qty = qtyParsed.err;
    if (f.kind !== "issue" && priceParsed.err) e.price = priceParsed.err;
    if (f.kind === "receipt") { if (!f.invoiceNumber.trim()) e.invoiceNumber = "Укажите номер накладной"; if (!f.supplier.trim()) e.supplier = "Укажите поставщика"; }
    if (f.kind === "from_grain") { if (!f.fromLocationId) e.fromLocationId = "Выберите место хранения зерна"; else if (qtyParsed.value && qtyParsed.value > srcTons + 1e-9) e.qty = `Доступно зерна: ${tn(srcTons)}`; }
    if (f.kind === "issue") { if (!f.seasonId) e.seasonId = "Выберите поле и сезон"; const av = stock?.quantityTons ?? 0; if (qtyParsed.value && qtyParsed.value > av + 1e-9) e.qty = `Доступно семян: ${tn(av)}`; if (f.forTask && !task) e.taskId = "Выберите задание в исполнении"; Object.assign(e, validateSeedTransport(f, f.forTask).errors); }
    setErrs(e); if (Object.keys(e).length) return;
    const base: Omit<SeedMovementInput, "requestId"> = { unit: f.unit, cropId, kind: f.kind, occurredOn: f.occurredOn, quantityTons: qtyParsed.value!, ...(f.notes.trim() ? { notes: f.notes.trim() } : {}) };
    if (f.kind === "receipt") Object.assign(base, { pricePerTon: priceParsed.value!, invoiceNumber: f.invoiceNumber.trim(), supplier: f.supplier.trim() });
    if (f.kind === "from_grain") Object.assign(base, { pricePerTon: priceParsed.value!, fromLocationId: Number(f.fromLocationId) });
    if (f.kind === "issue") Object.assign(base, { seasonId: Number(f.seasonId), operationId: f.operationId ? Number(f.operationId) : null, ...(task ? { supportingTaskId: task.id } : {}), ...(validateSeedTransport(f, !!task).payload ?? {}) });
    const key = JSON.stringify(base);
    if (!reqRef.current || reqRef.current.key !== key) reqRef.current = { key, id: newRequestId() };
    setServerErr("");
    try {
      await create.mutateAsync({ data: { ...base, requestId: reqRef.current.id } });
      reqRef.current = null;
      onDone(`${SEED_KIND_LABEL[f.kind]}: ${tn(base.quantityTons)} ${gd ? "проведено" : "отправлено на согласование"}`);
      onClose();
    } catch (err) { setServerErr(errorInfo(err).message); }
    finally { void invalidate(); void qc.invalidateQueries({ queryKey: getGetGrainTransportTripsQueryKey() }); void qc.invalidateQueries({ queryKey: getListPayrollAccrualsQueryKey({ sourceGroup: "motor_pool" }) }); }
  };

  return (
    <Drawer title="Операция склада семян" eyebrow={gd ? "Проводится сразу" : "Требует согласования заведующего током"} onClose={onClose} testId="drawer-seed-form"
      footer={<><button type="button" className="button button-ghost" onClick={onClose} data-testid="button-seed-cancel">Отмена</button>
        <button type="button" className="button button-primary" disabled={create.isPending} onClick={() => void submit()} data-testid="button-seed-submit">{create.isPending ? "Сохранение…" : "Сохранить"}</button></>}>
      {operationSwitcher?.(create.isPending)}
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border p-0.5" role="radiogroup">
        {(["receipt", "from_grain", "issue"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => changeKind(k)} data-testid={`button-seed-kind-${k}`}
            className={cx("rounded-md px-2 py-1.5 text-[11px] font-bold", f.kind === k ? "bg-[hsl(203_87%_33%)] text-white" : "text-muted-foreground")}>{SEED_KIND_LABEL[k]}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Хозяйство" htmlFor="seed-unit"><select id="seed-unit" className="text-input" value={f.unit} onChange={(e) => changeUnit(e.target.value as Unit)} data-testid="select-seed-unit">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Культура" htmlFor="seed-crop" error={errs.cropId} hint={stock ? <span data-testid="text-seed-available">На складе семян: <b className="font-mono">{tn(stock.quantityTons)}</b> · ср. {kzt(stock.pricePerTon)}/т</span> : cropId ? "Семян этой культуры нет" : undefined}>
          <select id="seed-crop" className="text-input" value={f.cropId} onChange={(e) => setF((p) => ({ ...p, cropId: e.target.value, fromLocationId: "" }))} data-testid="select-seed-crop"><option value="">Выберите</option>{crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Дата" htmlFor="seed-date" error={errs.occurredOn}><input id="seed-date" type="date" max={asOfDate} className="text-input" value={f.occurredOn} onChange={(e) => set("occurredOn", e.target.value)} data-testid="input-seed-date" /></Field>
        <Field label="Количество, т" htmlFor="seed-qty" error={errs.qty}><input id="seed-qty" inputMode="decimal" className="text-input font-mono" placeholder="0,000" value={f.qty} onChange={(e) => set("qty", e.target.value)} data-testid="input-seed-qty" /></Field>

        {f.kind === "receipt" && <>
          <Field label="Номер накладной" htmlFor="seed-inv" error={errs.invoiceNumber}><input id="seed-inv" maxLength={100} className="text-input" value={f.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} data-testid="input-seed-invoice" /></Field>
          <Field label="Поставщик" htmlFor="seed-sup" error={errs.supplier}><input id="seed-sup" maxLength={200} className="text-input" value={f.supplier} onChange={(e) => set("supplier", e.target.value)} data-testid="input-seed-supplier" /></Field>
        </>}
        {f.kind === "from_grain" && (
          <Field label="Откуда зерно" htmlFor="seed-from" error={errs.fromLocationId} wide hint={f.fromLocationId ? <span data-testid="text-seed-source-available">Доступно зерна: <b className="font-mono">{tn(srcTons)}</b></span> : "Склады, тока и элеватор с положительным остатком зерна"}>
            <select id="seed-from" className="text-input" value={f.fromLocationId} onChange={(e) => set("fromLocationId", e.target.value)} disabled={!cropId} data-testid="select-seed-from">
              <option value="">{!cropId ? "Сначала выберите культуру" : sources.length ? "Выберите место" : "Нет зерна этой культуры в хозяйстве"}</option>
              {sources.map(({ loc, tons }) => <option key={loc.id} value={loc.id}>{loc.name} · {tn(tons)}</option>)}
            </select></Field>
        )}
        {f.kind !== "issue" && (
          <Field label={f.kind === "receipt" ? "Цена за тонну, ₸" : "Оценочная стоимость за тонну, ₸"} htmlFor="seed-price" error={errs.price}
            hint={qtyParsed.value && priceParsed.value ? <span>Сумма: <b className="font-mono">{kzt(qtyParsed.value * priceParsed.value)}</b></span> : undefined}>
            <input id="seed-price" inputMode="decimal" className="text-input font-mono" value={f.price} onChange={(e) => set("price", e.target.value)} data-testid="input-seed-price" /></Field>
        )}
        {f.kind === "issue" && <>
          <Field label="Поле и сезон" htmlFor="seed-season" error={errs.seasonId} wide hint={cropMismatch ? `Внимание: в сезоне культура «${season!.s.cropName}», выбрана «${crop!.name}»` : undefined}>
            {fd.isLoading ? <div className="skeleton h-[38px] rounded-lg" data-testid="status-seed-seasons-loading" />
              : fd.isError ? <div className="flex items-center gap-2 text-[11px] text-destructive" data-testid="status-seed-seasons-error">Не удалось загрузить поля<button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => fd.refetch()}>Повторить</button></div>
              : <select id="seed-season" className="text-input" value={f.seasonId} onChange={(e) => setF((p) => ({ ...p, seasonId: e.target.value, operationId: "", forTask: false, taskId: "" }))} data-testid="select-seed-season">
                <option value="">{seasons.length ? "Выберите сезон" : "Нет сезонов в хозяйстве"}</option>
                {seasons.map(({ s, field }) => <option key={s.id} value={s.id}>Поле {field.number} · {s.cropName}{s.variety ? ` (${s.variety})` : ""} · {s.year}</option>)}
              </select>}
          </Field>
          {f.seasonId && <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2.5 sm:col-span-2" data-testid="section-seed-task">
            <label className="flex items-center gap-2 text-[12px] font-bold"><input type="checkbox" checked={f.forTask} onChange={(e) => setF((p) => ({ ...p, forTask: e.target.checked, taskId: "", operationId: e.target.checked ? "" : p.operationId }))} data-testid="checkbox-seed-for-task" />Семена для действующего задания</label>
            {f.forTask && (tasksQ.isLoading ? <div className="skeleton h-[38px] rounded-lg" />
              : tasksQ.isError ? <div className="flex items-center gap-2 text-[11px] text-destructive">Не удалось загрузить задания<button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => void tasksQ.refetch()} data-testid="button-seed-tasks-retry">Повторить</button></div>
              : <Field label="Задание в исполнении (ток)" htmlFor="seed-task" error={errs.taskId}>
                <select id="seed-task" className="text-input" value={f.taskId} onChange={(e) => pickTask(e.target.value)} data-testid="select-seed-task">
                  <option value="">{tasks.length ? "Выберите задание" : "Нет заданий в исполнении по этому полю"}</option>
                  {tasks.map((t) => <option key={t.id} value={t.id}>№ {t.id} · {t.title} · поле {t.fieldNumber} · {t.operationName}</option>)}
                </select></Field>)}
          </div>}
          <Field label={task ? "Операция посева (из задания)" : "Операция посева (необязательно)"} htmlFor="seed-op" wide>
            <select id="seed-op" className="text-input" value={f.operationId} onChange={(e) => set("operationId", e.target.value)} disabled={!f.seasonId || f.forTask} data-testid="select-seed-operation">
              <option value="">{!f.seasonId ? "Сначала выберите сезон" : ops.length ? "Без привязки к операции" : "Посевных операций нет"}</option>
              {ops.map((o) => <option key={o.id} value={o.id}>{o.name} · {dateFmt(o.actualStart ?? o.plannedStart)}</option>)}
            </select></Field>
          <div className="grid gap-3 rounded-lg border border-border p-2.5 sm:col-span-2 sm:grid-cols-2" data-testid="section-seed-transport">
            <p className="text-[11px] font-bold sm:col-span-2">Доставка семян · Автобаза <span className="font-normal text-muted-foreground">{f.forTask ? "(обязательно для задания)" : "(необязательно — машина и водитель вместе)"}</span></p>
            <Field label="Машина" htmlFor="seed-truck" error={errs.truckNumber}><input id="seed-truck" maxLength={50} className="text-input font-mono" value={f.truckNumber} onChange={(e) => set("truckNumber", e.target.value)} data-testid="input-seed-truck" /></Field>
            <Field label="Водитель" htmlFor="seed-driver" error={errs.driverEmployeeId}><select id="seed-driver" className="text-input" value={f.driverEmployeeId} onChange={(e) => set("driverEmployeeId", e.target.value)} data-testid="select-seed-driver"><option value="">{empQ.isLoading ? "Загрузка…" : empQ.isError ? "Ошибка загрузки сотрудников" : "Не указан"}</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}{d.position ? ` · ${d.position}` : ""}</option>)}</select></Field>
            <Field label="Оплата" htmlFor="seed-basis"><select id="seed-basis" className="text-input" value={f.basis} onChange={(e) => set("basis", e.target.value as "per_trip" | "ton_km")} data-testid="select-seed-basis"><option value="per_trip">За рейс</option><option value="ton_km">За тонно-км</option></select></Field>
            {f.basis === "ton_km" && <Field label="Расстояние, км" htmlFor="seed-dist" error={errs.distanceKm}><input id="seed-dist" inputMode="decimal" className="text-input font-mono" value={f.distanceKm} onChange={(e) => set("distanceKm", e.target.value)} data-testid="input-seed-distance" /></Field>}
          </div>
          <div className="rounded-lg border border-[hsl(39_100%_52%/.4)] bg-[hsl(39_100%_52%/.08)] p-2.5 text-[11px] leading-5 sm:col-span-2" data-testid="text-seed-issue-estimate">
            Стоимость рассчитывается по средней цене склада семян.{estIssue !== null ? <> Оценка: <b className="font-mono">{kzt(estIssue)}</b>.</> : null}{!gd && " До согласования сумма предварительная."}
          </div>
        </>}
        <Field label="Примечание" htmlFor="seed-notes" wide><textarea id="seed-notes" rows={2} maxLength={3000} className="text-input" value={f.notes} onChange={(e) => set("notes", e.target.value)} data-testid="input-seed-notes" /></Field>
      </div>
      <ErrorBox message={serverErr} testId="text-seed-form-error" />
    </Drawer>
  );
}
