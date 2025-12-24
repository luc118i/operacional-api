// src/modules/schemePoints/schemePoints.evaluation.types.ts
//
// Contratos (DTOs) do endpoint de avaliação de regras ANTT / operação.
// Objetivos:
// - Manter compatibilidade com o retorno atual: { rule, status, message }
// - Permitir enriquecimento estruturado via `violation` (envelope) e `ui_hints`
// - Garantir que a API siga como única fonte de verdade
//
// Observação: este arquivo define APENAS tipos/contratos. A lógica fica em:
// - schemePoints.rules.ts
// - schemePoints.evaluation.ts
//

import type { SchemePointType } from "./schemePoints.types";
// Se você já tiver PointFunction tipado em outro lugar (ex.: schemePoints.functions.ts),
// troque a definição abaixo por um import.
// import type { PointFunction } from "./schemePoints.functions";

/**
 * Funções ANTT/Operação por ponto.
 * Se você já usa `functions?: string[]` no SchemePoint, vale migrar para este tipo.
 */
export type PointFunction =
  | "DESCANSO"
  | "APOIO"
  | "TROCA_MOTORISTA"
  | "EMBARQUE"
  | "DESEMBARQUE"
  | "PARADA_LIVRE"
  | "OPERACIONAL";

/** Status geral por regra (compatível com seu JSON atual). */
export type EvaluationStatus = "OK" | "ALERTA" | "ERRO";

/** Severidade estruturada (para decisão de UX e auditoria). */
export type ViolationSeverity = "INFO" | "WARNING" | "BLOCKING";

/**
 * Tipos estruturados de violação.
 * Comece com o conjunto que você já possui no retorno atual.
 * Você pode adicionar novos tipos sem quebrar o front (desde que ele trate desconhecidos).
 */
export type ViolationType =
  | "PARADA_330_NAO_REALIZADA"
  | "PARADA_330_FORA_DA_REGRA"
  | "APOIO_495_NAO_REALIZADO"
  | "APOIO_495_FORA_DA_REGRA"
  | "APOIO_495_ANTECIPADO"
  | "TROCA_660_NAO_REALIZADA";

/**
 * Resposta do endpoint (v1) conforme retorno atual.
 * Mantém shape: scheme_id / quantidade / avaliacao[].
 */
export interface SchemePointsEvaluationResponseV1 {
  scheme_id: string;
  quantidade: number;
  avaliacao: SchemePointEvaluationItemV1[];
}

/**
 * Avaliação por item/ponto (v1).
 * `ordem` e `location_id` batem com o JSON atual.
 */
export interface SchemePointEvaluationItemV1 {
  ordem: number;
  location_id: string;
  results: RuleEvaluationResultV1[];
}

/**
 * Resultado de avaliação por regra (retrocompatível + extensível).
 * - `rule/status/message` permanecem obrigatórios.
 * - `violation` e `ui_hints` são opcionais e entram conforme evolução.
 */
export interface RuleEvaluationResultV1 {
  // --- Compatibilidade com retorno atual ---
  rule: string; // ex: "PARADA_330", "APOIO_495", "TROCA_MOTORISTA_660"
  status: EvaluationStatus;
  message: string;

  // --- Novo: envelope estruturado (quando status != OK ou quando quiser detalhar OK) ---
  violation?: ViolationEnvelopeV1;

  // --- Novo: dicas de UI (opcional). Sem lógica no front. ---
  ui_hints?: UIHintsV1;
}

/**
 * Envelope estruturado: a “verdade” detalhada da violação.
 * O front usa isso para orientar (ícones/scroll/highlight) SEM recalcular regra.
 */
export interface ViolationEnvelopeV1 {
  /** ID único gerado pela API (UUID). Útil p/ auditoria, logs, rastreio. */
  id: string;

  /** Tipo estruturado (enum) — não depende de parsing de message. */
  type: ViolationType;

  /** Severidade estruturada. */
  severity: ViolationSeverity;

  // --- Contexto numérico (quando aplicável) ---
  threshold_km?: number; // ex: 330, 495, 660
  current_km?: number; // ex: 337.6
  delta_km?: number; // ex: current - threshold

  // --- O que era esperado (sem o front deduzir) ---
  expected?: {
    function?: PointFunction; // ex: "DESCANSO"
    point_type?: Exclude<SchemePointType, null>; // ex: "PA", "TMJ" (se seu tipo for enum)
    min_count?: number; // se houver regras de quantidade
  };

  // --- Onde ocorreu (escopo do trecho) ---
  scope?: {
    from_ordem?: number;
    to_ordem?: number;
    from_location_id?: string;
    to_location_id?: string;
  };

  // --- Onde o usuário deve agir (para highlight/scroll e correção) ---
  remediation?: {
    target_ordem?: number;
    target_location_id?: string;
    suggestion?: string; // texto curto de ação sugerida (gerado pela API)
  };
}

/**
 * Dicas de UI emitidas pela API.
 * Importante: isso NÃO é regra, é orientação explícita para a interface.
 */
export interface UIHintsV1 {
  /** Destacar o card alvo (ou atual). */
  highlight_point?: boolean;

  /** Estilo do destaque (p/ consistência visual). */
  highlight_style?: "warning" | "error" | "info";

  /** Badges/ícones recomendados para o card (aplicados ou esperados). */
  badges?: Array<{
    kind: "EXPECTED" | "APPLIED";
    function: PointFunction;
    icon: "WARNING" | "INFO";
    label?: string;
  }>;

  /** Botão “Ir para o ponto” e scroll programático. */
  scroll_to?: {
    target_ordem: number;
    behavior?: "smooth" | "instant";
    offset_px?: number;
  };
}

/**
 * Helpers de type-guard opcionais (não obrigatórios).
 * Mantém o resto do código mais seguro sem poluir a regra.
 */
export function hasViolation(
  r: RuleEvaluationResultV1
): r is RuleEvaluationResultV1 & { violation: ViolationEnvelopeV1 } {
  return !!r.violation;
}

export function isNonOkStatus(status: EvaluationStatus): boolean {
  return status !== "OK";
}
