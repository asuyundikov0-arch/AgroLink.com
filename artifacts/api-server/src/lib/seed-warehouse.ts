import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db, seedMovementsTable as seeds, grainMovementsTable as grain, grainCropsTable as crops,
  grainLocationsTable as locations, fieldSeasonsTable as seasons, agroFieldsTable as fields,
  fieldOperationsTable as operations, activityTable,
} from "@workspace/db";
import type { SeedMovementInput } from "@workspace/api-zod";
import type { RoleAccess } from "../middlewares/auth";
import { calculateGrainLedger, grainBusinessDate, toGrainKg, validGrainDate } from "./grain-ledger";
import { isSeedingOperation } from "./daily-seeding";
import { roundRatio, seedBalances, seedCheck, seedIssueCost } from "./seed-ledger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = typeof seeds.$inferSelect;
const actor = (a: RoleAccess) => `${a.displayName} · ${a.role}`;
const positiveId = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0;
// Same lock as commodity grain: conversion is atomic across both ledgers.
const lock = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(718392005)`);

async function valueForPosting(tx: Tx, row: Row) {
  if (row.kind === "issue") {
    const [season] = await tx.select().from(seasons).where(eq(seasons.id, row.seasonId!)).for("share");
    const [field] = season ? await tx.select().from(fields).where(eq(fields.id, season.fieldId)).for("share") : [];
    seedCheck(field && field.isActive && field.unit === row.unit &&
      season.year === Number(row.occurredOn.slice(0, 4)),
    "Поле или сезон выдачи изменены. Отклоните запись и оформите новую.", 409);
    if (row.operationId) {
      const [operation] = await tx.select().from(operations).where(eq(operations.id, row.operationId)).for("share");
      seedCheck(operation && operation.seasonId === season.id && !operation.voidedAt &&
        operation.approvalStatus === "approved" && isSeedingOperation(operation.name),
      "Операция посева изменена или отменена. Отклоните запись и оформите новую.", 409);
    }
  }
  const rows = await tx.select().from(seeds).where(and(eq(seeds.unit, row.unit), eq(seeds.cropId, row.cropId)));
  const stock = seedBalances(rows.filter(r => r.id !== row.id)).get(`${row.unit}\0${row.cropId}`);
  seedCheck(!stock || row.occurredOn >= stock.latestDate,
    "Движение семян не может быть раньше последнего проведённого движения этой культуры. Выберите более позднюю дату.", 409);
  const values = row.kind === "issue" ? seedIssueCost(stock, row.quantityKg)
    : { amountCents: BigInt(row.amountCents), pricePerTonCents: BigInt(row.pricePerTonCents) };
  seedCheck(values.amountCents <= 100_000_000_000_000n, "Сумма движения слишком велика.");
  if (row.grainMovementId) {
    const grainRows = await tx.select().from(grain).where(and(eq(grain.unit, row.unit), eq(grain.cropId, row.cropId)));
    const linked = grainRows.find(r => r.id === row.grainMovementId);
    seedCheck(linked && !linked.voidedAt, "Связанное перемещение зерна не найдено.", 409);
    const ledger = calculateGrainLedger(grainRows.map(r =>
      r.id === row.grainMovementId ? { ...r, approvalStatus: "approved" } : r));
    seedCheck(!ledger.issue, "Недостаточно товарного зерна в выбранном месте хранения на дату перемещения.", 409);
  }
  // Validate aggregate balance bounds too before committing a receipt.
  seedBalances([...rows.filter(r => r.id !== row.id), {
    ...row, approvalStatus: "approved", amountCents: values.amountCents.toString(),
  }]);
  return { amountCents: values.amountCents.toString(), pricePerTonCents: values.pricePerTonCents.toString() };
}

export async function submitSeedMovement(tx: Tx, input: SeedMovementInput, access: RoleAccess) {
  seedCheck(["weigher", "general_director"].includes(access.role ?? ""), "Движения семян вносит весовщица.", 403);
  seedCheck(/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId), "Некорректный идентификатор запроса.");
  seedCheck(positiveId(input.cropId), "Выберите культуру из справочника.");
  const kg = toGrainKg(input.quantityTons);
  seedCheck(kg !== null, "Укажите вес семян в тоннах, до трёх знаков после запятой.");
  seedCheck(validGrainDate(input.occurredOn) && input.occurredOn <= grainBusinessDate(), "Укажите корректную дату не позднее сегодняшней.");
  const normalized = {
    unit: input.unit, cropId: input.cropId, kind: input.kind, occurredOn: input.occurredOn, quantityKg: kg,
    pricePerTon: input.kind === "issue" ? null : input.pricePerTon ?? null,
    invoiceNumber: input.kind === "receipt" ? input.invoiceNumber?.trim() ?? "" : "",
    supplier: input.kind === "receipt" ? input.supplier?.trim() ?? "" : "",
    fromLocationId: input.kind === "from_grain" ? input.fromLocationId ?? null : null,
    seasonId: input.kind === "issue" ? input.seasonId ?? null : null,
    operationId: input.kind === "issue" ? input.operationId ?? null : null,
    notes: input.notes?.trim() ?? "",
  };
  const fingerprint = JSON.stringify(normalized);
  await lock(tx);
  const [existing] = await tx.select().from(seeds).where(eq(seeds.requestId, input.requestId));
  if (existing) {
    seedCheck(existing.createdByUserId === access.userId && existing.fingerprint === fingerprint,
      "Этот идентификатор уже использован для другого движения.", 409);
    return existing;
  }
  const [crop] = await tx.select().from(crops).where(eq(crops.id, input.cropId));
  seedCheck(crop, "Культура не найдена.");
  let amountCents = 0n, pricePerTonCents = 0n;
  let fieldNumber = "";
  if (input.kind !== "issue") {
    const price = input.pricePerTon;
    seedCheck(typeof price === "number" && Number.isFinite(price) && price > 0 && price <= 1e9 &&
      Math.abs(price * 100 - Math.round(price * 100)) < 0.0001,
    "Укажите цену или оценочную стоимость за тонну, до двух знаков после запятой.");
    pricePerTonCents = BigInt(Math.round(price * 100));
    amountCents = roundRatio(BigInt(kg) * pricePerTonCents, 1000n);
    seedCheck(amountCents > 0n, "Сумма движения должна быть не меньше 0,01 ₸.");
  }
  if (input.kind === "receipt") {
    seedCheck(normalized.invoiceNumber && normalized.supplier, "Укажите номер накладной и поставщика.");
  }
  if (input.kind === "issue") {
    seedCheck(positiveId(input.seasonId), "Выберите поле и сезон отправки семян.");
    const [season] = await tx.select().from(seasons).where(eq(seasons.id, input.seasonId!));
    const [field] = season ? await tx.select().from(fields).where(eq(fields.id, season.fieldId)) : [];
    seedCheck(field && field.unit === input.unit && field.isActive, "Выберите действующее поле выбранного хозяйства.");
    seedCheck(Number(input.occurredOn.slice(0, 4)) === season.year, "Дата отправки должна относиться к выбранному сезону поля.");
    fieldNumber = field.number;
    if (input.operationId != null) {
      seedCheck(positiveId(input.operationId), "Выберите корректную операцию.");
      const [operation] = await tx.select().from(operations).where(eq(operations.id, input.operationId));
      seedCheck(operation && operation.seasonId === season.id && !operation.voidedAt &&
        operation.approvalStatus === "approved" && isSeedingOperation(operation.name),
      "Для семян можно выбрать только согласованную операцию посева этого поля.");
    }
  }
  let grainMovementId: number | null = null;
  if (input.kind === "from_grain") {
    seedCheck(positiveId(input.fromLocationId), "Выберите склад товарного зерна.");
    const [source] = await tx.select().from(locations).where(eq(locations.id, input.fromLocationId!));
    seedCheck(source && source.unit === input.unit && !["dryer", "cleaner"].includes(source.kind),
      "Выберите место хранения товарного зерна в нужном хозяйстве.");
    const [move] = await tx.insert(grain).values({
      requestId: randomUUID(), unit: input.unit, cropId: input.cropId,
      operation: "seed_transfer", occurredOn: input.occurredOn, quantityKg: kg,
      fromLocationId: source.id, toLocationId: null, counterparty: "Склад семян",
      notes: normalized.notes, approvalStatus: "pending", createdByUserId: access.userId, createdBy: actor(access),
    }).returning();
    grainMovementId = move.id;
  }
  const { pricePerTon: _price, ...storageValues } = normalized;
  const [row] = await tx.insert(seeds).values({
    requestId: input.requestId, fingerprint, ...storageValues,
    pricePerTonCents: pricePerTonCents.toString(), amountCents: amountCents.toString(),
    grainMovementId, fieldNumber, createdByUserId: access.userId, createdBy: actor(access),
  }).returning();
  const values = await valueForPosting(tx, row);
  const automatic = access.role === "general_director";
  const [updated] = await tx.update(seeds).set({
    ...values, ...(automatic ? { approvalStatus: "approved", reviewedBy: actor(access), reviewedAt: new Date() } : {}),
  }).where(eq(seeds.id, row.id)).returning();
  if (grainMovementId && automatic) await tx.update(grain).set({
    approvalStatus: "approved", reviewedBy: actor(access), reviewedAt: new Date(),
  }).where(eq(grain.id, grainMovementId));
  await tx.insert(activityTable).values({
    action: automatic ? "Проведено движение семян" : "Движение семян отправлено заведующему током",
    templateName: `${crop.name} · ${input.quantityTons} т`, userName: actor(access),
  });
  return updated;
}

export async function reviewSeedMovement(tx: Tx, id: number, decision: "approved" | "rejected", note: string, access: RoleAccess) {
  seedCheck(["grain_manager", "general_director"].includes(access.role ?? ""), "Семена согласовывает заведующий током.", 403);
  await lock(tx);
  const [row] = await tx.select().from(seeds).where(eq(seeds.id, id)).for("update");
  seedCheck(row, "Движение семян не найдено.", 404);
  if (row.approvalStatus === decision) return row;
  seedCheck(row.approvalStatus === "pending", "Движение семян уже рассмотрено.", 409);
  const values = decision === "approved" ? await valueForPosting(tx, row) : {};
  const [updated] = await tx.update(seeds).set({
    ...values, approvalStatus: decision, reviewedBy: actor(access), reviewNote: note.trim(), reviewedAt: new Date(),
  }).where(eq(seeds.id, id)).returning();
  if (row.grainMovementId) await tx.update(grain).set({
    approvalStatus: decision, reviewedBy: actor(access), reviewComment: note.trim(), reviewedAt: new Date(),
  }).where(eq(grain.id, row.grainMovementId));
  await tx.insert(activityTable).values({
    action: decision === "approved" ? "Согласовано движение семян" : "Отклонено движение семян",
    templateName: `Семена · движение №${id}`, userName: actor(access),
  });
  return updated;
}
