// src/modules/schemePoints/schemePoints.types.ts

// Se quiser deixar mais estrito:
export type SchemePointType = string | null;

export type PointFunction =
  | "DESCANSO"
  | "APOIO"
  | "TROCA_MOTORISTA"
  | "EMBARQUE"
  | "DESEMBARQUE"
  | "PARADA_LIVRE"
  | "OPERACIONAL";

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
    tipo: string | null;
    sigla?: string | null;
  } | null;

  // 🔹 FUNÇÕES DO PONTO (ANTT / OPERAÇÃO)
  is_rest_stop: boolean;
  is_support_point: boolean;
  is_boarding_point: boolean;
  is_dropoff_point: boolean;
  is_free_stop: boolean;

  troca_motorista: boolean;
  ponto_operacional: boolean;

  ordem: number;
  tipo: SchemePointType;

  distancia_km: number | null;
  distancia_acumulada_km: number | null;

  tempo_deslocamento_min: number | null;
  tempo_no_local_min: number | null;

  velocidade_media_kmh: number | null;

  is_initial: boolean;
  is_final: boolean;

  estabelecimento?: string | null;
  justificativa?: string | null;

  chegada_offset_min?: number | null;
  saida_offset_min?: number | null;

  created_at: string;
  updated_at?: string | null;

  functions?: PointFunction[];

  road_segment_uuid?: string | null;
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

  troca_motorista?: boolean;
  ponto_operacional?: boolean;

  is_rest_stop?: boolean;
  is_support_point?: boolean;
  is_boarding_point?: boolean;
  is_dropoff_point?: boolean;
  is_free_stop?: boolean;

  functions?: PointFunction[];

  road_segment_uuid?: string | null;
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

  troca_motorista?: boolean;
  ponto_operacional?: boolean;

  is_rest_stop?: boolean;
  is_support_point?: boolean;
  is_boarding_point?: boolean;
  is_dropoff_point?: boolean;
  is_free_stop?: boolean;

  functions?: PointFunction[];

  road_segment_uuid?: string | null;
}
