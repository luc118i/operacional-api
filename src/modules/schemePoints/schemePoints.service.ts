// src/modules/schemePoints/schemePoints.service.ts
import { supabase } from "../../config/upabaseClient";
import pLimit from "p-limit";

import type {
  SchemePoint,
  CreateSchemePointInput,
  UpdateSchemePointInput,
} from "./schemePoints.types";

import { getOrCreateRoadSegmentDistanceKm } from "../roadSegments/roadSegments.service";

import { normalizeSchemePointInput } from "./schemePoints.normalize";
import {
  attachFunctionsToPoint,
  attachFunctionsToPoints,
} from "./schemePoints.functions";

/**
 * Busca TODOS os pontos de TODOS os esquemas.
 * Útil mais pra debug/admin.
 */
export async function getAllSchemePoints(): Promise<SchemePoint[]> {
  const { data, error } = await supabase
    .from("scheme_points")
    .select("*")
    .order("scheme_id", { ascending: true })
    .order("ordem", { ascending: true });

  if (error) {
    console.error("[getAllSchemePoints] erro:", error);
    throw new Error("Erro ao buscar pontos de esquema operacional");
  }

  return attachFunctionsToPoints((data ?? []) as SchemePoint[]);
}

/**
 * Busca um ponto específico pelo ID.
 */
export async function getSchemePointById(
  id: string
): Promise<SchemePoint | null> {
  const { data, error } = await supabase
    .from("scheme_points")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 = "Row not found"
    if ((error as any).code === "PGRST116") {
      return null;
    }
    console.error("[getSchemePointById] erro:", error);
    throw new Error("Erro ao buscar ponto de esquema operacional");
  }

  return attachFunctionsToPoint(data as SchemePoint);
}

/**
 * Busca todos os pontos de um esquema, ordenados pela ordem.
 */
export async function getSchemePointsBySchemeId(
  schemeId: string
): Promise<SchemePoint[]> {
  const { data, error } = await supabase
    .from("scheme_points")
    .select(
      `
      *,
      location:locations (
        id,
        descricao,
        cidade,
        uf,
        lat,
        lng,
        tipo,
        sigla
      )
    `
    )
    .eq("scheme_id", schemeId)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("[getSchemePointsBySchemeId] erro:", error);
    throw new Error("Erro ao buscar pontos do esquema operacional");
  }

  return attachFunctionsToPoints((data ?? []) as SchemePoint[]);
}

/**
 * Cria um único ponto.
 */
export async function createSchemePoint(
  input: CreateSchemePointInput
): Promise<SchemePoint> {
  // ✅ 1) normaliza: functions -> flags (ou legado)
  const normalized = normalizeSchemePointInput(input);

  // ✅ 2) nunca manda "functions" pro banco (coluna não existe)
  const { functions, ...dbPayload } = normalized as any;

  const { data, error } = await supabase
    .from("scheme_points")
    .insert(dbPayload)
    .select("*")
    .single();

  if (error) {
    console.error("[createSchemePoint] erro:", error);
    throw new Error("Erro ao criar ponto de esquema operacional");
  }

  // ✅ 3) resposta pública inclui functions derivado das flags salvas
  return attachFunctionsToPoint(data as SchemePoint);
}

/**
 * Atualiza um ponto específico.
 */
export async function updateSchemePoint(
  id: string,
  input: UpdateSchemePointInput
): Promise<SchemePoint | null> {
  // ✅ 1) normaliza
  const normalized = normalizeSchemePointInput(input);

  // ✅ 2) remove functions do payload do banco
  const { functions, ...dbPayload } = normalized as any;

  const { data, error } = await supabase
    .from("scheme_points")
    .update(dbPayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if ((error as any).code === "PGRST116") {
      return null;
    }
    console.error("[updateSchemePoint] erro:", error);
    throw new Error("Erro ao atualizar ponto de esquema operacional");
  }

  // ✅ 3) resposta com functions
  return data ? attachFunctionsToPoint(data as SchemePoint) : null;
}

/**
 * Exclui um ponto específico.
 */
