"use strict";
// src/modules/schemePoints/schemePoints.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemePointsRouter = void 0;
const express_1 = require("express");
const schemePoints_controller_1 = require("./schemePoints.controller");
const authMiddleware_1 = require("../../middlewares/authMiddleware");
const schemePointsRouter = (0, express_1.Router)();
exports.schemePointsRouter = schemePointsRouter;
/**
 * ROTAS ORGANIZADAS
 * ------------------
 * /scheme-points                    -> lista todos
 * /scheme-points/schemes/:id/points -> lista por esquema
 * /scheme-points/:id                -> CRUD individual
 * /scheme-points/schemes/:id/points -> substituir lista completa
 */
/* -----------------------------
   🔎 1) LISTAR TODOS OS PONTOS (PÚBLICO)
------------------------------*/
schemePointsRouter.get("/", schemePoints_controller_1.listSchemePointsHandler);
/* ---------------------------------------------------------
   🔎 2) LISTAR PONTOS DE UM ESQUEMA (USADO PELO FRONT) (PÚBLICO)
   GET /scheme-points/schemes/:schemeId/points
----------------------------------------------------------*/
schemePointsRouter.get("/schemes/:schemeId/points", schemePoints_controller_1.listPointsBySchemeIdHandler);
/* --------------------------------------------------------
   💾 3) SUBSTITUIR TODA A LISTA DE PONTOS DE UM ESQUEMA (PROTEGIDO)
   PUT /scheme-points/schemes/:schemeId/points
---------------------------------------------------------*/
schemePointsRouter.put("/schemes/:schemeId/points", authMiddleware_1.authMiddleware, schemePoints_controller_1.replaceSchemePointsHandler);
/* -----------------------------
   🔎 4) BUSCAR 1 PONTO POR ID (PÚBLICO)
------------------------------*/
schemePointsRouter.get("/:id", schemePoints_controller_1.getSchemePointByIdHandler);
/* -----------------------------
   ➕ 5) CRIAR INDIVIDUAL (PROTEGIDO)
------------------------------*/
schemePointsRouter.post("/", authMiddleware_1.authMiddleware, schemePoints_controller_1.createSchemePointHandler);
/* -----------------------------
   ✏ 6) ATUALIZAR INDIVIDUAL (PROTEGIDO)
------------------------------*/
schemePointsRouter.put("/:id", authMiddleware_1.authMiddleware, schemePoints_controller_1.updateSchemePointHandler);
/* -----------------------------
   🗑 7) EXCLUIR INDIVIDUAL (PROTEGIDO)
------------------------------*/
schemePointsRouter.delete("/:id", authMiddleware_1.authMiddleware, schemePoints_controller_1.deleteSchemePointHandler);
