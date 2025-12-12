// src/modules/locations/locations.routes.ts

import { Router } from "express";
import {
  handleGetLocations,
  handleGetLocation,
  handleCreateLocation,
  handleUpdateLocation,
  handleDeleteLocation,
  handleGetLocationBySigla,
} from "./locations.controller";

import { authMiddleware } from "../../middlewares/authMiddleware";

export const locationsRouter = Router();

/**
 * 📌 ROTAS PÚBLICAS (somente leitura)
 * ------------------------------------
 */

// Buscar por sigla precisa vir antes do :id
locationsRouter.get("/sigla/:sigla", handleGetLocationBySigla);

// GET /locations → lista todos ou busca com ?q=
locationsRouter.get("/", handleGetLocations);

// GET /locations/:id → detalhe
locationsRouter.get("/:id", handleGetLocation);

/**
 * 🔐 ROTAS PROTEGIDAS
 * ------------------------------------
 */

locationsRouter.post("/", authMiddleware, handleCreateLocation);

locationsRouter.put("/:id", authMiddleware, handleUpdateLocation);

locationsRouter.delete("/:id", authMiddleware, handleDeleteLocation);
