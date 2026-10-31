import { and, eq, sql } from "drizzle-orm";
import { agroFieldsTable, db, fieldBoundariesTable, fieldBoundaryImportsTable } from "@workspace/db";
import { fieldNumberKey } from "./field-planning";
import { parseKmlBoundary } from "./kml-boundaries";

export type FieldBoundaryImport = { number: string; unit: string; kml: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function importFieldBoundaries(tx: Tx, records: FieldBoundaryImport[], importKey?: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(718392012)`);
  if (importKey) {
    const imported = await tx.insert(fieldBoundaryImportsTable).values({ key: importKey })
      .onConflictDoNothing().returning();
    if (!imported.length) return;
  }
  for (const item of records) {
    const { geometry, contourAreaHa } = parseKmlBoundary(item.kml);
    const numberKey = fieldNumberKey(item.number);
    await tx.insert(agroFieldsTable).values({
      number: item.number, numberKey, unit: item.unit, areaAres: Math.round(contourAreaHa * 100),
      notes: "Площадь рассчитана по контуру KML; при необходимости уточните её в справочнике.",
      updatedBy: "Импорт границ полей",
    }).onConflictDoNothing({ target: [agroFieldsTable.unit, agroFieldsTable.numberKey] });
    const [field] = await tx.select({ id: agroFieldsTable.id }).from(agroFieldsTable)
      .where(and(eq(agroFieldsTable.unit, item.unit), eq(agroFieldsTable.numberKey, numberKey)));
    if (!field) throw new Error(`Не удалось привязать границу поля №${item.number}.`);
    await tx.insert(fieldBoundariesTable).values({
      fieldId: field.id, geometry, contourAreaHa: contourAreaHa.toFixed(2), source: "KML",
    }).onConflictDoNothing({ target: fieldBoundariesTable.fieldId });
  }
}
