// src/modules/roadSegments/roadSegments.invalidate.ts
import { supabase } from "../../config/upabaseClient";

export async function invalidateRoadSegmentsByLocationId(locationId: string) {
  const { error } = await supabase
    .from("road_segments")
    .update({
      source: "stale",
      // opcional, mas recomendado:
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