export async function deleteSchemePoint(id: string): Promise<boolean> {
  const { error } = await supabase.from("scheme_points").delete().eq("id", id);

  if (error) {
    console.error("[deleteSchemePoint] erro:", error);
    throw new Error("Erro ao excluir ponto de esquema operacional");
  }

  return true;
}

/**
 * Substitui TODOS os pontos de um esquema por uma nova lista.
 * Isso é útil quando você salva o esquema inteiro vindo do front.
 *
 * Estratégia:
 * 1) Apaga todos os pontos do scheme_id
 * 2) Insere a nova lista (já com ordem correta)
 */
export async function setSchemePointsForScheme(
  schemeId: string,
  points: CreateSchemePointInput[]
): Promise<SchemePoint[]> {
  // segurança: garantir que todos têm o mesmo scheme_id
  const normalizedPoints = points.map((p, index) => {
    const normalized = normalizeSchemePointInput({
      ...p,
      scheme_id: schemeId,
      ordem:
        typeof p.ordem === "number" && Number.isFinite(p.ordem) && p.ordem > 0
          ? p.ordem
          : index + 1,
    } as any);

    const { functions, ...dbPayload } = normalized as any;
    return dbPayload;
  });

  // 1) apaga os pontos anteriores
  const { error: deleteError } = await supabase
    .from("scheme_points")
    .delete()
    .eq("scheme_id", schemeId);

  if (deleteError) {
    console.error(
      "[setSchemePointsForScheme] erro ao limpar pontos antigos:",
      deleteError
    );
    throw new Error("Erro ao limpar pontos anteriores do esquema operacional");
  }

  if (normalizedPoints.length === 0) {
    return [];
  }

  // 2) insere os novos
  const { data, error: insertError } = await supabase
    .from("scheme_points")
    .insert(normalizedPoints)
    .select("*")
    .order("ordem", { ascending: true });

  if (insertError) {
    console.error(
      "[setSchemePointsForScheme] erro ao inserir novos pontos:",
      insertError
    );
    throw new Error("Erro ao salvar pontos do esquema operacional");
  }

  return attachFunctionsToPoints((data ?? []) as SchemePoint[]);
}

async function getOrderedPointsForScheme(schemeId: string) {
  const { data, error } = await supabase
    .from("scheme_points")
    .select("id, scheme_id, ordem, location_id")
    .eq("scheme_id", schemeId)
    .order("ordem", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    scheme_id: string;
    ordem: number;
    location_id: string;
  }>;
}

async function updatePointDistanceAndTime(
  pointId: string,
  distanceKm: number | null,
  durationMin?: number | null
) {
  const payload: any = {
    distancia_km: distanceKm,
    updated_at: new Date().toISOString(),
  };

  // só seta tempo se veio calculado
  if (durationMin !== null && durationMin !== undefined) {
    payload.tempo_deslocamento_min = durationMin;
  }

  const { error } = await supabase
    .from("scheme_points")
    .update(payload)
    .eq("id", pointId);

  if (error) throw error;
}

/**
 * Recalcula as distâncias (e tempo) dos trechos afetados
 * por mudança de coordenadas em uma location.
 *
 * Regra:
 * - scheme_points.distancia_km é a distância do ponto anterior -> ponto atual
 * - então se a location mudou:
 *   a) recalcula prev -> cur (atualiza o ponto cur)
 *   b) recalcula cur -> next (atualiza o ponto next)
 */
type SegmentKey = string;

function segmentKey(from: string, to: string): SegmentKey {
  return `${from}|${to}`;
}

