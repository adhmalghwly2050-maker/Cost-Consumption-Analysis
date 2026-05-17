import { Router, type IRouter } from "express";
import healthRouter from "./health";
import boqRouter from "./boq";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/boq", boqRouter);

export default router;
