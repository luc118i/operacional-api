// src/modules/roadSegments/roadSegments.service.ts

import { supabase } from "../../config/upabaseClient";
import type {
  RoadDistanceResult,
  RoadSegmentCacheRow,
} from "./roadSegments.types";
("");

type InflightKey = string;

type RoadSegmentUpsertRow = Pick<
  RoadSegmentCacheRow,
  "road_segment_uuid" | "distance_km" | "duration_min"
>;

const FALLBACK_UPGRADE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h (ajuste: 1h/24h)
const STALE_COOLDOWN_MS = 30_000; // já está no seu código

function ageMsFromUpdatedAt(updated_at?: string | null): number | null {
  if (!updated_at) return null;
  const t = Date.parse(String(updated_at));
  if (!Number.isFinite(t)) return null;
  const age = Date.now() - t;
  return age >= 0 ? age : null;
}

function shouldAttemptUpgradeFromFallback(
  segment?: RoadSegmentCacheRow | null
) {
  if (!segment) return false;
  if (segment.stale !== false) return false;
  if (segment.source !== "fallback") return false;

  const age = ageMsFromUpdatedAt(segment.updated_at);
  if (age === null) return true; // se não dá pra saber, tenta
  return age >= FALLBACK_UPGRADE_AFTER_MS;
}

// single-flight por processo (worker)
const inflight = new Map<InflightKey, Promise<RoadDistanceResult>>();

function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function inflightKey(fromId: string, toId: string): InflightKey {
  return `${fromId}|${toId}`;
}

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

type ORSResult = {
  distanceKm: number;
  durationMin: number | null;
  source: "ors";
};
type ORSErrorInfo = {
  status?: number;
  code?: number; // ex.: 2010
  message?: string;
  raw?: any;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(
  url: string,
  init: any,
  timeoutMs: number
): Promise<any> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url as any, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function isTransientHttp(status?: number) {
  return status === 429 || (status != null && status >= 500);
}

function parseORSError(bodyText: string, status?: number): ORSErrorInfo {
  try {
    const j = JSON.parse(bodyText);
    // ORS costuma devolver erro com "error": { "code": 2010, "message": "..." } ou variações
    const code =
      j?.error?.code ??
      j?.error?.error_code ??
      j?.code ??
      j?.error_code ??
      undefined;

    const message =
      j?.error?.message ??
      j?.error?.error ??
      j?.message ??
      j?.error ??
      bodyText;

    return {
      status,
      code: typeof code === "number" ? code : undefined,
      message,
      raw: j,
    };
  } catch {
    return { status, message: bodyText };
  }
}

async function tryLockRoadSegment(fromId: string, toId: string) {
  const { data, error } = await supabase.rpc("try_lock_road_segment", {
    from_id: fromId,
    to_id: toId,
  });

  if (error) {
    console.error("[lock] try_lock_road_segment error:", error);
    return { locked: true, lockSupported: false };
  }

  return { locked: Boolean(data), lockSupported: true };
}

async function unlockRoadSegment(fromId: string, toId: string): Promise<void> {
  const { error } = await supabase.rpc("unlock_road_segment", {
    from_id: fromId,
    to_id: toId,
  });

  if (error) {
    console.error("[lock] unlock_road_segment error:", error);
  }
}

async function callORSWithRadiuses(
  apiKey: string,
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number
): Promise<ORSResult> {
  const url = "https://api.openrouteservice.org/v2/directions/driving-car";

  // tenta radiuses 500, depois 2000
  const radiusesList = [
    [500, 500],
    [2000, 2000],
  ];

  // retry em erros transitórios (timeout/5xx/429) por tentativa de radius
  const maxRetries = 2;
  const timeoutMs = 12000;

  let lastErr: ORSErrorInfo | null = null;

  for (const radiuses of radiusesList) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: {
              Authorization: apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              coordinates: [
                [fromLng, fromLat],
                [toLng, toLat],
              ],
              radiuses,
            }),
          },
          timeoutMs
        );

        if (!resp.ok) {
          const body = await resp.text();
          const info = parseORSError(body, resp.status);
          lastErr = info;

          // erro estrutural (ex.: 2010) -> não adianta retry
          if (info.code === 2010)
            throw Object.assign(new Error("ORS_2010"), { ors: info });

          // erro transitório -> retry com backoff curto
          if (isTransientHttp(resp.status) && attempt < maxRetries) {
            await sleep(250 * (attempt + 1));
            continue;
          }

          throw Object.assign(new Error("ORS_HTTP_ERROR"), { ors: info });
        }

        const data = (await resp.json()) as any;
        const seg = data?.features?.[0]?.properties?.segments?.[0];
        const meters = seg?.distance;
        const seconds = seg?.duration;

        if (typeof meters !== "number") {
          throw Object.assign(new Error("ORS_INVALID_DISTANCE"), {
            ors: { raw: data },
          });
        }

        const distanceKm = Number((meters / 1000).toFixed(2));
        const durationMin =
          typeof seconds === "number"
            ? Math.max(0, Math.round(seconds / 60))
            : null;

        return { distanceKm, durationMin, source: "ors" };
      } catch (e: any) {
        // abort/timeout costuma cair aqui também
        const info: ORSErrorInfo | undefined = e?.ors;

        // 2010: ponto não roteável -> encerra radiuses e cai fora para fallback
        if (e?.message === "ORS_2010" || info?.code === 2010) {
          throw e;
        }

        // timeout/abort ou transitório sem status -> retry local
        if (attempt < maxRetries) {
          await sleep(250 * (attempt + 1));
          continue;
        }

        // esgota retries: tenta próximo radius ou falha final
        lastErr = info ?? lastErr ?? { message: String(e?.message ?? e) };
        break;
      }
    }
  }

  throw Object.assign(new Error("ORS_FAILED"), { ors: lastErr });
}

