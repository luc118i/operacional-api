// src/modules/schemes/schemes.routes.ts
import { Router } from "express";
import {
  listSchemesHandler,
  getSchemeByIdHandler,
  createSchemeHandler,
  updateSchemeHandler,
  deleteSchemeHandler,
  getSchemeSummaryHandler,
  getSchemeFullHandler,
  searchSchemeByKeyHandler,
} from "./schemes.controller";

import { listPointsBySchemeIdHandler } from "../schemePoints/schemePoints.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const schemesRouter = Router();

// lista todos
schemesRouter.get("/", listSchemesHandler);

// 🔍 buscar por (codigo + direction + tripTime)
schemesRouter.get("/search", searchSchemeByKeyHandler);

// full deve vir antes de "/:id"
schemesRouter.get("/:id/full", getSchemeFullHandler);

schemesRouter.get("/:id/summary", getSchemeSummaryHandler);
schemesRouter.get("/:id/points", listPointsBySchemeIdHandler);
schemesRouter.get("/:id", getSchemeByIdHandler);

/**
 * ✏️ Rotas protegidas (criação/edição/remoção)
 */

schemesRouter.post("/", authMiddleware, createSchemeHandler);
schemesRouter.put("/:id", authMiddleware, updateSchemeHandler);
schemesRouter.delete("/:id", authMiddleware, deleteSchemeHandler);

export { schemesRouter };
