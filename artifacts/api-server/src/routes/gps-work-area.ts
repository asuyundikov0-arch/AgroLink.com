import { Router, type RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, fleetEquipmentTable } from "@workspace/db";
import { requireApprovedRole } from "../middlewares/auth";
import { disconnectedGpsResult, parseGpsSelection } from "../lib/gps-work-area";

const equipmentExists = async (id: number) => {
  const [row] = await db.select({ id: fleetEquipmentTable.id }).from(fleetEquipmentTable)
    .where(eq(fleetEquipmentTable.id, id)).limit(1);
  return !!row;
};

// Dependency injection lets HTTP tests verify permissions without real identities or data writes.
export function createGpsWorkAreaRouter(auth: RequestHandler = requireApprovedRole, exists = equipmentExists) {
  const router = Router();
  router.get("/agro/gps/work-area", auth, async (req, res, next) => {
    if (!["dispatcher", "general_director"].includes(res.locals.access?.role ?? "")) {
      res.status(403).json({ error: "GPS-выработка доступна диспетчеру и генеральному директору." });
      return;
    }
    let selection: ReturnType<typeof parseGpsSelection>;
    try { selection = parseGpsSelection(req.query); }
    catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    try {
      if (!await exists(selection.equipmentId)) {
        res.status(404).json({ error: "Техника не найдена в справочнике." });
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json(disconnectedGpsResult(selection));
    } catch (error) { next(error); }
  });
  return router;
}

export default createGpsWorkAreaRouter();
