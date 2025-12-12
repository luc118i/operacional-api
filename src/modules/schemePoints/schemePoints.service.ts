// src/modules/schemePoints/schemePoints.service.ts
import { supabase } from "../../config/upabaseClient";
import type {
  SchemePoint,
  CreateSchemePointInput,
  UpdateSchemePointInput,
} from "./schemePoints.types";

/**
 * Busca TODOS os pontos de TODOS os esquemas.
 * Útil mais pra debug/admin.
 */
export async function getAllSchemePoints(): Promise<SchemePoint[]> {
  const { data, error } = await supabase
    .from("scheme_points")
    .select("*")
    .order("scheme_id", { ascending: true })
    .order("ordem", { ascending: true });

  if (error) {
    console.error("[getAllSchemePoints] erro:", error);
    throw new Error("Erro ao buscar pontos de esquema operacional");
  }

  return (data ?? []) as SchemePoint[];
}

/**
 * Busca um ponto específico pelo ID.
 */
export async function getSchemePointById(
  id: string
): Promise<SchemePoint | null> {
  const { data, error } = await supabase
    .from("scheme_points")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 = "Row not found"
    if ((error as any).code === "PGRST116") {
      return null;
    }
    console.error("[getSchemePointById] erro:", error);
    throw new Error("Erro ao buscar ponto de esquema operacional");
  }

  return data as SchemePoint;
}

/**
 * Busca todos os pontos de um esquema, ordenados pela ordem.
 */
export async function getSchemePointsBySchemeId(
  schemeId: string
): Promise<SchemePoint[]> {
  const { data, error } = await supabase
    .from("scheme_points")
    .select(
      `
      *,
      location:locations (
        id,
        descricao,
        cidade,
        uf,
        lat,
        lng,
        tipo,
        sigla
      )
    `
    )
    .eq("scheme_id", schemeId)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("[getSchemePointsBySchemeId] erro:", error);
    throw new Error("Erro ao buscar pontos do esquema operacional");
  }

  return (data ?? []) as SchemePoint[];
}

/**
 * Cria um único ponto.
 */
export async function createSchemePoint(
  input: CreateSchemePointInput
): Promise<SchemePoint> {
  const { data, error } = await supabase
    .from("scheme_points")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    console.error("[createSchemePoint] erro:", error);
    throw new Error("Erro ao criar ponto de esquema operacional");
  }

  return data as SchemePoint;
}

/**
 * Atualiza um ponto específico.
 */
export async function updateSchemePoint(
  id: string,
  input: UpdateSchemePointInput
): Promise<SchemePoint | null> {
  const { data, error } = await supabase
    .from("scheme_points")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if ((error as any).code === "PGRST116") {
      return null;
    }
    console.error("[updateSchemePoint] erro:", error);
    throw new Error("Erro ao atualizar ponto de esquema operacional");
  }

  return data as SchemePoint;
}

/**
 * Exclui um ponto específico.
 */
export async function deleteSchemePoint(id: string): Promise<boolean> {
  const { error } = await supabase.from("scheme_points").delete().eq("id", id);

  if (error) {
    console.error("[deleteSchemePoint] erro:", error);
    throw new Error("Erro ao excluir ponto de esquema operacional");
  }

  return true;
}

/**
 * Substitui TODOS os pontos de um esquema por uma nova lista.
 * Isso é útil quando você salva o esquema inteiro vindo do front.
 *
 * Estratégia:
 * 1) Apaga todos os pontos do scheme_id
 * 2) Insere a nova lista (já com ordem correta)
 */
export async function setSchemePointsForScheme(
  schemeId: string,
  points: CreateSchemePointInput[]
): Promise<SchemePoint[]> {
  // segurança: garantir que todos têm o mesmo scheme_id
  const normalizedPoints = points.map((p, index) => ({
    ...p,
    scheme_id: schemeId,
    // se não vier ordem, usa o índice
    ordem: p.ordem ?? index,
  }));

  // 1) apaga os pontos anteriores
  const { error: deleteError } = await supabase
    .from("scheme_points")
    .delete()
    .eq("scheme_id", schemeId);

  if (deleteError) {
    console.error(
      "[setSchemePointsForScheme] erro ao limpar pontos antigos:",
      deleteError
    );
    throw new Error("Erro ao limpar pontos anteriores do esquema operacional");
  }

  if (normalizedPoints.length === 0) {
    return [];
  }

  // 2) insere os novos
  const { data, error: insertError } = await supabase
    .from("scheme_points")
    .insert(normalizedPoints)
    .select("*")
    .order("ordem", { ascending: true });

  if (insertError) {
    console.error(
      "[setSchemePointsForScheme] erro ao inserir novos pontos:",
      insertError
    );
    throw new Error("Erro ao salvar pontos do esquema operacional");
  }

  return (data ?? []) as SchemePoint[];
}
