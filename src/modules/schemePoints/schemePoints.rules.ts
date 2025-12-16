import type { SchemePoint } from "./schemePoints.types";

type RuleStatus = "OK" | "ALERTA";
type RuleCode = "PARADA_330" | "APOIO_495" | "TROCA_MOTORISTA_660";

const LIM_PARADA = 330;
const LIM_APOIO = 495;
const LIM_TM = 660;

const FATOR_MIN_PARADA = 0.35;
const FATOR_MIN_APOIO = 0.35;

const TM_TOL = 0.1; // ±10%

interface RuleResult {
  rule: RuleCode;
  status: RuleStatus;
  message: string;
}

interface SchemePointEvaluation {
  ordem: number;
  location_id: string;
  results: RuleResult[];
}

function km(n: number) {
  return n.toFixed(1).replace(".", ",");
}

export function evaluateSchemePoints(
  points: SchemePoint[]
): SchemePointEvaluation[] {
  let kmDesdeParada = 0;
  let kmDesdeApoio = 0;
  let kmDesdeTM = 0;

  const output: SchemePointEvaluation[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const results: RuleResult[] = [];

    // soma trecho anterior
    if (i > 0) {
      const trecho = points[i - 1].distancia_km ?? 0;
      kmDesdeParada += trecho;
      kmDesdeApoio += trecho;
      kmDesdeTM += trecho;
    }

    const isParadaGeral = p.tipo === "PE" || p.tipo === "PD" || p.tipo === "PA";
    const isApoio = p.tipo === "PA";
    const isTM = p.troca_motorista === true;

    /* =======================
       REGRA 330 – PARADA
       ======================= */
    if (isParadaGeral) {
      const min = LIM_PARADA * FATOR_MIN_PARADA;

      if (kmDesdeParada < min) {
        results.push({
          rule: "PARADA_330",
          status: "ALERTA",
          message: `⚠️ Parada antecipada (${km(
            kmDesdeParada
          )}/${LIM_PARADA} km)`,
        });
      } else if (kmDesdeParada <= LIM_PARADA) {
        results.push({
          rule: "PARADA_330",
          status: "OK",
          message: `✅ Parada dentro da regra (${km(
            kmDesdeParada
          )}/${LIM_PARADA} km)`,
        });
      } else {
        results.push({
          rule: "PARADA_330",
          status: "ALERTA",
          message: `⚠️ Parada fora da regra (${km(
            kmDesdeParada
          )}/${LIM_PARADA} km)`,
        });
      }

      kmDesdeParada = 0;
    } else if (kmDesdeParada > LIM_PARADA) {
      results.push({
        rule: "PARADA_330",
        status: "ALERTA",
        message: `⚠️ Parada não realizada (${km(
          kmDesdeParada
        )}/${LIM_PARADA} km)`,
      });
    }

    /* =======================
       REGRA 495 – APOIO
       ======================= */
    if (isApoio) {
      const min = LIM_APOIO * FATOR_MIN_APOIO;

      if (kmDesdeApoio < min) {
        results.push({
          rule: "APOIO_495",
          status: "ALERTA",
          message: `⚠️ Ponto de apoio antecipado (${km(
            kmDesdeApoio
          )}/${LIM_APOIO} km)`,
        });
      } else if (kmDesdeApoio <= LIM_APOIO) {
        results.push({
          rule: "APOIO_495",
          status: "OK",
          message: `✅ Ponto de apoio dentro da regra (${km(
            kmDesdeApoio
          )}/${LIM_APOIO} km)`,
        });
      } else {
        results.push({
          rule: "APOIO_495",
          status: "ALERTA",
          message: `⚠️ Ponto de apoio fora da regra (${km(
            kmDesdeApoio
          )}/${LIM_APOIO} km)`,
        });
      }

      kmDesdeApoio = 0;
    } else if (kmDesdeApoio > LIM_APOIO) {
      results.push({
        rule: "APOIO_495",
        status: "ALERTA",
        message: `⚠️ Ponto de apoio não realizado (${km(
          kmDesdeApoio
        )}/${LIM_APOIO} km)`,
      });
    }

    /* =======================
       REGRA 660 – TROCA MOTORISTA
       ======================= */
    if (isTM) {
      const lower = LIM_TM * (1 - 0.1);
      const upper = LIM_TM * (1 + 0.1);

      if (kmDesdeTM < lower) {
        results.push({
          rule: "TROCA_MOTORISTA_660",
          status: "ALERTA",
          message: `⚠️ Troca de motorista antecipada (${km(
            kmDesdeTM
          )}/${LIM_TM} km)`,
        });
      } else if (kmDesdeTM > upper) {
        results.push({
          rule: "TROCA_MOTORISTA_660",
          status: "ALERTA",
          message: `⚠️ Troca de motorista atrasada (${km(
            kmDesdeTM
          )}/${LIM_TM} km)`,
        });
      } else {
        results.push({
          rule: "TROCA_MOTORISTA_660",
          status: "OK",
          message: `✅ Troca de motorista dentro da regra (${km(
            kmDesdeTM
          )}/${LIM_TM} km)`,
        });
      }

      kmDesdeTM = 0;
    } else if (kmDesdeTM > LIM_TM) {
      results.push({
        rule: "TROCA_MOTORISTA_660",
        status: "ALERTA",
        message: `⚠️ Troca de motorista não realizada (${km(
          kmDesdeTM
        )}/${LIM_TM} km)`,
      });
    }

    output.push({
      ordem: p.ordem,
      location_id: p.location_id,
      results,
    });
  }

  return output;
}
