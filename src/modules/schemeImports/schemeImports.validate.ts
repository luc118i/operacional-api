// src/modules/schemeImports/schemeImports.validate.ts

import type { SchemeImportBatch, ValidationIssue } from "./schemeImports.types";

export type DryRunValidationReport = {
  status: "VALID" | "INVALID";
  summary: {
    totalSchemes: number;
    validSchemes: number;
    invalidSchemes: number;
    totalPoints: number;
    missingLocationsUnique: number;
    missingLocationsOccurrences: number;
    errorsCount: number;
    warningsCount: number;
  };
  schemes: Array<{
    externalKey: string;
    codigoLinha: string;
    sentido: string;
    horaPartida: string;
    status: "VALID" | "INVALID";
    pointsCount: number;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  }>;
  missingLocations: Array<{
    descricaoNorm: string;
    descricaoRawSample: string;
    occurrences: number;
    examples: Array<{
      externalKey: string;
      codigoLinha: string;
      sentido: string;
      horaPartida: string;
    }>;
  }>;
};

export function validateImportBatch(
  batch: SchemeImportBatch
): DryRunValidationReport {
  let validSchemes = 0;
  let invalidSchemes = 0;
  let totalPoints = 0;
  let errorsCount = 0;
  let warningsCount = 0;

  // missingLocations agregado por descricaoNorm
  const missingAgg = new Map<
    string,
    {
      descricaoRawSample: string;
      occurrences: number;
      examples: Array<{
        externalKey: string;
        codigoLinha: string;
        sentido: string;
        horaPartida: string;
      }>;
    }
  >();

  const schemesReport: DryRunValidationReport["schemes"] = [];

  for (const scheme of batch.schemes) {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // Campos obrigatórios
    const requiredMissing: string[] = [];
    if (!scheme.codigoLinha?.trim()) requiredMissing.push("codigoLinha");
    if (!scheme.sentido?.trim()) requiredMissing.push("sentido");
    if (!scheme.horaPartida?.trim()) requiredMissing.push("horaPartida");

    if (requiredMissing.length > 0) {
      errors.push({
        code: "MISSING_REQUIRED_FIELDS",
        level: "ERROR",
        message: `Campos obrigatórios ausentes: ${requiredMissing.join(", ")}`,
        details: { requiredMissing },
      });
    }

    // Pontos mínimos
    const points = scheme.points ?? [];
    totalPoints += points.length;

    if (points.length < 2) {
      errors.push({
        code: "INSUFFICIENT_POINTS",
        level: "ERROR",
        message: "Esquema precisa ter pelo menos 2 pontos para formar trechos.",
        details: { pointsCount: points.length },
      });
    }

    // Sequência: duplicidade e ordem
    const seqSeen = new Set<number>();
    let lastSeq: number | null = null;

    // Também detecta pontos repetidos (mesma location)
    const locSeen = new Set<string>();

    for (const p of points) {
      // parada vazia assumida 0 (warning)
      if (p.paradaMin === 0) {
        // Só avisa se realmente veio “vazio” (sem como saber 100% aqui),
        // então aplicamos warning leve sem detalhes críticos.
        warnings.push({
          code: "EMPTY_PARADA_ASSUMED_ZERO",
          level: "WARNING",
          message:
            "Parada ausente/ inválida foi interpretada como 0 minuto(s).",
          details: { sequencia: p.sequencia, descricao: p.descricaoRaw },
        });
      }

      // sequência duplicada
      if (seqSeen.has(p.sequencia)) {
        errors.push({
          code: "DUPLICATE_SEQUENCE",
          level: "ERROR",
          message: `Sequência duplicada no esquema: ${p.sequencia}`,
          details: { sequencia: p.sequencia },
        });
      } else {
        seqSeen.add(p.sequencia);
      }

      // sequência não ascendente
      if (lastSeq !== null && p.sequencia <= lastSeq) {
        errors.push({
          code: "SEQUENCE_NOT_ASCENDING",
          level: "ERROR",
          message: `Sequência fora de ordem (não crescente). Atual: ${p.sequencia}, anterior: ${lastSeq}`,
          details: { current: p.sequencia, previous: lastSeq },
        });
      }
      lastSeq = p.sequencia;

      // location não encontrada
      if (!p.locationId) {
        const norm = p.descricaoNorm ?? p.descricaoRaw;

        errors.push({
          code: "LOCATION_NOT_FOUND",
          level: "ERROR",
          message: `Location não encontrada no banco: "${p.descricaoRaw}"`,
          details: {
            descricaoRaw: p.descricaoRaw,
            descricaoNorm: norm,
            sequencia: p.sequencia,
          },
        });

        // agrega missingLocations
        const cur = missingAgg.get(norm) ?? {
          descricaoRawSample: p.descricaoRaw,
          occurrences: 0,
          examples: [],
        };

        cur.occurrences += 1;

        if (cur.examples.length < 5) {
          cur.examples.push({
            externalKey: scheme.externalKey,
            codigoLinha: scheme.codigoLinha,
            sentido: scheme.sentido,
            horaPartida: scheme.horaPartida,
          });
        }

        missingAgg.set(norm, cur);
      } else {
        // duplicidade de location no mesmo esquema (warning)
        if (locSeen.has(p.locationId)) {
          warnings.push({
            code: "DUPLICATE_LOCATION_IN_SCHEME",
            level: "WARNING",
            message: "Location repetida dentro do mesmo esquema.",
            details: {
              locationId: p.locationId,
              sequencia: p.sequencia,
              descricao: p.descricaoRaw,
            },
          });
        } else {
          locSeen.add(p.locationId);
        }
      }
    }

    const status: "VALID" | "INVALID" = errors.length > 0 ? "INVALID" : "VALID";

    // guarda no próprio objeto (útil para COMMIT)
    scheme.status = status;
    scheme.errors = errors;
    scheme.warnings = warnings;

    if (status === "VALID") validSchemes++;
    else invalidSchemes++;

    errorsCount += errors.length;
    warningsCount += warnings.length;

    schemesReport.push({
      externalKey: scheme.externalKey,
      codigoLinha: scheme.codigoLinha,
      sentido: scheme.sentido,
      horaPartida: scheme.horaPartida,
      status,
      pointsCount: points.length,
      errors,
      warnings,
    });
  }

  const missingLocations = [...missingAgg.entries()]
    .map(([descricaoNorm, info]) => ({
      descricaoNorm,
      descricaoRawSample: info.descricaoRawSample,
      occurrences: info.occurrences,
      examples: info.examples,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  const missingOccurrences = missingLocations.reduce(
    (sum, x) => sum + x.occurrences,
    0
  );

  const overallStatus: "VALID" | "INVALID" =
    invalidSchemes > 0 ? "INVALID" : "VALID";

  return {
    status: overallStatus,
    summary: {
      totalSchemes: batch.schemes.length,
      validSchemes,
      invalidSchemes,
      totalPoints,
      missingLocationsUnique: missingLocations.length,
      missingLocationsOccurrences: missingOccurrences,
      errorsCount,
      warningsCount,
    },
    schemes: schemesReport,
    missingLocations,
  };
}
