// src/modules/roadSegments/roadSegments.types.ts

export type RoadSegmentSource = "ors" | "fallback" | (string & {});

/**
 * Linha como vem do banco/Supabase (snake_case, numeric pode vir como string)
 */
export interface RoadSegmentRow {
  id: number; // bigserial
  from_location_id: string; // uuid
  to_location_id: string; // uuid

  distance_km: string | number; // numeric(10,2)
  duration_min: string | number | null; // numeric

  geometry: unknown | null; // jsonb
  source: string | null;

  road_segment_uuid: string | null; // uuid (nullable no schema)
  stale: boolean;

  created_at: string; // timestamptz
  updated_at: string; // timestamptz
}

/**
 * Subconjunto retornado pelo SELECT do cache no service
 */
export type RoadSegmentCacheRow = Pick<
  RoadSegmentRow,
  | "road_segment_uuid"
  | "distance_km"
  | "duration_min"
  | "stale"
  | "updated_at"
  | "source"
>;

/**
 * Resultado do seu serviço (já normalizado)
 */
export type RoadDistanceSource = "db" | "ors" | "fallback";

export type RoadDistanceResult = {
  roadSegmentUuid: string | null;
  distanceKm: number;
  durationMin: number | null;
  cached: boolean;
  source: RoadDistanceSource;
};
