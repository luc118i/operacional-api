import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import {
  dryRunImportSchemesHandler,
  commitImportSchemesHandler,
} from "./schemeImports.controller";

import { uploadSingleCsv } from "./schemeImports.upload";

const schemeImportsRouter = Router();

/**
 * 📄 DRY-RUN – valida CSV sem persistir
 */
schemeImportsRouter.post(
  "/schemes/dry-run",
  authMiddleware,
  uploadSingleCsv,
  dryRunImportSchemesHandler
);

/**
 * ✅ COMMIT – importa esquemas válidos
 */
schemeImportsRouter.post(
  "/schemes/commit",
  authMiddleware,
  commitImportSchemesHandler
);

export { schemeImportsRouter };
