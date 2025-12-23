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

  // NOVO (opcional)
  violation?: {
    id: string;
    type: // PARADA_330
    | "PARADA_330_NAO_REALIZADA"
      | "PARADA_330_FORA_DA_REGRA"
      | "PARADA_330_ANTECIPADA"
      | "PARADA_330_APOS_DADO_RUIM"
      // APOIO_495
      | "APOIO_495_NAO_REALIZADO"
      | "APOIO_495_FORA_DA_REGRA"
      | "APOIO_495_ANTECIPADO"
      | "APOIO_495_APOS_DADO_RUIM"
      //TROCA DE MOTORISTA
      | "TROCA_660_NAO_REALIZADA"
      | "TROCA_660_ANTECIPADA"
      | "TROCA_660_ATRASADA"
      | "TROCA_660_DENTRO_DA_REGRA";

    severity: "INFO" | "WARNING" | "BLOCKING";
    threshold_km?: number;
    current_km?: number;
    delta_km?: number;

    expected?: {
      function?: "DESCANSO" | "APOIO" | "TROCA_MOTORISTA";
      point_type?: "PA";
    };

    scope?: {
      to_ordem?: number;
      to_location_id?: string;
    };

    remediation?: {
      target_ordem?: number;
      target_location_id?: string;
      suggestion?: string;
    };
  };

  // NOVO (opcional)
  ui_hints?: {
    highlight_point?: boolean;
    highlight_style?: "warning" | "error" | "info";
    badges?: Array<{
      kind: "EXPECTED" | "APPLIED";
      function: "DESCANSO" | "APOIO" | "TROCA_MOTORISTA";

      icon: "WARNING" | "INFO";
      label?: string;
    }>;
  };
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

    const isDescanso330 = p.is_rest_stop === true;
    const isApoio495 = p.is_support_point === true;

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
   REGRA 330 – PARADA (DESCANSO)
   ======================= */
    if (isDescanso330) {
      const min = LIM_PARADA * FATOR_MIN_PARADA;

      if (kmDesdeParada < min) {
        const status: RuleStatus = dadoRuimDesdeUltimoReset
          ? "SUGESTAO"
          : "ALERTA";
        const type = dadoRuimDesdeUltimoReset
          ? "APOIO_495_APOS_DADO_RUIM"
          : "APOIO_495_ANTECIPADO";

        results.push({
          rule: "PARADA_330",
          status,
          message: dadoRuimDesdeUltimoReset
            ? `🟡 Parada após inconsistência de dados (${km(
                kmDesdeParada
              )}/${LIM_PARADA} km). Verifique trechos anteriores.`
            : `⚠️ Parada antecipada (${km(kmDesdeParada)}/${LIM_PARADA} km)`,

          violation: {
            id: crypto.randomUUID(),
            type,
            severity: status === "ALERTA" ? "WARNING" : "INFO",
            threshold_km: LIM_PARADA,
            current_km: kmDesdeParada,
            delta_km: kmDesdeParada - LIM_PARADA,
            expected: { function: "DESCANSO", point_type: "PA" },
            scope: { to_ordem: p.ordem, to_location_id: p.location_id },
            remediation: {
              target_ordem: p.ordem,
              target_location_id: p.location_id,
              suggestion:
                "Revisar trechos anteriores e validar se a parada foi inserida corretamente como PA/DESCANSO.",
            },
          },

          ui_hints: {
            highlight_point: true,
            highlight_style: status === "ALERTA" ? "warning" : "info",
            badges: [
              {
                kind: "APPLIED",
                function: "DESCANSO",
                icon: status === "ALERTA" ? "WARNING" : "INFO",
                label: "Descanso aplicado",
              },
            ],
          },
        });
      } else if (kmDesdeParada <= LIM_PARADA) {
        results.push({
          rule: "PARADA_330",
          status: "OK",
          message: `✅ Parada dentro da regra (${km(
            kmDesdeParada
          )}/${LIM_PARADA} km)`,

          ui_hints: {
            badges: [
              {
                kind: "APPLIED",
                function: "DESCANSO",
                icon: "INFO",
                label: "Descanso",
              },
            ],
          },
        });
      } else {
        results.push({
          rule: "PARADA_330",
          status: "ALERTA",
          message: `⚠️ Parada fora da regra (${km(
            kmDesdeParada
          )}/${LIM_PARADA} km)`,

          violation: {
            id: crypto.randomUUID(),
            type: "PARADA_330_FORA_DA_REGRA",
            severity: "WARNING",
            threshold_km: LIM_PARADA,
            current_km: kmDesdeParada,
            delta_km: kmDesdeParada - LIM_PARADA,
            expected: { function: "DESCANSO", point_type: "PA" },
            scope: { to_ordem: p.ordem, to_location_id: p.location_id },
            remediation: {
              target_ordem: p.ordem,
              target_location_id: p.location_id,
              suggestion:
                "A parada foi registrada tarde. Inserir/ajustar um PA com DESCANSO antes de exceder 330 km.",
            },
          },

          ui_hints: {
            highlight_point: true,
            highlight_style: "warning",
            badges: [
              {
                kind: "APPLIED",
                function: "DESCANSO",
                icon: "WARNING",
                label: "Descanso fora do limite",
              },
            ],
          },
        });
      }
    } else if (kmDesdeParada > LIM_PARADA && !alertado330 && dadosOk330) {
      results.push({
        rule: "PARADA_330",
        status: "ALERTA",
        message: `⚠️ Parada (descanso) não realizada (${km(
          kmDesdeParada
        )}/${LIM_PARADA} km)`,

        violation: {
          id: crypto.randomUUID(),
          type: "PARADA_330_NAO_REALIZADA",
          severity: "WARNING",
          threshold_km: LIM_PARADA,
          current_km: kmDesdeParada,
          delta_km: kmDesdeParada - LIM_PARADA,
          expected: { function: "DESCANSO", point_type: "PA" },
          scope: { to_ordem: p.ordem, to_location_id: p.location_id },
          remediation: {
            target_ordem: p.ordem,
            target_location_id: p.location_id,
            suggestion:
              "Inserir um ponto PA com função DESCANSO antes do trecho exceder 330 km.",
          },
        },

        ui_hints: {
          highlight_point: true,
          highlight_style: "warning",
          badges: [
            {
              kind: "EXPECTED",
              function: "DESCANSO",
              icon: "WARNING",
              label: "Descanso esperado",
            },
          ],
        },
      });

      alertado330 = true;
    }

    /* =======================
   REGRA 495 – APOIO
   ======================= */
    if (isDescanso330) {
      const min = LIM_APOIO * FATOR_MIN_APOIO;

      if (kmDesdeApoio < min) {
        const status: RuleStatus = dadoRuimDesdeUltimoReset
          ? "SUGESTAO"
          : "ALERTA";
        const type = dadoRuimDesdeUltimoReset
          ? "APOIO_495_NAO_REALIZADO" // após dado ruim, tratamos como orientação (sem acusar)
          : "APOIO_495_ANTECIPADO";

        results.push({
          rule: "APOIO_495",
          status,
          message: dadoRuimDesdeUltimoReset
            ? `🟡 Apoio após inconsistência de dados (${km(
                kmDesdeApoio
              )}/${LIM_APOIO} km). Verifique trechos anteriores.`
            : `⚠️ Ponto de apoio antecipado (${km(
                kmDesdeApoio
              )}/${LIM_APOIO} km)`,

          violation: {
            id: crypto.randomUUID(),
            type,
            severity: status === "ALERTA" ? "WARNING" : "INFO",
            threshold_km: LIM_APOIO,
            current_km: kmDesdeApoio,
            delta_km: kmDesdeApoio - LIM_APOIO,
            expected: { function: "APOIO", point_type: "PA" },
            scope: { to_ordem: p.ordem, to_location_id: p.location_id },
            remediation: {
              target_ordem: p.ordem,
              target_location_id: p.location_id,
              suggestion:
                "Revisar trechos anteriores e validar se o ponto de apoio foi registrado corretamente (PA/APOIO).",
            },
          },

          ui_hints: {
            highlight_point: true,
            highlight_style: status === "ALERTA" ? "warning" : "info",
            badges: [
              {
                kind: "APPLIED",
                function: "APOIO",
                icon: status === "ALERTA" ? "WARNING" : "INFO",
                label: "Apoio aplicado",
              },
            ],
          },
        });
      } else if (kmDesdeApoio <= LIM_APOIO) {
        results.push({
          rule: "APOIO_495",
          status: "OK",
          message: `✅ Ponto de apoio dentro da regra (${km(
            kmDesdeApoio
          )}/${LIM_APOIO} km)`,

          ui_hints: {
            badges: [
              {
                kind: "APPLIED",
                function: "APOIO",
                icon: "INFO",
                label: "Apoio",
              },
            ],
          },
        });
      } else {
        results.push({
          rule: "APOIO_495",
          status: "ALERTA",
          message: `⚠️ Ponto de apoio fora da regra (${km(
            kmDesdeApoio
          )}/${LIM_APOIO} km)`,

          violation: {
            id: crypto.randomUUID(),
            type: "APOIO_495_FORA_DA_REGRA",
            severity: "WARNING",
            threshold_km: LIM_APOIO,
            current_km: kmDesdeApoio,
            delta_km: kmDesdeApoio - LIM_APOIO,
            expected: { function: "APOIO", point_type: "PA" },
            scope: { to_ordem: p.ordem, to_location_id: p.location_id },
            remediation: {
              target_ordem: p.ordem,
              target_location_id: p.location_id,
              suggestion:
                "O apoio foi registrado tarde. Inserir/ajustar um PA com função APOIO antes de exceder 495 km.",
            },
          },

          ui_hints: {
            highlight_point: true,
            highlight_style: "warning",
            badges: [
              {
                kind: "APPLIED",
                function: "APOIO",
                icon: "WARNING",
                label: "Apoio fora do limite",
              },
            ],
          },
        });
      }
    } else if (kmDesdeApoio > LIM_APOIO && !alertado495 && dadosOk495) {
      results.push({
        rule: "APOIO_495",
        status: "ALERTA",
        message: `⚠️ Ponto de apoio não realizado (${km(
          kmDesdeApoio
        )}/${LIM_APOIO} km)`,

        violation: {
          id: crypto.randomUUID(),
          type: "APOIO_495_NAO_REALIZADO",
          severity: "WARNING",
          threshold_km: LIM_APOIO,
          current_km: kmDesdeApoio,
          delta_km: kmDesdeApoio - LIM_APOIO,
          expected: { function: "APOIO", point_type: "PA" },
          scope: { to_ordem: p.ordem, to_location_id: p.location_id },
          remediation: {
            target_ordem: p.ordem,
            target_location_id: p.location_id,
            suggestion:
              "Inserir um ponto PA com função APOIO antes do trecho exceder 495 km.",
          },
        },

        ui_hints: {
          highlight_point: true,
          highlight_style: "warning",
          badges: [
            {
              kind: "EXPECTED",
              function: "APOIO",
              icon: "WARNING",
              label: "Apoio esperado",
            },
          ],
        },
      });

      alertado495 = true;
    }

    // -------------------------
    // 2) RESET CENTRALIZADO EM PA
    // (após avaliar 330 e 495)
    // -------------------------
    if (isDescanso330) {
      kmDesdeParada = 0;
      kmDesdeApoio = 0;

      alertado330 = false;
      alertado495 = false;

      dadosOk330 = true;
      dadosOk495 = true;

      dadoRuimDesdeUltimoReset = false;
    }

    /* =======================
   REGRA 660 – TROCA MOTORISTA
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

          violation: {
            id: crypto.randomUUID(),
            type: "TROCA_660_ANTECIPADA",
            severity: "WARNING",
            threshold_km: LIM_TM,
            current_km: kmDesdeTM,
            delta_km: kmDesdeTM - LIM_TM,
            expected: { function: "TROCA_MOTORISTA" },
            scope: { to_ordem: p.ordem, to_location_id: p.location_id },
            remediation: {
              target_ordem: p.ordem,
              target_location_id: p.location_id,
              suggestion:
                "Troca registrada antes da faixa aceitável. Verificar se o ponto TMJ está correto ou se a marcação de troca_motorista está indevida.",
            },
          },

          ui_hints: {
            highlight_point: true,
            highlight_style: "warning",
            badges: [
              {
                kind: "APPLIED",
                function: "TROCA_MOTORISTA",
                icon: "WARNING",
                label: "Troca antecipada",
              },
            ],
          },
        });
      } else if (kmDesdeTM > upper) {
        results.push({
          rule: "TROCA_MOTORISTA_660",
          status: "ALERTA",
          message: `⚠️ Troca de motorista atrasada (${km(
            kmDesdeTM
          )}/${LIM_TM} km)`,

          violation: {
            id: crypto.randomUUID(),
            type: "TROCA_660_ATRASADA",
            severity: "WARNING",
            threshold_km: LIM_TM,
            current_km: kmDesdeTM,
            delta_km: kmDesdeTM - LIM_TM,
            expected: { function: "TROCA_MOTORISTA" },
            scope: { to_ordem: p.ordem, to_location_id: p.location_id },
            remediation: {
              target_ordem: p.ordem,
              target_location_id: p.location_id,
              suggestion:
                "Troca registrada após a faixa aceitável. Ajustar a posição do ponto de troca (TMJ) para atender a regra de 660 km.",
            },
          },

          ui_hints: {
            highlight_point: true,
            highlight_style: "warning",
            badges: [
              {
                kind: "APPLIED",
                function: "TROCA_MOTORISTA",
                icon: "WARNING",
                label: "Troca atrasada",
              },
            ],
          },
        });
      } else {
        results.push({
          rule: "TROCA_MOTORISTA_660",
          status: "OK",
          message: `✅ Troca de motorista dentro da regra (${km(
            kmDesdeTM
          )}/${LIM_TM} km)`,

          violation: {
            id: crypto.randomUUID(),
            type: "TROCA_660_DENTRO_DA_REGRA",
            severity: "INFO",
            threshold_km: LIM_TM,
            current_km: kmDesdeTM,
            delta_km: kmDesdeTM - LIM_TM,
            expected: { function: "TROCA_MOTORISTA" },
            scope: { to_ordem: p.ordem, to_location_id: p.location_id },
          },

          ui_hints: {
            badges: [
              {
                kind: "APPLIED",
                function: "TROCA_MOTORISTA",
                icon: "INFO",
                label: "Troca",
              },
            ],
          },
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

        violation: {
          id: crypto.randomUUID(),
          type: "TROCA_660_NAO_REALIZADA",
          severity: "WARNING",
          threshold_km: LIM_TM,
          current_km: kmDesdeTM,
          delta_km: kmDesdeTM - LIM_TM,
          expected: { function: "TROCA_MOTORISTA" },
          scope: { to_ordem: p.ordem, to_location_id: p.location_id },
          remediation: {
            target_ordem: p.ordem,
            target_location_id: p.location_id,
            suggestion:
              "Inserir um ponto de troca (TMJ) com troca_motorista=true antes do trecho exceder 660 km.",
          },
        },

        ui_hints: {
          highlight_point: true,
          highlight_style: "warning",
          badges: [
            {
              kind: "EXPECTED",
              function: "TROCA_MOTORISTA",
              icon: "WARNING",
              label: "Troca esperada",
            },
          ],
        },
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
