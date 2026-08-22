import { Router, type IRouter } from "express";
import healthRouter from "./health";
import templatesRouter from "./templates";
import reportsRouter from "./reports";
import roleApplicationsRouter from "./role-applications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(templatesRouter);
router.use(reportsRouter);
router.use(roleApplicationsRouter);

export default router;
