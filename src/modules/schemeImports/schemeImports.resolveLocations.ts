// src/modules/schemeImports/schemeImports.resolveLocations.ts

import { supabase } from "../../config/upabaseClient";
import type { SchemeImportBatch } from "./schemeImports.types";
import { normalizeText } from "./schemeImports.normalize";
import type { Location } from "../locations/locations.types";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export type ResolveLocationsResult = {
  totalPoints: number;
  resolvedPoints: number;
  missingCount: number;
  missing: Array<{
    descricaoNorm: string;
    descricaoRawSample: string;
    occurrences: number;
    examples: Array<{
      codigoLinha: string;
      sentido: string;
      horaPartida: string;
    }>;
  }>;
};

/**
 * Resolve locations para todos os points do batch.
 * Estratégia:
 * - normaliza descricao do CSV
 * - carrega locations
 * - normaliza descricao do banco
 * - match exato (norm x norm)
 */
export async function resolveLocations(
  batch: SchemeImportBatch
): Promise<ResolveLocationsResult> {
  let totalPoints = 0;
  let resolvedPoints = 0;

  // 1️⃣ Normalizar descrições dos pontos
  const normSet = new Set<string>();

  for (const scheme of batch.schemes) {
    for (const p of scheme.points) {
      totalPoints++;
      const norm = normalizeText(p.descricaoRaw);
      p.descricaoNorm = norm;
      normSet.add(norm);
    }
  }

  if (normSet.size === 0) {
    return {
      totalPoints,
      resolvedPoints: 0,
      missingCount: 0,
      missing: [],
    };
  }

  // 2️⃣ Buscar todas as locations (ou paginar se crescer muito)
  const { data, error } = await supabase
    .from("locations")
    .select("id, descricao");

  if (error) {
    console.error("[resolveLocations] erro ao buscar locations:", error);
    throw new Error("Erro ao buscar locations");
  }

  const locations = (data ?? []) as Pick<Location, "id" | "descricao">[];

  // 3️⃣ Criar map descricaoNorm → locationId
  const locationByNorm = new Map<string, string>();

  for (const loc of locations) {
    const norm = normalizeText(loc.descricao);
    if (!locationByNorm.has(norm)) {
      locationByNorm.set(norm, loc.id);
    }
  }

  // 4️⃣ Resolver pontos e montar missing
  const missingAgg = new Map<
    string,
    {
      occurrences: number;
      descricaoRawSample: string;
      examples: Array<{
        codigoLinha: string;
        sentido: string;
        horaPartida: string;
      }>;
    }
  >();

  for (const scheme of batch.schemes) {
    for (const p of scheme.points) {
      const norm = p.descricaoNorm!;
      const locationId = locationByNorm.get(norm);

      if (locationId) {
        p.locationId = locationId;
        resolvedPoints++;
      } else {
        const cur = missingAgg.get(norm) ?? {
          occurrences: 0,
          descricaoRawSample: p.descricaoRaw,
          examples: [],
        };

        cur.occurrences++;

        if (cur.examples.length < 5) {
          cur.examples.push({
            codigoLinha: scheme.codigoLinha,
            sentido: scheme.sentido,
            horaPartida: scheme.horaPartida,
          });
        }

        missingAgg.set(norm, cur);
      }
    }
  }

  const missing = [...missingAgg.entries()]
    .map(([descricaoNorm, info]) => ({
      descricaoNorm,
      descricaoRawSample: info.descricaoRawSample,
      occurrences: info.occurrences,
      examples: info.examples,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  return {
    totalPoints,
    resolvedPoints,
    missingCount: missing.length,
    missing,
  };
}
