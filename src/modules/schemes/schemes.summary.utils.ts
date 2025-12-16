import type { SchemePointEvaluation } from "../schemePoints/schemePoints.rules";

interface RulesAggregation {
  totalAlertas: number;
  totalSugestoes: number;
  porRegra: Record<
    string,
    {
      alertas: number;
      sugestoes: number;
    }
  >;
  statusGeral: "OK" | "WARNING" | "CRITICAL";
  mensagem: string;
}

export function aggregateRulesResults(
  evaluations: SchemePointEvaluation[]
): RulesAggregation {
  let totalAlertas = 0;
  let totalSugestoes = 0;

  const porRegra: RulesAggregation["porRegra"] = {};

  for (const e of evaluations) {
    for (const r of e.results) {
      if (!porRegra[r.rule]) {
        porRegra[r.rule] = { alertas: 0, sugestoes: 0 };
      }

      if (r.status === "ALERTA") {
        totalAlertas++;
        porRegra[r.rule].alertas++;
      }

      if (r.status === "SUGESTAO") {
        totalSugestoes++;
        porRegra[r.rule].sugestoes++;
      }
    }
  }

  let statusGeral: RulesAggregation["statusGeral"] = "OK";
  let mensagem = "Dentro das regras operacionais";

  if (totalAlertas > 0) {
    statusGeral = "CRITICAL";
    mensagem = `${totalAlertas} alerta(s) de violação de regra`;
  } else if (totalSugestoes > 0) {
    statusGeral = "WARNING";
    mensagem = `${totalSugestoes} sugestão(ões) de ajuste operacional`;
  }

  return {
    totalAlertas,
    totalSugestoes,
    porRegra,
    statusGeral,
    mensagem,
  };
}
