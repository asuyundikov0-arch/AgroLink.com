import { Router, type IRouter } from "express";
import healthRouter from "./health";
import roleApplicationsRouter from "./role-applications";
import equipmentRepairsRouter from "./equipment-repairs";
import grainRouter from "./grain";
import agroFieldsRouter from "./agro-fields";
import sparePartRequestsRouter from "./spare-part-requests";
import payrollRegistersRouter from "./payroll-registers";
import employeesRouter from "./employees";
import chemicalsRouter from "./chemicals";
import fuelRouter from "./fuel";
import financialEntriesRouter from "./financial-entries";
import tokPayrollRouter from "./tok-payroll";
import seedsRouter from "./seeds";
import supportingTasksRouter from "./supporting-tasks";

const router: IRouter = Router();

router.use(healthRouter);
// Retired document modules must not remain usable through bookmarked API URLs.
router.use(["/templates", "/reports", "/archives", "/dashboard/summary", "/activity"], (_req, res) => {
  res.status(410).json({ error: "Отправка отчётов, архив и формы отчётов удалены из приложения." });
});
router.use(roleApplicationsRouter);
router.use(equipmentRepairsRouter);
router.use(grainRouter);
router.use(agroFieldsRouter);
router.use(sparePartRequestsRouter);
router.use(payrollRegistersRouter);
router.use(employeesRouter);
router.use(chemicalsRouter);
router.use(fuelRouter);
router.use(financialEntriesRouter);
router.use(tokPayrollRouter);
router.use(seedsRouter);
router.use(supportingTasksRouter);

export default router;
