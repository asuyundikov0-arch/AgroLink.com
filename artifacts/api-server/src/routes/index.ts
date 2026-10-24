import { Router, type IRouter } from "express";
import healthRouter from "./health";
import templatesRouter from "./templates";
import reportsRouter from "./reports";
import archivesRouter from "./archives";
import roleApplicationsRouter from "./role-applications";
import equipmentRepairsRouter from "./equipment-repairs";
import grainRouter from "./grain";
import agroFieldsRouter from "./agro-fields";
import sparePartRequestsRouter from "./spare-part-requests";
import payrollRegistersRouter from "./payroll-registers";
import employeesRouter from "./employees";

const router: IRouter = Router();

router.use(healthRouter);
router.use(templatesRouter);
router.use(reportsRouter);
router.use(archivesRouter);
router.use(roleApplicationsRouter);
router.use(equipmentRepairsRouter);
router.use(grainRouter);
router.use(agroFieldsRouter);
router.use(sparePartRequestsRouter);
router.use(payrollRegistersRouter);
router.use(employeesRouter);

export default router;
