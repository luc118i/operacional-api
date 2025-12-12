// src/modules/schemePoints/schemePoints.types.ts

// Se quiser deixar mais estrito:
export type SchemePointType = "PE" | "PD" | "PP" | "PA" | "TMJ" | string;

export interface SchemePoint {
  id: string;
  scheme_id: string;
  location_id: string;
  location?: {
    id: string;
    descricao: string;
    cidade: string;
    uf: string;
    lat: number;
    lng: number;
    tipo?: string | null;
    sigla?: string | null;
  } | null;

  // ordem do ponto no esquema (0 = inicial, 1, 2, 3...)
  ordem: number;

  // tipo do ponto (embarque, desembarque, parada, apoio, troca de motorista etc.)
  tipo: SchemePointType;

  // distância do ponto anterior até este (trecho)
  distancia_km: number | null;

  // distância acumulada desde a origem até este ponto
  distancia_acumulada_km: number | null;

  // tempo de deslocamento do ponto anterior até este (em minutos)
  tempo_deslocamento_min: number | null;

  // tempo parado neste ponto (em minutos)
  tempo_no_local_min: number | null;

  // velocidade média do trecho anterior (opcional)
  velocidade_media_kmh: number | null;

  // flags auxiliares
  is_initial: boolean;
  is_final: boolean;

  // info complementar
  estabelecimento?: string | null; // nome do posto / apoio / ponto comercial
  justificativa?: string | null; // ANTT / operacional / observações

  // horários relativos ao início da viagem (se você tiver essas colunas no banco)
  chegada_offset_min?: number | null;
  saida_offset_min?: number | null;

  created_at: string;
  updated_at?: string | null;
}

// Payload para criar um ponto de esquema
export interface CreateSchemePointInput {
  scheme_id: string;
  location_id: string;
  ordem: number;
  tipo: SchemePointType;

  distancia_km?: number | null;
  distancia_acumulada_km?: number | null;

  tempo_deslocamento_min?: number | null;
  tempo_no_local_min?: number | null;

  velocidade_media_kmh?: number | null;

  is_initial?: boolean;
  is_final?: boolean;

  estabelecimento?: string | null;
  justificativa?: string | null;

  chegada_offset_min?: number | null;
  saida_offset_min?: number | null;
}

// Payload para editar um ponto de esquema
export interface UpdateSchemePointInput {
  location_id?: string;
  ordem?: number;
  tipo?: SchemePointType;

  distancia_km?: number | null;
  distancia_acumulada_km?: number | null;

  tempo_deslocamento_min?: number | null;
  tempo_no_local_min?: number | null;

  velocidade_media_kmh?: number | null;

  is_initial?: boolean;
  is_final?: boolean;

  estabelecimento?: string | null;
  justificativa?: string | null;

  chegada_offset_min?: number | null;
  saida_offset_min?: number | null;
}
