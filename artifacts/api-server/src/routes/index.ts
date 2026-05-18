import { Router, type IRouter } from "express";
import healthRouter from "./health";
import boqRouter from "./boq";
import materialsRouter from "./materials";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/boq", boqRouter);
router.use("/materials", materialsRouter);

export default router;
