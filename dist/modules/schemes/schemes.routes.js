"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemesRouter = void 0;
// src/modules/schemes/schemes.routes.ts
const express_1 = require("express");
const schemes_controller_1 = require("./schemes.controller");
const schemePoints_controller_1 = require("../schemePoints/schemePoints.controller");
const authMiddleware_1 = require("../../middlewares/authMiddleware");
const schemesRouter = (0, express_1.Router)();
exports.schemesRouter = schemesRouter;
// lista todos
schemesRouter.get("/", schemes_controller_1.listSchemesHandler);
// 🔍 buscar por (codigo + direction + tripTime)
schemesRouter.get("/search", schemes_controller_1.searchSchemeByKeyHandler);
// full deve vir antes de "/:id"
schemesRouter.get("/:id/full", schemes_controller_1.getSchemeFullHandler);
schemesRouter.get("/:id/summary", schemes_controller_1.getSchemeSummaryHandler);
schemesRouter.get("/:id/points", schemePoints_controller_1.listPointsBySchemeIdHandler);
schemesRouter.get("/:id", schemes_controller_1.getSchemeByIdHandler);
/**
 * ✏️ Rotas protegidas (criação/edição/remoção)
 */
schemesRouter.post("/", authMiddleware_1.authMiddleware, schemes_controller_1.createSchemeHandler);
schemesRouter.put("/:id", authMiddleware_1.authMiddleware, schemes_controller_1.updateSchemeHandler);
schemesRouter.delete("/:id", authMiddleware_1.authMiddleware, schemes_controller_1.deleteSchemeHandler);
