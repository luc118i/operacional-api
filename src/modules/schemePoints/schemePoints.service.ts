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

type PLimitFn = (
  concurrency: number
) => <T>(fn: () => Promise<T>) => Promise<T>;

type PointRow = {
  id: string;
  ordem: number;
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

let pLimitPromise: Promise<PLimitFn> | null = null;

async function getPLimit(): Promise<PLimitFn> {
  if (!pLimitPromise) {
    pLimitPromise = import("p-limit").then((m: any) => m.default as PLimitFn);
  }
  return pLimitPromise;
}

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

async function updatePointSegmentDistanceAndTime(params: {
  pointId: string;
  distanceKm: number | null;
  durationMin?: number | null;
  roadSegmentUuid?: string | null;
}) {
  const payload: any = {
    distancia_km: params.distanceKm,
    updated_at: new Date().toISOString(),
  };

  if (params.durationMin !== null && params.durationMin !== undefined) {
    payload.tempo_deslocamento_min = params.durationMin;
  }

  // ✅ persiste link do trecho
  if (params.roadSegmentUuid !== undefined) {
    payload.road_segment_uuid = params.roadSegmentUuid; // pode ser null
  }

  const { error } = await supabase
    .from("scheme_points")
    .update(payload)
    .eq("id", params.pointId);

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
  const pLimit = await getPLimit();
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

      try {
        await updatePointSegmentDistanceAndTime({
          pointId: u.pointId,
          distanceKm: res.distanceKm,
          durationMin: res.durationMin,
          roadSegmentUuid: res.roadSegmentUuid ?? null,
        });

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

/**
 * Recalcula as distâncias (e tempo) de TODOS os trechos de um esquema.
 *
 * Regra:
 * - scheme_points.distancia_km é a distância do ponto anterior -> ponto atual
 * - então para i=2..N:
 *   calcula (i-1 -> i) e atualiza o ponto i
 */
export async function recalculateSchemePointsForScheme(
  schemeId: string,
  opts?: { calcConcurrency?: number; updateConcurrency?: number }
) {
  const pLimit = await getPLimit();
  const calcLimit = pLimit(opts?.calcConcurrency ?? 3);
  const updateLimit = pLimit(opts?.updateConcurrency ?? 6);

  const points = await getOrderedPointsForScheme(schemeId);

  // Precisa de pelo menos 2 pontos para ter trecho
  if (points.length < 2) {
    return {
      updatedPoints: 0,
      segmentsComputed: 0,
      segmentsFromCache: 0,
      segmentsFallback: 0,
      errorsCount: 0,
    };
  }

  // 1) Preparar trechos (prev -> cur), um por ponto (a partir do 2º)
  const segments = new Map<SegmentKey, { from: string; to: string }>();
  const updates: Array<{
    pointId: string;
    ordem: number;
    from: string;
    to: string;
  }> = [];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];

    if (!prev.location_id || !cur.location_id) continue;
    if (prev.location_id === cur.location_id) {
      // trecho trivial: distancia 0, tempo 0
      updates.push({
        pointId: cur.id,
        ordem: cur.ordem,
        from: prev.location_id,
        to: cur.location_id,
      });
      continue;
    }

    const key = segmentKey(prev.location_id, cur.location_id);
    segments.set(key, { from: prev.location_id, to: cur.location_id });

    updates.push({
      pointId: cur.id,
      ordem: cur.ordem,
      from: prev.location_id,
      to: cur.location_id,
    });
  }

  if (updates.length === 0) {
    return {
      updatedPoints: 0,
      segmentsComputed: 0,
      segmentsFromCache: 0,
      segmentsFallback: 0,
      errorsCount: 0,
    };
  }

  // 2) Calcular trechos deduplicados
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
        console.error("[recalc-scheme] erro ao calcular segmento:", { key, e });
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

  // 3) Aplicar updates nos points
  let updatedPoints = 0;

  const updateJobs = updates.map((u) =>
    updateLimit(async () => {
      try {
        // caso trivial (mesmo location): não passa pelo Map
        if (u.from === u.to) {
          await updatePointSegmentDistanceAndTime({
            pointId: u.pointId,
            distanceKm: 0,
            durationMin: 0,
            roadSegmentUuid: null,
          });
          updatedPoints++;
          return;
        }

        const key = segmentKey(u.from, u.to);
        const res = results.get(key);
        if (!res) return;

        await updatePointSegmentDistanceAndTime({
          pointId: u.pointId,
          distanceKm: res.distanceKm,
          durationMin: res.durationMin,
          roadSegmentUuid: res.roadSegmentUuid ?? null,
        });

        updatedPoints++;
      } catch (e) {
        errorsCount++;
        console.error("[recalc-scheme] erro ao atualizar scheme_point:", {
          pointId: u.pointId,
          e,
        });
      }
    })
  );

  await Promise.all(updateJobs);

  return {
    updatedPoints,
    segmentsComputed: segments.size,
    segmentsFromCache,
    segmentsFallback,
    errorsCount,
  };
}

/**
 * Preenche campos derivados dos points:
 * - distancia_acumulada_km
 * - velocidade_media_kmh
 * - chegada_offset_min / saida_offset_min
 *
 * Regra: ponto 1 começa em offset 0.
 * chegada_offset do ponto i = saida_offset do ponto i-1 + tempo_deslocamento_min(i)
 * saida_offset do ponto i = chegada_offset + tempo_no_local_min(i)
 */
export async function updateSchemePointsDerivedFields(schemeId: string) {
  const { data, error } = await supabase
    .from("scheme_points")
    .select(
      "id, ordem, distancia_km, tempo_deslocamento_min, tempo_no_local_min"
    )
    .eq("scheme_id", schemeId)
    .order("ordem", { ascending: true });

  if (error) throw error;

  const points = (data ?? []) as PointRow[];
  if (points.length === 0) return { updated: 0 };

  let cumulativeKm = 0;
  let prevSaidaOffset = 0;

  // Atualizações em memória
  const updates: Array<{
    id: string;
    distancia_acumulada_km: number;
    velocidade_media_kmh: number | null;
    chegada_offset_min: number;
    saida_offset_min: number;
  }> = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];

    if (i === 0 || p.ordem === 1) {
      // ponto 1: sem trecho
      const stop = p.tempo_no_local_min ?? 0;

      updates.push({
        id: p.id,
        distancia_acumulada_km: 0,
        velocidade_media_kmh: null,
        chegada_offset_min: 0,
        saida_offset_min: 0 + stop,
      });

      cumulativeKm = 0;
      prevSaidaOffset = 0 + stop;
      continue;
    }

    const dist = toNumber(p.distancia_km);
    const drive = p.tempo_deslocamento_min ?? 0;
    const stop = p.tempo_no_local_min ?? 0;

    cumulativeKm += dist;

    const chegada = prevSaidaOffset + drive;
    const saida = chegada + stop;

    const velocidade =
      drive > 0 && dist > 0 ? Number((dist / (drive / 60)).toFixed(1)) : null;

    updates.push({
      id: p.id,
      distancia_acumulada_km: cumulativeKm,
      velocidade_media_kmh: velocidade,
      chegada_offset_min: chegada,
      saida_offset_min: saida,
    });

    prevSaidaOffset = saida;
  }

  // Persistência (em lote, com concorrência pequena)
  let updated = 0;
  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("scheme_points")
      .update({
        distancia_acumulada_km: u.distancia_acumulada_km,
        velocidade_media_kmh: u.velocidade_media_kmh,
        chegada_offset_min: u.chegada_offset_min,
        saida_offset_min: u.saida_offset_min,
        updated_at: new Date().toISOString(),
      })
      .eq("id", u.id);

    if (upErr) throw upErr;
    updated++;
  }

  return { updated };
}
