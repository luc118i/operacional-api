// src/modules/roadSegments/roadSegments.routes.ts
import { Router } from "express";
import { getOrCreateRoadSegmentDistanceKm } from "./roadSegments.service";

const router = Router();

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

    const result = await getOrCreateRoadSegmentDistanceKm(
      fromLocationId,
      toLocationId
    );

    return res.json({
      fromLocationId,
      toLocationId,
      distanceKm: result.distanceKm,
      cached: result.cached,
      source: result.source,
    });
  } catch (err: any) {
    console.error("[/api/road-distance] erro:", err);

    return res.status(500).json({
      error: "Erro ao calcular distância por trecho.",
      details: err?.message ?? String(err),
    });
  }
});

export default router;
