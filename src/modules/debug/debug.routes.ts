import { Router } from "express";
import { debugRecalcDerivedHandler } from "./debug.controller";

const router = Router();

router.post("/debug/derived/:schemeId", debugRecalcDerivedHandler);

export default router;
