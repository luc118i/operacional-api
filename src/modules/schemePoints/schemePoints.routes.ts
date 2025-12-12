// src/modules/schemePoints/schemePoints.routes.ts

import { Router } from "express";
import {
  listSchemePointsHandler,
  getSchemePointByIdHandler,
  createSchemePointHandler,
  updateSchemePointHandler,
  deleteSchemePointHandler,
  listPointsBySchemeIdHandler,
  replaceSchemePointsHandler,
} from "./schemePoints.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const schemePointsRouter = Router();

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
schemePointsRouter.get("/", listSchemePointsHandler);

/* ---------------------------------------------------------
   🔎 2) LISTAR PONTOS DE UM ESQUEMA (USADO PELO FRONT) (PÚBLICO)
   GET /scheme-points/schemes/:schemeId/points
----------------------------------------------------------*/
schemePointsRouter.get(
  "/schemes/:schemeId/points",
  listPointsBySchemeIdHandler
);

/* --------------------------------------------------------
   💾 3) SUBSTITUIR TODA A LISTA DE PONTOS DE UM ESQUEMA (PROTEGIDO)
   PUT /scheme-points/schemes/:schemeId/points
---------------------------------------------------------*/
schemePointsRouter.put(
  "/schemes/:schemeId/points",
  authMiddleware,
  replaceSchemePointsHandler
);

/* -----------------------------
   🔎 4) BUSCAR 1 PONTO POR ID (PÚBLICO)
------------------------------*/
schemePointsRouter.get("/:id", getSchemePointByIdHandler);

/* -----------------------------
   ➕ 5) CRIAR INDIVIDUAL (PROTEGIDO)
------------------------------*/
schemePointsRouter.post("/", authMiddleware, createSchemePointHandler);

/* -----------------------------
   ✏ 6) ATUALIZAR INDIVIDUAL (PROTEGIDO)
------------------------------*/
schemePointsRouter.put("/:id", authMiddleware, updateSchemePointHandler);

/* -----------------------------
   🗑 7) EXCLUIR INDIVIDUAL (PROTEGIDO)
------------------------------*/
schemePointsRouter.delete("/:id", authMiddleware, deleteSchemePointHandler);

export { schemePointsRouter };
