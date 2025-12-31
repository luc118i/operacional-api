// src/modules/locations/locations.controller.ts
import type { Request, Response } from "express";

import { supabase } from "../../config/upabaseClient";
import {
  getAllLocations,
  getLocationById,
  searchLocations,
  createLocation,
  updateLocationWithInvalidation,
  deleteLocation,
  getLocationBySigla,
} from "./locations.service";

export async function handleGetLocations(req: Request, res: Response) {
  try {
    const { q } = req.query;

    const locations = q
      ? await searchLocations(String(q))
      : await getAllLocations();

    res.json(locations);
  } catch (err: any) {
    console.error("[handleGetLocations] erro:", err);
    res.status(500).json({ error: err.message ?? "Erro ao buscar locais" });
  }
}

export async function handleGetLocationBySigla(req: Request, res: Response) {
  try {
    const { sigla } = req.params;
    const normalized = sigla?.toUpperCase().trim();

    if (!normalized) {
      return res.status(400).json({ error: "Sigla inválida" });
    }

    const location = await getLocationBySigla(normalized);

    if (!location) {
      return res.status(404).json({ error: "Local não encontrado" });
    }

    return res.json(location);
  } catch (err: any) {
    console.error("[handleGetLocationBySigla] erro:", err);
    return res
      .status(500)
      .json({ error: err.message ?? "Erro ao buscar local pela sigla" });
  }
}

export async function handleGetLocation(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const location = await getLocationById(id);

    if (!location) {
      return res.status(404).json({ error: "Local não encontrado" });
    }

    res.json(location);
  } catch (err: any) {
    console.error("[handleGetLocation] erro:", err);
    res.status(500).json({ error: err.message ?? "Erro ao buscar local" });
  }
}

export async function handleCreateLocation(req: Request, res: Response) {
  try {
    const created = await createLocation(req.body);
    res.status(201).json(created);
  } catch (err: any) {
    console.error("[handleCreateLocation] erro:", err);
    res.status(500).json({ error: err.message ?? "Erro ao criar local" });
  }
}

export async function handleUpdateLocation(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const updated = await updateLocationWithInvalidation(id, req.body);
    res.json(updated);
  } catch (err: any) {
    console.error("[handleUpdateLocation] erro:", err);
    res.status(500).json({ error: err.message ?? "Erro ao atualizar local" });
  }
}

export async function handleDeleteLocation(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await deleteLocation(id);
    res.status(204).send();
  } catch (err: any) {
    console.error("[handleDeleteLocation] erro:", err);
    res.status(500).json({ error: err.message ?? "Erro ao excluir local" });
  }
}

export async function invalidateRoadSegmentsByLocationId(locationId: string) {
  const { error } = await supabase
    .from("road_segments")
    .update({
      stale: true,
      duration_min: null,
      geometry: null,
      updated_at: new Date().toISOString(),
    })
    .or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`);

  if (error) {
    console.error("[invalidateRoadSegmentsByLocationId] erro:", error);
    throw new Error("Erro ao invalidar road_segments do local");
  }
}