export async function getOrCreateRoadSegmentDistanceKm(
  fromLocationId: string,
  toLocationId: string
): Promise<RoadDistanceResult> {
  // Caso trivial
  if (fromLocationId === toLocationId) {
    return {
      roadSegmentUuid: null,
      distanceKm: 0,
      durationMin: 0,
      cached: true,
      source: "db",
    };
  }

  // ✅ Single-flight por processo
  const key = inflightKey(fromLocationId, toLocationId);
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<RoadDistanceResult> => {
    // helper: lê cache e valida (inclui uuid)
    const readValidCache = async (): Promise<RoadDistanceResult | null> => {
      const { data: seg, error: segErr } = await supabase
        .from("road_segments")
        .select(
          "road_segment_uuid, distance_km, duration_min, stale, updated_at, source"
        )
        .eq("from_location_id", fromLocationId)
        .eq("to_location_id", toLocationId)
        .maybeSingle<RoadSegmentCacheRow>();

      if (segErr) {
        console.error("[road_segments] erro ao buscar:", segErr);
        return null;
      }

      const dist = seg ? toNumber(seg.distance_km) : null;
      const uuid = seg?.road_segment_uuid
        ? String(seg.road_segment_uuid)
        : null;

      // cache só é "válido" se tiver distância e uuid e stale=false
      const hasValidCache = seg?.stale === false && dist != null && !!uuid;

      if (!hasValidCache) return null;

      // Se for fallback antigo e você quiser upgrade, deixe o caller decidir
      if (shouldAttemptUpgradeFromFallback(seg)) return null;

      return {
        roadSegmentUuid: uuid,
        distanceKm: dist!,
        durationMin: toNumber(seg.duration_min),
        cached: true,
        source: "db",
      };
    };

    // 1) Cache válido retorna imediatamente
    const cached = await readValidCache();
    if (cached) return cached;

    // 1.5) Lock cross-instance
    const { locked, lockSupported } = await tryLockRoadSegment(
      fromLocationId,
      toLocationId
    );

    // ✅ Sem lock: aguarda e tenta ler cache algumas vezes; se não aparecer, falha.
    if (!locked) {
      for (const waitMs of [300, 800, 1500]) {
        await sleep(waitMs);
        const cached2 = await readValidCache();
        if (cached2) return cached2;
      }

      throw new Error(
        `[road_segments] não foi possível obter lock e cache não apareceu a tempo (${fromLocationId} -> ${toLocationId})`
      );
    }

    try {
      // 2) Coordenadas
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
        throw new Error(
          "Origem ou destino não encontrado na tabela locations."
        );
      }

      const fromLat = Number(fromLoc.lat);
      const fromLng = Number(fromLoc.lng);
      const toLat = Number(toLoc.lat);
      const toLng = Number(toLoc.lng);

      if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
        throw new Error("Locais sem coordenadas válidas (lat/lng).");
      }

      // 3) ORS → fallback (aqui lock=true, então pode usar ORS se tiver key)
      let distanceKm: number;
      let durationMin: number | null = null;
      let calcSource: "ors" | "fallback" = "fallback";

      const apiKey = process.env.ORS_API_KEY;

      if (apiKey) {
        try {
          const ors = await callORSWithRadiuses(
            apiKey,
            fromLng,
            fromLat,
            toLng,
            toLat
          );
          distanceKm = ors.distanceKm;
          durationMin = ors.durationMin;
          calcSource = "ors";
        } catch (e: any) {
          console.error("[ORS] falhou, usando fallback:", e?.ors);
          distanceKm = haversineDistanceKm(fromLat, fromLng, toLat, toLng);
        }
      } else {
        distanceKm = haversineDistanceKm(fromLat, fromLng, toLat, toLng);
      }

      // 5) Upsert (lock=true => sempre persiste)
      const { data: upserted, error: upsertError } = await supabase
        .from("road_segments")
        .upsert(
          {
            from_location_id: fromLocationId,
            to_location_id: toLocationId,
            distance_km: distanceKm,
            duration_min: durationMin,
            stale: false,
            source: calcSource,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "from_location_id,to_location_id" }
        )
        .select("road_segment_uuid, distance_km, duration_min")
        .maybeSingle<RoadSegmentUpsertRow>();

      if (upsertError) {
        console.error("[road_segments] erro no upsert:", upsertError);
        throw new Error(
          `[road_segments] upsert falhou (${fromLocationId} -> ${toLocationId})`
        );
      }

      const uuid = upserted?.road_segment_uuid
        ? String(upserted.road_segment_uuid)
        : null;

      if (!uuid) {
        throw new Error(
          `[road_segments] upsert não retornou road_segment_uuid (${fromLocationId} -> ${toLocationId})`
        );
      }

      return {
        roadSegmentUuid: uuid,
        distanceKm: toNumber(upserted?.distance_km) ?? distanceKm,
        durationMin: toNumber(upserted?.duration_min) ?? durationMin,
        cached: false,
        source: calcSource,
      };
    } finally {
      if (locked && lockSupported) {
        await unlockRoadSegment(fromLocationId, toLocationId);
      }
    }
  })();

  inflight.set(key, job);

  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}
