import { eq } from "drizzle-orm";
import { Router } from "express";
import { GetFieldMapResponse } from "@workspace/api-zod";
import { agroFieldsTable, db, fieldBoundariesTable } from "@workspace/db";
import { requireApprovedRole } from "../middlewares/auth";

const router = Router();
router.get("/agro/fields/map", requireApprovedRole, async (_req, res, next) => {
  if (!["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"].includes(res.locals.access.role)) {
    res.status(403).json({ error: "Карта доступна сотрудникам агроблока и генеральному директору." });
    return;
  }
  try {
    const rows = await db.select({ boundary: fieldBoundariesTable, field: agroFieldsTable })
      .from(fieldBoundariesTable).innerJoin(agroFieldsTable, eq(fieldBoundariesTable.fieldId, agroFieldsTable.id))
      .where(eq(agroFieldsTable.isActive, true));
    res.setHeader("Cache-Control", "private, no-store");
    res.json(GetFieldMapResponse.parse({
      boundaries: rows.map(({ boundary, field }) => ({
        fieldId: field.id, fieldNumber: field.number, unit: field.unit, areaHa: field.areaAres / 100,
        contourAreaHa: Number(boundary.contourAreaHa), geometry: boundary.geometry,
      })).sort((a, b) => a.fieldNumber.localeCompare(b.fieldNumber, "ru", { numeric: true })),
    }));
  } catch (error) { next(error); }
});
export default router;
