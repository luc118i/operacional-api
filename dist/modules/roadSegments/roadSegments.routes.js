"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/roadSegments/roadSegments.routes.ts
const express_1 = require("express");
const roadSegments_service_1 = require("./roadSegments.service");
const router = (0, express_1.Router)();
// GET /api/road-distance?fromLocationId=1&toLocationId=2
router.get("/road-distance", async (req, res) => {
    try {
        const fromLocationId = String(req.query.fromLocationId ?? "").trim();
        const toLocationId = String(req.query.toLocationId ?? "").trim();
        if (!fromLocationId || !toLocationId) {
            return res.status(400).json({
                error: "Parâmetros fromLocationId e toLocationId são obrigatórios.",
            });
        }
        const result = await (0, roadSegments_service_1.getOrCreateRoadSegmentDistanceKm)(fromLocationId, toLocationId);
        return res.json({
            fromLocationId,
            toLocationId,
            distanceKm: result.distanceKm,
            cached: result.cached,
            source: result.source,
        });
    }
    catch (err) {
        console.error("[/api/road-distance] erro:", err);
        return res.status(500).json({
            error: "Erro ao calcular distância por trecho.",
            details: err?.message ?? String(err),
        });
    }
});
exports.default = router;
