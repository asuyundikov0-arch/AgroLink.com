import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { agroFieldsTable, db, fieldBoundariesTable, fieldSeasonsTable, pool } from "@workspace/db";
import { parseKmlBoundary } from "./kml-boundaries";
import { importFieldBoundaries } from "./import-field-boundaries";

const square = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>НЕ ИМПОРТИРОВАТЬ КУЛЬТУРУ</name><Polygon>
<outerBoundaryIs><LinearRing><coordinates>70,50,0 70.01,50,0 70.01,50.01,0 70,50.01,0</coordinates></LinearRing></outerBoundaryIs>
</Polygon></Placemark></Document></kml>`;
after(() => pool.end());

test("KML import reads polygon only, closes its ring, strips altitude and calculates area", () => {
  const result = parseKmlBoundary(square);
  assert.equal(result.geometry.type, "Polygon");
  assert.equal(result.geometry.coordinates[0].length, 5);
  assert.deepEqual(result.geometry.coordinates[0][0], result.geometry.coordinates[0].at(-1));
  assert.equal(result.geometry.coordinates[0][0].length, 2);
  assert.ok(result.contourAreaHa > 70 && result.contourAreaHa < 90);
  assert.ok(!JSON.stringify(result).includes("НЕ ИМПОРТИРОВАТЬ"));
  assert.throws(() => parseKmlBoundary("<!DOCTYPE kml><kml/>"));
  assert.throws(() => parseKmlBoundary(square.replace("70.01,50.01", "190,50.01")));
  assert.throws(() => parseKmlBoundary("<kml><broken></kml>"));
});

test("all nine uploaded KML boundaries have usable, closed polygon rings", () => {
  const assets = new URL("../../../../attached_assets/", import.meta.url);
  const files = readdirSync(assets).filter(name => name.endsWith("_1793457000538.kml"));
  assert.equal(files.length, 9);
  for (const file of files) {
    const result = parseKmlBoundary(readFileSync(new URL(file, assets), "utf8"));
    assert.ok(result.contourAreaHa > 0, file);
    for (const ring of result.geometry.coordinates) {
      assert.deepEqual(ring[0], ring.at(-1), file);
      assert.ok(ring.every(point => point.length === 2));
    }
  }
});

test("boundary import is repeatable, preserves directory areas and crop history, and keeps 1/1 distinct", async () => {
  const unit = `map-${randomUUID()}`;
  const rollback = new Error("rollback field boundary fixtures");
  await assert.rejects(db.transaction(async tx => {
    const [existing] = await tx.insert(agroFieldsTable).values({
      number: "1", numberKey: "1", unit, areaAres: 12345, notes: "Не менять", updatedBy: unit,
    }).returning();
    const [season] = await tx.insert(fieldSeasonsTable).values({
      fieldId: existing.id, year: 2026, cropName: "Настоящий севооборот", areaAres: 12345, updatedBy: unit,
    }).returning();
    const records = ["1", "1/1"].map(number => ({ number, unit, kml: square }));
    await importFieldBoundaries(tx, records);
    await importFieldBoundaries(tx, records);
    const fields = await tx.select().from(agroFieldsTable).where(eq(agroFieldsTable.unit, unit));
    assert.equal(fields.length, 2);
    const kept = fields.find(field => field.id === existing.id)!;
    assert.equal(kept.areaAres, 12345);
    assert.equal(kept.notes, "Не менять");
    const added = fields.find(field => field.number === "1/1")!;
    assert.ok(added.areaAres > 0);
    assert.notEqual(added.numberKey, kept.numberKey);
    const boundaries = await tx.select().from(fieldBoundariesTable).innerJoin(agroFieldsTable,
      eq(fieldBoundariesTable.fieldId, agroFieldsTable.id)).where(eq(agroFieldsTable.unit, unit));
    assert.equal(boundaries.length, 2);
    const [keptSeason] = await tx.select().from(fieldSeasonsTable)
      .where(and(eq(fieldSeasonsTable.id, season.id), eq(fieldSeasonsTable.fieldId, existing.id)));
    assert.equal(keptSeason.cropName, "Настоящий севооборот");
    // A later restart must not resurrect original numbers after a legitimate directory edit.
    await importFieldBoundaries(tx, records, unit);
    await tx.update(agroFieldsTable).set({ number: "9", numberKey: "9" }).where(eq(agroFieldsTable.id, existing.id));
    await importFieldBoundaries(tx, records, unit);
    const afterRestart = await tx.select().from(agroFieldsTable).where(eq(agroFieldsTable.unit, unit));
    assert.equal(afterRestart.length, 2);
    assert.ok(!afterRestart.some(field => field.number === "1"));
    throw rollback;
  }), error => error === rollback);
});
