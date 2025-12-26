import type {
  CreateSchemePointInput,
  UpdateSchemePointInput,
} from "./schemePoints.types";

type AnyInput = CreateSchemePointInput | UpdateSchemePointInput;

type FunctionKey =
  | "DESCANSO"
  | "APOIO"
  | "TROCA_MOTORISTA"
  | "EMBARQUE"
  | "DESEMBARQUE"
  | "PARADA_LIVRE"
  | "OPERACIONAL";

const ALLOWED = new Set<FunctionKey>([
  "DESCANSO",
  "APOIO",
  "TROCA_MOTORISTA",
  "EMBARQUE",
  "DESEMBARQUE",
  "PARADA_LIVRE",
  "OPERACIONAL",
]);

function asBool(v: any): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function normalizeFunctions(raw: any): FunctionKey[] | null {
  if (!Array.isArray(raw)) return null;

  const out: FunctionKey[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim().toUpperCase() as FunctionKey;
    if (ALLOWED.has(key)) out.push(key);
  }

  return Array.from(new Set(out));
}

function normalizeOrder(raw: any): number | undefined {
  // update pode vir sem ordem; nesse caso, não inventa
  if (raw == null) return undefined;

  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;

  const int = Math.trunc(n);
  if (int < 1) return 1;

  return int;
}

function isLikelyUuid(v: any): v is string {
  if (typeof v !== "string") return false;
  // validação simples (suficiente para evitar "" / lixo)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

export function normalizeSchemePointInput<T extends AnyInput>(input: T): T {
  const functions = normalizeFunctions((input as any).functions);

  const normalizedOrder = normalizeOrder((input as any).ordem);

  // road_segment_uuid (não inventa; só saneia)
  const rawRoadUuid = (input as any).road_segment_uuid;
  const road_segment_uuid = isLikelyUuid(rawRoadUuid) ? rawRoadUuid : null;

  const baseFlags = {
    is_rest_stop: false,
    is_support_point: false,
    is_boarding_point: false,
    is_dropoff_point: false,
    is_free_stop: false,
    troca_motorista: false,
    ponto_operacional: false,
  };

  // Helper: aplica regras de integridade finais
  const finalize = (obj: any) => {
    // normaliza ordem se vier
    if (normalizedOrder !== undefined) {
      obj.ordem = normalizedOrder;
    }

    // ✅ regra pedida: primeiro ponto nunca tem trecho
    if (obj.ordem === 1) {
      obj.road_segment_uuid = null;
    } else {
      // mantém (sanitizado) quando não é o primeiro
      // se input não trouxe nada válido, fica null
      obj.road_segment_uuid = road_segment_uuid;
    }

    // ✅ coerência com o front: ponto_operacional derivado das flags
    obj.ponto_operacional =
      asBool(obj.ponto_operacional) ||
      asBool(obj.troca_motorista) ||
      asBool(obj.is_rest_stop) ||
      asBool(obj.is_support_point) ||
      asBool(obj.is_boarding_point) ||
      asBool(obj.is_dropoff_point) ||
      asBool(obj.is_free_stop);

    return obj;
  };

  // Se vier functions, ele manda (contrato público)
  if (functions !== null) {
    const derived = { ...baseFlags };

    for (const fn of functions) {
      switch (fn) {
        case "DESCANSO":
          derived.is_rest_stop = true;
          break;
        case "APOIO":
          derived.is_support_point = true;
          break;
        case "TROCA_MOTORISTA":
          derived.troca_motorista = true;
          break;
        case "EMBARQUE":
          derived.is_boarding_point = true;
          break;
        case "DESEMBARQUE":
          derived.is_dropoff_point = true;
          break;
        case "PARADA_LIVRE":
          derived.is_free_stop = true;
          break;
        case "OPERACIONAL":
          derived.ponto_operacional = true;
          break;
      }
    }

    return finalize({
      ...(input as any),
      ...derived,
      // mantém functions normalizado para debug (não persiste no DB)
      functions,
    }) as T;
  }

  // Legado (cliente manda flags diretamente)
  return finalize({
    ...(input as any),
    is_rest_stop: asBool((input as any).is_rest_stop),
    is_support_point: asBool((input as any).is_support_point),
    is_boarding_point: asBool((input as any).is_boarding_point),
    is_dropoff_point: asBool((input as any).is_dropoff_point),
    is_free_stop: asBool((input as any).is_free_stop),
    troca_motorista: asBool((input as any).troca_motorista),
    ponto_operacional: asBool((input as any).ponto_operacional),
  }) as T;
}