export async function recalculateSchemePointsByLocation(locationId: string) {
  console.log("[recalc] start for location:", locationId);

  const { data: occs, error } = await supabase
    .from("scheme_points")
    .select("scheme_id")
    .eq("location_id", locationId);

  if (error) throw error;

  const schemeIds = [...new Set((occs ?? []).map((o: any) => o.scheme_id))];

  if (schemeIds.length === 0) {
    return {
      updatedPoints: 0,
      schemeIdsCount: 0,
      segmentsComputed: 0,
      segmentsFromCache: 0,
      segmentsFallback: 0,
      errorsCount: 0,
    };
  }

  // Limites de concorrência (ajuste conforme necessidade)
  const calcLimit = pLimit(3); // ORS/cache
  const updateLimit = pLimit(6); // writes no Supabase

  // 1) Preparar lista de trechos necessários (dedupe) + lista de updates
  const segments = new Map<SegmentKey, { from: string; to: string }>();
  const updates: Array<{
    schemeId: string;
    pointId: string;
    ordem: number;
    from: string;
    to: string;
    kind: "prev->cur" | "cur->next";
  }> = [];

  for (const schemeId of schemeIds) {
    const points = await getOrderedPointsForScheme(schemeId);

    const indexes = points
      .map((p, i) => (p.location_id === locationId ? i : -1))
      .filter((i) => i >= 0);

    if (indexes.length === 0) continue;

    for (const idx of indexes) {
      // prev -> cur (atualiza o CUR)
      if (idx > 0) {
        const prev = points[idx - 1];
        const cur = points[idx];

        if (prev.location_id !== cur.location_id) {
          const key = segmentKey(prev.location_id, cur.location_id);
          segments.set(key, { from: prev.location_id, to: cur.location_id });

          updates.push({
            schemeId,
            pointId: cur.id,
            ordem: cur.ordem,
            from: prev.location_id,
            to: cur.location_id,
            kind: "prev->cur",
          });
        }
      }

      // cur -> next (atualiza o NEXT)
      if (idx < points.length - 1) {
        const cur = points[idx];
        const next = points[idx + 1];

        if (cur.location_id !== next.location_id) {
          const key = segmentKey(cur.location_id, next.location_id);
          segments.set(key, { from: cur.location_id, to: next.location_id });

          updates.push({
            schemeId,
            pointId: next.id,
            ordem: next.ordem,
            from: cur.location_id,
            to: next.location_id,
            kind: "cur->next",
          });
        }
      }
    }
  }

  if (segments.size === 0 || updates.length === 0) {
    return {
      updatedPoints: 0,
      schemeIdsCount: schemeIds.length,
      segmentsComputed: 0,
      segmentsFromCache: 0,
      segmentsFallback: 0,
      errorsCount: 0,
    };
  }

  // 2) Calcular cada trecho UMA vez
  const results = new Map<
    SegmentKey,
    Awaited<ReturnType<typeof getOrCreateRoadSegmentDistanceKm>>
  >();

  let errorsCount = 0;

  const computeJobs = [...segments.entries()].map(([key, pair]) =>
    calcLimit(async () => {
      try {
        const res = await getOrCreateRoadSegmentDistanceKm(pair.from, pair.to);
        results.set(key, res);
      } catch (e) {
        errorsCount++;
        console.error("[recalc] erro ao calcular segmento:", { key, e });
      }
    })
  );

  await Promise.all(computeJobs);

  let segmentsFromCache = 0;
  let segmentsFallback = 0;

  for (const r of results.values()) {
    if (r.cached) segmentsFromCache++;
    if (r.source === "fallback") segmentsFallback++;
  }

  // 3) Aplicar updates nos points (concorrência controlada)
  let updatedPoints = 0;

  const updateJobs = updates.map((u) =>
    updateLimit(async () => {
      const key = segmentKey(u.from, u.to);
      const res = results.get(key);

      // Se não calculou esse trecho (erro), não atualiza este ponto
      if (!res) return;

      console.log("[recalc]", u.kind, {
        schemeId: u.schemeId,
        ordem: u.ordem,
        from: u.from,
        to: u.to,
        distanceKm: res.distanceKm,
        durationMin: res.durationMin,
        source: res.source,
        cached: res.cached,
      });

      try {
        await updatePointDistanceAndTime(
          u.pointId,
          res.distanceKm,
          res.durationMin
        );
        updatedPoints++;
      } catch (e) {
        errorsCount++;
        console.error("[recalc] erro ao atualizar scheme_point:", {
          pointId: u.pointId,
          e,
        });
      }
    })
  );

  await Promise.all(updateJobs);

  return {
    updatedPoints,
    schemeIdsCount: schemeIds.length,
    segmentsComputed: segments.size,
    segmentsFromCache,
    segmentsFallback,
    errorsCount,
  };
}
