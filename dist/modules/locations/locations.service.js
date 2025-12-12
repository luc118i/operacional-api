"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllLocations = getAllLocations;
exports.getLocationById = getLocationById;
exports.searchLocations = searchLocations;
exports.getLocationBySigla = getLocationBySigla;
exports.createLocation = createLocation;
exports.updateLocation = updateLocation;
exports.deleteLocation = deleteLocation;
// src/modules/locations/locations.service.ts
const upabaseClient_1 = require("../../config/upabaseClient");
// Lista todos os locais
async function getAllLocations() {
    const { data, error } = await upabaseClient_1.supabase
        .from("locations")
        .select("*")
        .order("cidade", { ascending: true });
    if (error) {
        console.error("[getAllLocations] erro:", error);
        throw new Error("Erro ao buscar locais");
    }
    return (data ?? []);
}
// Busca por ID
async function getLocationById(id) {
    const { data, error } = await upabaseClient_1.supabase
        .from("locations")
        .select("*")
        .eq("id", id)
        .single();
    if (error) {
        console.error("[getLocationById] erro:", error);
        throw new Error("Erro ao buscar local");
    }
    return (data ?? null);
}
// Busca por texto (sigla, cidade, descrição, uf)
async function searchLocations(query) {
    const trimmed = query.trim();
    if (!trimmed) {
        return getAllLocations();
    }
    const { data, error } = await upabaseClient_1.supabase
        .from("locations")
        .select("*")
        .or(`sigla.ilike.%${trimmed}%,descricao.ilike.%${trimmed}%,cidade.ilike.%${trimmed}%,uf.ilike.%${trimmed}%`)
        .order("cidade", { ascending: true });
    if (error) {
        console.error("[searchLocations] erro:", error);
        throw new Error("Erro ao buscar locais");
    }
    return (data ?? []);
}
// Busca por SIGLA (exata, case-insensitive)
async function getLocationBySigla(sigla) {
    const trimmed = sigla.trim();
    if (!trimmed) {
        return null;
    }
    // Vamos padronizar a sigla em maiúsculo
    const normalized = trimmed.toUpperCase();
    const { data, error } = await upabaseClient_1.supabase
        .from("locations")
        .select("*")
        .eq("sigla", normalized)
        .limit(1);
    if (error) {
        console.error("[getLocationBySigla] erro:", error);
        throw new Error("Erro ao buscar local pela sigla");
    }
    if (!data || data.length === 0) {
        return null;
    }
    return data[0];
}
// Cria um novo local
async function createLocation(input) {
    const { data, error } = await upabaseClient_1.supabase
        .from("locations")
        .insert(input)
        .select("*")
        .single();
    if (error) {
        console.error("[createLocation] erro:", error);
        throw new Error("Erro ao criar local");
    }
    return data;
}
// Atualiza um local
async function updateLocation(id, input) {
    const { data, error } = await upabaseClient_1.supabase
        .from("locations")
        .update(input)
        .eq("id", id)
        .select("*")
        .single();
    if (error) {
        console.error("[updateLocation] erro:", error);
        throw new Error("Erro ao atualizar local");
    }
    return data;
}
// Remove um local
async function deleteLocation(id) {
    const { error } = await upabaseClient_1.supabase.from("locations").delete().eq("id", id);
    if (error) {
        console.error("[deleteLocation] erro:", error);
        throw new Error("Erro ao excluir local");
    }
}
