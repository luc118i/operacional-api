// src/modules/schemes/schemes.types.ts

import type { SchemePoint } from "../schemePoints";

/**
 * Esquema operacional (cabeçalho) conforme tabela `public.schemes`
 */
export interface Scheme {
  id: string;

  codigo: string;
  nome: string;

  origem_location_id: string;
  destino_location_id: string;

  distancia_total_km: number;

  ativo: boolean;

  created_at: string;
  updated_at?: string | null;

  // texto livre, ex: "32h30", "18:45", etc.
  trip_time?: string | null;

  // coluna `direction` da tabela (ida/volta, ou nulo se não definido)
  direction?: "ida" | "volta" | null;
}

/**
 * Esquema com dados das locations (JOIN em `locations`)
 */
export type SchemeWithLocations = Scheme & {
  origem_location?: {
    id: string;
    cidade: string;
    uf: string;
    descricao: string | null;
    lat: number;
    lng: number;
  } | null;
  destino_location?: {
    id: string;
    cidade: string;
    uf: string;
    descricao: string | null;
    lat: number;
    lng: number;
  } | null;
};

/**
 * Esquema com locations + pontos salvos na tabela `scheme_points`.
 * Esse tipo é bem útil pra:
 * - tela de detalhes,
 * - futura geração de PDF,
 * - exportação completa do esquema.
 */
export interface SchemeWithLocationsAndPoints extends SchemeWithLocations {
  points: SchemePoint[];
}

/**
 * Payload para criação de esquema.
 * (Sem id/created_at/updated_at)
 */
export interface CreateSchemeInput {
  codigo: string;
  nome: string;

  origem_location_id: string;
  destino_location_id: string;

  distancia_total_km: number;

  ativo?: boolean;

  // se já quiser salvar sentido:
  direction?: "ida" | "volta" | null;

  // se quiser já enviar trip_time na criação:
  trip_time?: string | null;
}

/**
 * Payload para atualização de esquema.
 * (todos os campos opcionais)
 */
export interface UpdateSchemeInput {
  codigo?: string;
  nome?: string;

  origem_location_id?: string;
  destino_location_id?: string;

  distancia_total_km?: number;

  ativo?: boolean;

  direction?: "ida" | "volta" | null;
  trip_time?: string | null;
}

/**
 * Esquema + resumo calculado (regras de negócio)
 */
export interface SchemeWithSummary {
  scheme: SchemeWithLocations;
  summary: SchemeSummary;
}

/**
 * Resumo analítico do esquema (para validações, dashboards, etc.)
 */
export interface SchemeSummary {
  schemeId: string;
  schemeCodigo: string;
  schemeNome: string;

  // Distância total do esquema
  totalKm: number;

  // TOTAL de registros na tabela scheme_points (PE, PD, PA, AP, etc)
  totalStops: number;

  // 🆕 Regras de negócio simplificadas:
  // - Paradas = totalStops
  // - Pontos  = totalStops - PD
  totalParadas: number; // = totalStops
  totalPontos: number; // = totalStops - (countsByType["PD"] ?? 0)

  // Paradas esperadas pela regra de 495 km (ponto de apoio)
  expectedStops: {
    value: number;
    totalKm: number;
    ruleKm: number;
  };

  // Tempos (minutos)
  totalTravelMinutes: number; // tempo rodando
  totalStopMinutes: number; // tempo parado
  totalDurationMinutes: number; // total (parado + rodando)
  averageSpeedKmH: number | null;

  // Quantidade por tipo (PE, PD, PA, AP, etc)
  countsByType: Record<string, number>;

  // Quantidade de trechos > 200 km
  longSegmentsCount: number;

  // Status geral das regras do esquema
  rulesStatus: {
    status: "OK" | "WARNING" | "ERROR";
    message: string;
  };
}
