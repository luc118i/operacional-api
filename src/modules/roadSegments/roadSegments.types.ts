// src/modules/roadSegments/roadSegments.types.ts
export interface RoadSegment {
  id: number;
  from_location_id: number;
  to_location_id: number;
  distance_km: number;
  created_at: string;
  updated_at: string;
}

export type RoadDistanceResult = {
  distanceKm: number;
  cached: boolean;
  source: "db" | "ors" | "fallback";
};
