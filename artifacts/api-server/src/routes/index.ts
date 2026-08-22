import { Router, type IRouter } from "express";
import healthRouter from "./health";
import templatesRouter from "./templates";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(templatesRouter);
router.use(reportsRouter);

export default router;
