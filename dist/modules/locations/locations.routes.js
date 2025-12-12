"use strict";
// src/modules/locations/locations.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationsRouter = void 0;
const express_1 = require("express");
const locations_controller_1 = require("./locations.controller");
const authMiddleware_1 = require("../../middlewares/authMiddleware");
exports.locationsRouter = (0, express_1.Router)();
/**
 * 📌 ROTAS PÚBLICAS (somente leitura)
 * ------------------------------------
 */
// Buscar por sigla precisa vir antes do :id
exports.locationsRouter.get("/sigla/:sigla", locations_controller_1.handleGetLocationBySigla);
// GET /locations → lista todos ou busca com ?q=
exports.locationsRouter.get("/", locations_controller_1.handleGetLocations);
// GET /locations/:id → detalhe
exports.locationsRouter.get("/:id", locations_controller_1.handleGetLocation);
/**
 * 🔐 ROTAS PROTEGIDAS
 * ------------------------------------
 */
exports.locationsRouter.post("/", authMiddleware_1.authMiddleware, locations_controller_1.handleCreateLocation);
exports.locationsRouter.put("/:id", authMiddleware_1.authMiddleware, locations_controller_1.handleUpdateLocation);
exports.locationsRouter.delete("/:id", authMiddleware_1.authMiddleware, locations_controller_1.handleDeleteLocation);
