// src/modules/roadSegments/roadSegments.types.ts
export interface RoadSegment {
  id: number;
  road_segment_uuid: string;
  from_location_id: string; // uuid
  to_location_id: string; // uuid
  distance_km: number;
  duration_min: number | null;
  stale: boolean;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export type RoadDistanceResult = {
  roadSegmentUuid: string | null,
  distanceKm: number,
  durationMin: number | null,
  cached: boolean,
  source: "db" | "ors" | "fallback",
};
