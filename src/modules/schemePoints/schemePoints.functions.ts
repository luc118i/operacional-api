import type { SchemePoint } from "./schemePoints.types";

export type SchemePointFunction =
  | "DESCANSO"
  | "APOIO"
  | "TROCA_MOTORISTA"
  | "EMBARQUE"
  | "DESEMBARQUE"
  | "PARADA_LIVRE";

const ORDER: SchemePointFunction[] = [
  "TROCA_MOTORISTA",
  "APOIO",

  "PARADA_LIVRE",
  "EMBARQUE",
  "DESEMBARQUE",
  "DESCANSO",
];

export function deriveFunctionsFromFlags(
  p: Pick<
    SchemePoint,
    | "is_rest_stop"
    | "is_support_point"
    | "is_boarding_point"
    | "is_dropoff_point"
    | "is_free_stop"
    | "troca_motorista"
    | "ponto_operacional"
  >
): SchemePointFunction[] {
  const out: SchemePointFunction[] = [];

  if (p.troca_motorista) out.push("TROCA_MOTORISTA");
  if (p.is_support_point) out.push("APOIO");

  if (p.is_free_stop) out.push("PARADA_LIVRE");
  if (p.is_boarding_point) out.push("EMBARQUE");
  if (p.is_dropoff_point) out.push("DESEMBARQUE");
  if (p.is_rest_stop) out.push("DESCANSO");

  // ordena de forma estável (UX/consistência)
  out.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return out;
}

export function attachFunctionsToPoint(point: SchemePoint): SchemePoint {
  return {
    ...point,
    functions: deriveFunctionsFromFlags(point),
  };
}

export function attachFunctionsToPoints(points: SchemePoint[]): SchemePoint[] {
  return points.map(attachFunctionsToPoint);
}
