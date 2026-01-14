import { supabase } from "../../config/upabaseClient";

type SchemePointRow = {
  ordem: number;
  location_id: string | null;
  distancia_km: number | string | null;
  tempo_deslocamento_min: number | null;
  tempo_no_local_min: number | null;
};

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Opção A (backend):
 * Consolida header do esquema em `schemes` com base nos `scheme_points`.
 * - origem_location_id / destino_location_id: 1º e último ponto por ordem (se houver)
 * - distancia_total_km: soma de distancia_km dos pontos com ordem > 1
 * - trip_time_min: soma (tempo_deslocamento_min + tempo_no_local_min) dos pontos com ordem > 1
 *
 * Importante: chamar depois do recalc.
 */
export async function updateSchemeSummary(schemeId: string): Promise<{
  origem_location_id: string | null;
  destino_location_id: string | null;
  distancia_total_km: number | null;
  trip_time_min: number | null;
  points_count: number;
}> {
  // 1) Carrega pontos ordenados (precisamos de origem/destino e agregações)
  const { data, error } = await supabase
    .from("scheme_points")
    .select(
      "ordem, location_id, distancia_km, tempo_deslocamento_min, tempo_no_local_min"
    )
    .eq("scheme_id", schemeId)
    .order("ordem", { ascending: true });

  if (error) throw error;

  const points = (data ?? []) as SchemePointRow[];
  const points_count = points.length;

  if (points_count === 0) {
    const { error: upErr } = await supabase
      .from("schemes")
      .update({
        origem_location_id: null,
        destino_location_id: null,
        distancia_total_km: null,
        trip_time_min: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", schemeId);

    if (upErr) throw upErr;

    return {
      origem_location_id: null,
      destino_location_id: null,
      distancia_total_km: null,
      trip_time_min: null,
      points_count,
    };
  }
  const firstWithLocation = points.find((p) => !!p.location_id) ?? null;
  const lastWithLocation =
    [...points].reverse().find((p) => !!p.location_id) ?? null;

  const origem_location_id = firstWithLocation?.location_id ?? null;
  const destino_location_id = lastWithLocation?.location_id ?? null;

  // 2) Soma somente ordem > 1 (ponto 1 não possui trecho)
  let distancia_total_km = 0;
  let trip_time_min = 0;

  for (const p of points) {
    if ((p.ordem ?? 0) <= 1) continue;

    distancia_total_km += toNumber(p.distancia_km);

    const desloc = p.tempo_deslocamento_min ?? 0;
    const local = p.tempo_no_local_min ?? 0;
    trip_time_min += desloc + local;
  }

  const { error: updateErr } = await supabase
    .from("schemes")
    .update({
      origem_location_id,
      destino_location_id,
      distancia_total_km,
      trip_time_min,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schemeId);

  if (updateErr) throw updateErr;

  return {
    origem_location_id,
    destino_location_id,
    distancia_total_km,
    trip_time_min,
    points_count,
  };
}
