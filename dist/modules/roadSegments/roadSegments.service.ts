// src/modules/roadSegments/roadSegments.service.ts
import fetch from "node-fetch";
import { supabase } from "../../config/upabaseClient";
import type { RoadDistanceResult } from "./roadSegments.types";

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export async function getOrCreateRoadSegmentDistanceKm(
  fromLocationId: string,
  toLocationId: string
): Promise<RoadDistanceResult> {
  // mesmo local: não cacheia em road_segments
  if (fromLocationId === toLocationId) {
    return {
      roadSegmentUuid: null,
      distanceKm: 0,
      durationMin: 0,
      cached: true,
      source: "db",
    };
  }

  // 1) busca cache (agora com stale/uuid/duration)
  const { data: segment, error: segmentError } = await supabase
    .from("road_segments")
    .select("road_segment_uuid, distance_km, duration_min, stale")
    .eq("from_location_id", fromLocationId)
    .eq("to_location_id", toLocationId)
    .maybeSingle();

  if (segmentError) {
    console.error("[road_segments] erro ao buscar:", segmentError);
  }

  // ✅ cache HIT real
  if (segment && segment.stale === false) {
    return {
      roadSegmentUuid: segment.road_segment_uuid ?? null,
      distanceKm: Number(segment.distance_km),
      durationMin: segment.duration_min == null ? null : Number(segment.duration_min),
      cached: true,
      source: "db",
    };
  }

  // 2) carrega coords
  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("id, lat, lng")
    .in("id", [fromLocationId, toLocationId]);

  if (locError) {
    console.error("[locations] erro ao buscar:", locError);
    throw new Error("Erro ao carregar locais");
  }

  const fromLoc = locations?.find((l) => l.id === fromLocationId);
  const toLoc = locations?.find((l) => l.id === toLocationId);

  if (!fromLoc || !toLoc) {
    throw new Error("Origem ou destino não encontrado na tabela locations.");
  }

  const fromLat = Number(fromLoc.lat);
  const fromLng = Number(fromLoc.lng);
  const toLat = Number(toLoc.lat);
  const toLng = Number(toLoc.lng);

  if (![fromLat, fromLng, toLat, toLng].every((n) => Number.isFinite(n))) {
    throw new Error("Locais sem coordenadas válidas (lat/lng).");
  }

  // 3) calcula (ORS -> fallback)
  let distanceKm: number;
  let durationMin: number | null = null;
  let calcSource: "ors" | "fallback" = "fallback";

  try {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) throw new Error("ORS_API_KEY não configurada");

    const url =
      "https://api.openrouteservice.org/v2/directions/driving-car" +
      `?api_key=${apiKey}` +
      `&start=${fromLng},${fromLat}` +
      `&end=${toLng},${toLat}`;

    const response = await fetch(url as any);
    if (!response.ok) {
      const body = await response.text();
      console.error("[ORS] erro:", response.status, body);
      throw new Error("Falha na chamada ORS");
    }

    const data = (await response.json()) as any;
    const seg = data?.features?.[0]?.properties?.segments?.[0];

    const meters = seg?.distance;
    const seconds = seg?.duration;

    if (typeof meters !== "number") throw new Error("Resposta ORS inválida (distance)");
    distanceKm = Number((meters / 1000).toFixed(2));

    if (typeof seconds === "number") {
      durationMin = Math.max(0, Math.round(seconds / 60));
    }

    calcSource = "ors";
  } catch (err) {
    console.error("[ORS] falhou, usando fallback Haversine:", err);
    distanceKm = haversineDistanceKm(fromLat, fromLng, toLat, toLng);
    durationMin = null;
    calcSource = "fallback";
  }

  // 4) upsert no cache (cria ou revalida stale)
  const { data: upserted, error: upsertError } = await supabase
    .from("road_segments")
    .upsert(
      {
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        distance_km: distanceKm,
        duration_min: durationMin,
        stale: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "from_location_id,to_location_id" }
    )
    .select("road_segment_uuid, distance_km, duration_min")
    .maybeSingle();

  if (upsertError) {
    console.error("[road_segments] erro no upsert:", upsertError);
    // ✅ aqui é importante: se recalculou, NÃO diga cached=true
    return {
      roadSegmentUuid: segment?.road_segment_uuid ?? null,
      distanceKm,
      durationMin,
      cached: false,
      source: calcSource,
    };
  }

  // ✅ se chegou aqui, recalculou e persistiu (ou criou)
  return {
    roadSegmentUuid: upserted?.road_segment_uuid ?? null,
    distanceKm: Number(upserted?.distance_km ?? distanceKm),
    durationMin:
      upserted?.duration_min == null ? durationMin : Number(upserted.duration_min),
    cached: false,        // <- revalidou/criou agora
    source: calcSource,   // <- ors/fallback (verdadeiro)
  };
}
