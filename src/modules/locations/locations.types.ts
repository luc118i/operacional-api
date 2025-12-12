// src/modules/locations/locations.types.ts

// Ajuste esses campos para bater 100% com a tabela `locations` do Supabase
export interface Location {
  id: string;
  sigla: string;
  descricao: string;
  cidade: string;
  uf: string;
  tipo: string;
  lat: number;
  lng: number;
  created_at: string | null;
}

// Payload para criar um local (não envia id/created_at)
export type CreateLocationInput = Omit<Location, "id" | "created_at">;

// Payload para atualização parcial
export type UpdateLocationInput = Partial<CreateLocationInput>;
