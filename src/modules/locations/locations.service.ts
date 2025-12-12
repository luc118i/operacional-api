// src/modules/locations/locations.service.ts
import { supabase } from "../../config/upabaseClient";
import type {
  Location,
  CreateLocationInput,
  UpdateLocationInput,
} from "./locations.types";

// Lista todos os locais
export async function getAllLocations(): Promise<Location[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .order("cidade", { ascending: true });

  if (error) {
    console.error("[getAllLocations] erro:", error);
    throw new Error("Erro ao buscar locais");
  }

  return (data ?? []) as Location[];
}

// Busca por ID
export async function getLocationById(id: string): Promise<Location | null> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[getLocationById] erro:", error);
    throw new Error("Erro ao buscar local");
  }

  return (data ?? null) as Location | null;
}

// Busca por texto (sigla, cidade, descrição, uf)
export async function searchLocations(query: string): Promise<Location[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    return getAllLocations();
  }

  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .or(
      `sigla.ilike.%${trimmed}%,descricao.ilike.%${trimmed}%,cidade.ilike.%${trimmed}%,uf.ilike.%${trimmed}%`
    )
    .order("cidade", { ascending: true });

  if (error) {
    console.error("[searchLocations] erro:", error);
    throw new Error("Erro ao buscar locais");
  }

  return (data ?? []) as Location[];
}

// Busca por SIGLA (exata, case-insensitive)
export async function getLocationBySigla(
  sigla: string
): Promise<Location | null> {
  const trimmed = sigla.trim();
  if (!trimmed) {
    return null;
  }

  // Vamos padronizar a sigla em maiúsculo
  const normalized = trimmed.toUpperCase();

  const { data, error } = await supabase
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

  return data[0] as Location;
}

// Cria um novo local
export async function createLocation(
  input: CreateLocationInput
): Promise<Location> {
  const { data, error } = await supabase
    .from("locations")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    console.error("[createLocation] erro:", error);
    throw new Error("Erro ao criar local");
  }

  return data as Location;
}

// Atualiza um local
export async function updateLocation(
  id: string,
  input: UpdateLocationInput
): Promise<Location> {
  const { data, error } = await supabase
    .from("locations")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[updateLocation] erro:", error);
    throw new Error("Erro ao atualizar local");
  }

  return data as Location;
}

// Remove um local
export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from("locations").delete().eq("id", id);

  if (error) {
    console.error("[deleteLocation] erro:", error);
    throw new Error("Erro ao excluir local");
  }
}
