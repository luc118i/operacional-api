import type { SchemePointEvaluation } from "./schemePoints.rules";

export type RulesEvaluation = {
  totalAlertas: number;
  totalSugestoes: number;
  statusGeral: "OK" | "WARNING" | "CRITICAL";
  mensagem: string;
};

export function buildRulesEvaluation(
  evaluations: SchemePointEvaluation[]
): RulesEvaluation {
  let totalAlertas = 0;
  let totalSugestoes = 0;

  for (const e of evaluations) {
    for (const r of e.results) {
      if (r.status === "ALERTA") totalAlertas++;
      if (r.status === "SUGESTAO") totalSugestoes++;
    }
  }

  const statusGeral: RulesEvaluation["statusGeral"] =
    totalAlertas > 0 ? "CRITICAL" : totalSugestoes > 0 ? "WARNING" : "OK";

  const mensagem =
    statusGeral === "CRITICAL"
      ? `Há ${totalAlertas} alerta(s) de regra para revisão.`
      : statusGeral === "WARNING"
      ? `Há ${totalSugestoes} sugestão(ões) de qualidade de dado para revisar.`
      : "Regras OK (sem alertas/sugestões).";

  return { totalAlertas, totalSugestoes, statusGeral, mensagem };
}
