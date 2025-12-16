// src/modules/schemePoints/schemePoints.rules.ts
import type { SchemePoint } from "./schemePoints.types";

export type RuleStatus = "OK" | "ALERTA" | "SUGESTAO";
export type RuleCode =
  | "PARADA_330"
  | "APOIO_495"
  | "TROCA_MOTORISTA_660"
  | "DADO_DISTANCIA_KM";

const LIM_PARADA = 330;
const LIM_APOIO = 495;
const LIM_TM = 660;

const FATOR_MIN_PARADA = 0.35;
const FATOR_MIN_APOIO = 0.35;

const TM_TOL = 0.1; // ±10%

// Qualidade de dado
const LIM_TRECHO_MAX = 700;

export interface RuleResult {
  rule: RuleCode;
  status: RuleStatus;
  message: string;
}

export interface SchemePointEvaluation {
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

  // evita “spam” de alertas após estourar o limite
  let alertado330 = false;
  let alertado495 = false;
  let alertado660 = false;

  // se dados “quebraram” desde o último reset, não pode acusar “não realizada”
  let dadoRuimDesdeUltimoReset = false;
  let dadosOk330 = true;
  let dadosOk495 = true;
  let dadosOk660 = true;

  const output: SchemePointEvaluation[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const results: RuleResult[] = [];

    const isApoio = p.tipo === "PA"; // PA valida 330 e 495
    const isTM = p.troca_motorista === true;

    // -------------------------
    // 1) SANITY CHECK DO TRECHO
    // -------------------------
    if (i > 0) {
      const trecho = p.distancia_km ?? 0;

      const suspeitoZero = trecho === 0;
      const foraPadrao = trecho > LIM_TRECHO_MAX;

      if (foraPadrao || suspeitoZero) {
        dadoRuimDesdeUltimoReset = true;

        // travar “não realizada” até um reset válido
        dadosOk330 = false;
        dadosOk495 = false;
        dadosOk660 = false;

        results.push({
          rule: "DADO_DISTANCIA_KM",
          status: "SUGESTAO",
          message: foraPadrao
            ? `🟡 Trecho fora do padrão (${km(
                trecho
              )} km > ${LIM_TRECHO_MAX} km). Verifique a distancia_km do ponto.`
            : `🟡 Trecho com km zerado (0,0 km). Verifique a distancia_km do ponto.`,
        });

        // não soma esse trecho nas janelas
      } else {
        kmDesdeParada += trecho;
        kmDesdeApoio += trecho;
        kmDesdeTM += trecho;
      }
    }

    /* =======================
       REGRA 330 – PARADA (OK só em PA)
       ======================= */
    if (isApoio) {
      const min = LIM_PARADA * FATOR_MIN_PARADA;

      if (kmDesdeParada < min) {
        results.push({
          rule: "PARADA_330",
          status: dadoRuimDesdeUltimoReset ? "SUGESTAO" : "ALERTA",
          message: dadoRuimDesdeUltimoReset
            ? `🟡 Parada após inconsistência de dados (${km(
                kmDesdeParada
              )}/${LIM_PARADA} km). Verifique trechos anteriores.`
            : `⚠️ Parada antecipada (${km(kmDesdeParada)}/${LIM_PARADA} km)`,
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
    } else if (kmDesdeParada > LIM_PARADA && !alertado330 && dadosOk330) {
      results.push({
        rule: "PARADA_330",
        status: "ALERTA",
        message: `⚠️ Parada (descanso) não realizada (${km(
          kmDesdeParada
        )}/${LIM_PARADA} km)`,
      });
      alertado330 = true;
    }

    /* =======================
       REGRA 495 – APOIO (OK só em PA)
       ======================= */
    if (isApoio) {
      const min = LIM_APOIO * FATOR_MIN_APOIO;

      if (kmDesdeApoio < min) {
        results.push({
          rule: "APOIO_495",
          status: dadoRuimDesdeUltimoReset ? "SUGESTAO" : "ALERTA",
          message: dadoRuimDesdeUltimoReset
            ? `🟡 Apoio após inconsistência de dados (${km(
                kmDesdeApoio
              )}/${LIM_APOIO} km). Verifique trechos anteriores.`
            : `⚠️ Ponto de apoio antecipado (${km(
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
    } else if (kmDesdeApoio > LIM_APOIO && !alertado495 && dadosOk495) {
      results.push({
        rule: "APOIO_495",
        status: "ALERTA",
        message: `⚠️ Ponto de apoio não realizado (${km(
          kmDesdeApoio
        )}/${LIM_APOIO} km)`,
      });
      alertado495 = true;
    }

    // -------------------------
    // 2) RESET CENTRALIZADO EM PA
    // (após avaliar 330 e 495)
    // -------------------------
    if (isApoio) {
      kmDesdeParada = 0;
      kmDesdeApoio = 0;

      alertado330 = false;
      alertado495 = false;

      dadosOk330 = true;
      dadosOk495 = true;

      dadoRuimDesdeUltimoReset = false;
    }

    /* =======================
       REGRA 660 – TROCA MOTORISTA (OK só quando isTM)
       ======================= */
    if (isTM) {
      const lower = LIM_TM * (1 - TM_TOL);
      const upper = LIM_TM * (1 + TM_TOL);

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
      alertado660 = false;
      dadosOk660 = true;
    } else if (kmDesdeTM > LIM_TM && !alertado660 && dadosOk660) {
      results.push({
        rule: "TROCA_MOTORISTA_660",
        status: "ALERTA",
        message: `⚠️ Troca de motorista não realizada (${km(
          kmDesdeTM
        )}/${LIM_TM} km)`,
      });
      alertado660 = true;
    }

    output.push({
      ordem: p.ordem,
      location_id: p.location_id,
      results,
    });
  }

  return output;
}
