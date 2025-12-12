// src/modules/roadSegments/roadSegments.service.ts
import fetch from "node-fetch";
import { supabase } from "../../config/upabaseClient";

import type { RoadDistanceResult } from "./roadSegments.types";

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 10) / 10;
}

export async function getOrCreateRoadSegmentDistanceKm(
  fromLocationId: string,
  toLocationId: string
): Promise<RoadDistanceResult> {
  // mesmo local -> distância 0
  if (fromLocationId === toLocationId) {
    return {
      distanceKm: 0,
      cached: true,
      source: "db",
    };
  }

  // 1) tenta buscar no cache
  const { data: segment, error: segmentError } = await supabase
    .from("road_segments")
    .select("id, distance_km")
    .eq("from_location_id", fromLocationId)
    .eq("to_location_id", toLocationId)
    .maybeSingle();

  if (segmentError) {
    console.error("[road_segments] erro ao buscar:", segmentError);
  }

  if (segment) {
    return {
      distanceKm: Number(segment.distance_km),
      cached: true,
      source: "db",
    };
  }

  // 2) carrega coordenadas dos dois locais
  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("id, lat, lng")
    .in("id", [fromLocationId, toLocationId]);

  if (locError) {
    console.error("[locations] erro ao buscar:", locError);
    throw new Error("Erro ao carregar locais");
  }

  if (!locations || locations.length === 0) {
    throw new Error("Nenhum dos locais informados existe na tabela locations.");
  }

  const fromLoc = locations.find((l) => l.id === fromLocationId);
  const toLoc = locations.find((l) => l.id === toLocationId);

  if (!fromLoc || !toLoc) {
    const missing: string[] = [];
    if (!fromLoc) missing.push(`origem (${fromLocationId})`);
    if (!toLoc) missing.push(`destino (${toLocationId})`);
    throw new Error(`Local não encontrado no Supabase: ${missing.join(" e ")}`);
  }

  if (
    !fromLoc ||
    !toLoc ||
    fromLoc.lat == null ||
    fromLoc.lng == null ||
    toLoc.lat == null ||
    toLoc.lng == null
  ) {
    throw new Error("Locais sem coordenadas válidas");
  }

  const fromLat = Number(fromLoc.lat);
  const fromLng = Number(fromLoc.lng);
  const toLat = Number(toLoc.lat);
  const toLng = Number(toLoc.lng);

  // 3) tenta usar OpenRouteService
  try {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
      throw new Error("ORS_API_KEY não configurada");
    }

    const url =
      "https://api.openrouteservice.org/v2/directions/driving-car" +
      `?api_key=${apiKey}` +
      `&start=${fromLng},${fromLat}` +
      `&end=${toLng},${toLat}`;

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      console.error("[ORS] erro:", response.status, body);
      throw new Error("Falha na chamada ORS");
    }

    const data = (await response.json()) as any;
    const segmentProps = data?.features?.[0]?.properties?.segments?.[0];

    if (!segmentProps || typeof segmentProps.distance !== "number") {
      console.error("[ORS] resposta inesperada:", data);
      throw new Error("Resposta ORS inválida");
    }

    const distanceKm = Number((segmentProps.distance / 1000).toFixed(2));

    // 4) grava no cache (ignora erro se der race condition)
    const { error: insertError } = await supabase.from("road_segments").insert({
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      distance_km: distanceKm,
    });

    if (insertError) {
      console.error("[road_segments] erro ao inserir:", insertError);
    }

    return {
      distanceKm,
      cached: false,
      source: "ors",
    };
  } catch (err) {
    console.error("[ORS] falhou, usando fallback Haversine:", err);

    const distanceKm = haversineDistanceKm(fromLat, fromLng, toLat, toLng);

    return {
      distanceKm,
      cached: false,
      source: "fallback",
    };
  }
}
