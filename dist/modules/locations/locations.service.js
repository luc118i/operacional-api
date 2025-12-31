"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllLocations = getAllLocations;
exports.getLocationById = getLocationById;
exports.searchLocations = searchLocations;
exports.getLocationBySigla = getLocationBySigla;
exports.createLocation = createLocation;
exports.updateLocation = updateLocation;
exports.deleteLocation = deleteLocation;
// src/modules/locations/locations.service.ts
const upabaseClient_1 = require("../../config/upabaseClient");

const schemePoints_service_1 = require("../schemePoints/schemePoints.service");

// Lista todos os locais
async function getAllLocations() {
  const { data, error } = await upabaseClient_1.supabase
    .from("locations")
    .select("*")
    .order("cidade", { ascending: true });
  if (error) {
    console.error("[getAllLocations] erro:", error);
    throw new Error("Erro ao buscar locais");
  }
  return data ?? [];
}
// Busca por ID
async function getLocationById(id) {
  const { data, error } = await upabaseClient_1.supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    console.error("[getLocationById] erro:", error);
    throw new Error("Erro ao buscar local");
  }
  return data ?? null;
}
// Busca por texto (sigla, cidade, descrição, uf)
async function searchLocations(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    return getAllLocations();
  }
  const { data, error } = await upabaseClient_1.supabase
    .from("locations")
    .select("*")
    .or(
      `sigla.ilike.%${trimmed}%,descricao.ilike.%${trimmed}%,cidade.ilike.%${trimmed}%,uf.ilike.%${trimmed}%`
    )
    .order("cidade", { ascending: true });
  if (error) {
    console.error("[searchLocations] erro:", error);
    throw new Error("Erro ao buscar locais");
  }
  return data ?? [];
}
// Busca por SIGLA (exata, case-insensitive)
async function getLocationBySigla(sigla) {
  const trimmed = sigla.trim();
  if (!trimmed) {
    return null;
  }
  // Vamos padronizar a sigla em maiúsculo
  const normalized = trimmed.toUpperCase();
  const { data, error } = await upabaseClient_1.supabase
    .from("locations")
    .select("*")
    .eq("sigla", normalized)
    .limit(1);
  if (error) {
    console.error("[getLocationBySigla] erro:", error);
    throw new Error("Erro ao buscar local pela sigla");
  }
  if (!data || data.length === 0) {
    return null;
  }
  return data[0];
}
// Cria um novo local
async function createLocation(input) {
  const { data, error } = await upabaseClient_1.supabase
    .from("locations")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    console.error("[createLocation] erro:", error);
    throw new Error("Erro ao criar local");
  }
  return data;
}
// Atualiza um local

function normalizeCoord(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function coordsChanged(beforeLat, beforeLng, afterLat, afterLng) {
  const bLat = normalizeCoord(beforeLat);
  const bLng = normalizeCoord(beforeLng);
  const aLat = normalizeCoord(afterLat);
  const aLng = normalizeCoord(afterLng);

  // se nenhum dos lados tem coords válidas, não considera mudança
  if (bLat === null && bLng === null && aLat === null && aLng === null)
    return false;

  // tolerância pequena para evitar flapping por arredondamento
  const EPS = 1e-7;

  const latDiff =
    bLat === null || aLat === null
      ? bLat !== aLat
      : Math.abs(bLat - aLat) > EPS;

  const lngDiff =
    bLng === null || aLng === null
      ? bLng !== aLng
      : Math.abs(bLng - aLng) > EPS;

  return latDiff || lngDiff;
}

async function invalidateRoadSegmentsByLocation(locationId) {
  const { error } = await upabaseClient_1.supabase
    .from("road_segments")
    .update({
      stale: true,
      updated_at: new Date().toISOString(),
    })
    .or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`);

  if (error) throw error;
}

async function updateLocation(id, input) {
  const { data: before, error: beforeErr } = await upabaseClient_1.supabase
    .from("locations")
    .select("id, lat, lng")
    .eq("id", id)
    .maybeSingle();

  if (beforeErr) {
    console.error("[updateLocation] erro ao buscar antes:", beforeErr);
    throw new Error("Erro ao buscar local (antes de atualizar)");
  }
  if (!before) throw new Error("Local não encontrado");

  const { data: updated, error: updErr } = await upabaseClient_1.supabase
    .from("locations")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) {
    console.error("[updateLocation] erro:", updErr);
    throw new Error("Erro ao atualizar local");
  }

  const changed = coordsChanged(
    before.lat,
    before.lng,
    updated.lat,
    updated.lng
  );

  if (changed) {
    try {
      await invalidateRoadSegmentsByLocation(id);
      const recalcResult =
        await schemePoints_service_1.recalculateSchemePointsByLocation(id);

      console.info(
        `[updateLocation] coords mudaram; road_segments invalidados e scheme_points recalculados (${recalcResult.updatedPoints}) para location ${id}`
      );
    } catch (e) {
      console.error("[updateLocation] falha ao invalidar/recalcular:", e);
    }
  }

  return updated;
}
exports.updateLocation = updateLocation;

// Remove um local
async function deleteLocation(id) {
  const { error } = await upabaseClient_1.supabase
    .from("locations")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[deleteLocation] erro:", error);
    throw new Error("Erro ao excluir local");
  }
}
