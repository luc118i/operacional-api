"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllSchemePoints = getAllSchemePoints;
exports.getSchemePointById = getSchemePointById;
exports.getSchemePointsBySchemeId = getSchemePointsBySchemeId;
exports.createSchemePoint = createSchemePoint;
exports.updateSchemePoint = updateSchemePoint;
exports.deleteSchemePoint = deleteSchemePoint;
exports.setSchemePointsForScheme = setSchemePointsForScheme;
// src/modules/schemePoints/schemePoints.service.ts
const upabaseClient_1 = require("../../config/upabaseClient");
/**
 * Busca TODOS os pontos de TODOS os esquemas.
 * Útil mais pra debug/admin.
 */
async function getAllSchemePoints() {
    const { data, error } = await upabaseClient_1.supabase
        .from("scheme_points")
        .select("*")
        .order("scheme_id", { ascending: true })
        .order("ordem", { ascending: true });
    if (error) {
        console.error("[getAllSchemePoints] erro:", error);
        throw new Error("Erro ao buscar pontos de esquema operacional");
    }
    return (data ?? []);
}
/**
 * Busca um ponto específico pelo ID.
 */
async function getSchemePointById(id) {
    const { data, error } = await upabaseClient_1.supabase
        .from("scheme_points")
        .select("*")
        .eq("id", id)
        .single();
    if (error) {
        // PGRST116 = "Row not found"
        if (error.code === "PGRST116") {
            return null;
        }
        console.error("[getSchemePointById] erro:", error);
        throw new Error("Erro ao buscar ponto de esquema operacional");
    }
    return data;
}
/**
 * Busca todos os pontos de um esquema, ordenados pela ordem.
 */
async function getSchemePointsBySchemeId(schemeId) {
    const { data, error } = await upabaseClient_1.supabase
        .from("scheme_points")
        .select(`
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
    `)
        .eq("scheme_id", schemeId)
        .order("ordem", { ascending: true });
    if (error) {
        console.error("[getSchemePointsBySchemeId] erro:", error);
        throw new Error("Erro ao buscar pontos do esquema operacional");
    }
    return (data ?? []);
}
/**
 * Cria um único ponto.
 */
async function createSchemePoint(input) {
    const { data, error } = await upabaseClient_1.supabase
        .from("scheme_points")
        .insert(input)
        .select("*")
        .single();
    if (error) {
        console.error("[createSchemePoint] erro:", error);
        throw new Error("Erro ao criar ponto de esquema operacional");
    }
    return data;
}
/**
 * Atualiza um ponto específico.
 */
async function updateSchemePoint(id, input) {
    const { data, error } = await upabaseClient_1.supabase
        .from("scheme_points")
        .update(input)
        .eq("id", id)
        .select("*")
        .single();
    if (error) {
        if (error.code === "PGRST116") {
            return null;
        }
        console.error("[updateSchemePoint] erro:", error);
        throw new Error("Erro ao atualizar ponto de esquema operacional");
    }
    return data;
}
/**
 * Exclui um ponto específico.
 */
async function deleteSchemePoint(id) {
    const { error } = await upabaseClient_1.supabase.from("scheme_points").delete().eq("id", id);
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
async function setSchemePointsForScheme(schemeId, points) {
    // segurança: garantir que todos têm o mesmo scheme_id
    const normalizedPoints = points.map((p, index) => ({
        ...p,
        scheme_id: schemeId,
        // se não vier ordem, usa o índice
        ordem: p.ordem ?? index,
    }));
    // 1) apaga os pontos anteriores
    const { error: deleteError } = await upabaseClient_1.supabase
        .from("scheme_points")
        .delete()
        .eq("scheme_id", schemeId);
    if (deleteError) {
        console.error("[setSchemePointsForScheme] erro ao limpar pontos antigos:", deleteError);
        throw new Error("Erro ao limpar pontos anteriores do esquema operacional");
    }
    if (normalizedPoints.length === 0) {
        return [];
    }
    // 2) insere os novos
    const { data, error: insertError } = await upabaseClient_1.supabase
        .from("scheme_points")
        .insert(normalizedPoints)
        .select("*")
        .order("ordem", { ascending: true });
    if (insertError) {
        console.error("[setSchemePointsForScheme] erro ao inserir novos pontos:", insertError);
        throw new Error("Erro ao salvar pontos do esquema operacional");
    }
    return (data ?? []);
}
