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

  // remove duplicados mantendo ordem
  return Array.from(new Set(out));
}

export function normalizeSchemePointInput<T extends AnyInput>(input: T): T {
  const functions = normalizeFunctions((input as any).functions);

  // defaults: sempre definimos flags para evitar undefined no banco
  const baseFlags = {
    is_rest_stop: false,
    is_support_point: false,
    is_boarding_point: false,
    is_dropoff_point: false,
    is_free_stop: false,
    troca_motorista: false,
    ponto_operacional: false,
  };

  // ✅ Se vier functions, ele manda (contrato público)
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

    return {
      ...(input as any),
      ...derived,
      // mantém functions normalizado para debug (não persiste no DB)
      functions,
    } as T;
  }

  // ✅ Legado (se algum cliente antigo ainda mandar flags diretamente)
  return {
    ...(input as any),
    is_rest_stop: asBool((input as any).is_rest_stop),
    is_support_point: asBool((input as any).is_support_point),
    is_boarding_point: asBool((input as any).is_boarding_point),
    is_dropoff_point: asBool((input as any).is_dropoff_point),
    is_free_stop: asBool((input as any).is_free_stop),
    troca_motorista: asBool((input as any).troca_motorista),
    ponto_operacional: asBool((input as any).ponto_operacional),
  } as T;
}
