"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllSchemes = getAllSchemes;
exports.getAllSchemesWithSummary = getAllSchemesWithSummary;
exports.getSchemeById = getSchemeById;
exports.getSchemeByIdWithPoints = getSchemeByIdWithPoints;
exports.createScheme = createScheme;
exports.updateScheme = updateScheme;
exports.deleteScheme = deleteScheme;
exports.getSchemeSummary = getSchemeSummary;
exports.findSchemeByKey = findSchemeByKey;
// src/modules/schemes/schemes.service.ts
const upabaseClient_1 = require("../../config/upabaseClient");
const schemePoints_service_1 = require("../schemePoints/schemePoints.service");
const RULE_SUPPORT_KM = 495; // ponto de apoio (ex.: 880 km / 495 = 2)
const LONG_SEGMENT_KM = 200; // alerta de trecho muito longo
/**
 * Busca todos os esquemas com locations (sem pontos)
 */
async function getAllSchemes() {
    const { data, error } = await upabaseClient_1.supabase
        .from("schemes")
        .select(`
      id,
      created_at,
      codigo,
      nome,
      trip_time,
      distancia_total_km,
      ativo,
      updated_at,
      origem_location_id,
      destino_location_id,
      direction,

      origem_location:origem_location_id (
        id,
        cidade,
        uf,
        descricao,
        lat,
        lng
      ),

      destino_location:destino_location_id (
        id,
        cidade,
        uf,
        descricao,
        lat,
        lng
      )
    `)
        .order("codigo", { ascending: true });
    if (error) {
        console.error("[getAllSchemes] erro:", error);
        throw new Error("Erro ao buscar esquemas operacionais");
    }
    const rows = (data ?? []);
    const schemes = rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        codigo: row.codigo,
        nome: row.nome,
        trip_time: row.trip_time ?? null,
        distancia_total_km: row.distancia_total_km,
        ativo: row.ativo,
        updated_at: row.updated_at,
        origem_location_id: row.origem_location_id,
        destino_location_id: row.destino_location_id,
        direction: row.direction ?? null,
        origem_location: row.origem_location ?? null,
        destino_location: row.destino_location ?? null,
    }));
    return schemes;
}
/**
 * Busca todos os esquemas + resumo calculado
 */
async function getAllSchemesWithSummary() {
    const schemes = await getAllSchemes();
    const result = [];
    for (const scheme of schemes) {
        const summary = await getSchemeSummary(scheme.id);
        // km salvo na tabela schemes (fallback)
        const kmFromScheme = Number(scheme.distancia_total_km ?? 0);
        let finalSummary;
        if (!summary) {
            // 🔹 Não conseguiu calcular resumo (algum erro ou ainda não implementado)
            //    -> usa só o que temos no esquema
            const totalKm = kmFromScheme;
            const expectedStopsValue = totalKm > 0 ? Math.ceil(totalKm / RULE_SUPPORT_KM) : 0;
            finalSummary = {
                schemeId: scheme.id,
                schemeCodigo: scheme.codigo,
                schemeNome: scheme.nome,
                totalKm,
                totalStops: 0,
                totalParadas: 0,
                totalPontos: 0,
                expectedStops: {
                    value: expectedStopsValue,
                    totalKm,
                    ruleKm: RULE_SUPPORT_KM,
                },
                totalTravelMinutes: 0,
                totalStopMinutes: 0,
                totalDurationMinutes: 0,
                averageSpeedKmH: null,
                countsByType: {},
                longSegmentsCount: 0,
                rulesStatus: {
                    status: "OK",
                    message: "Resumo não disponível para este esquema",
                },
            };
        }
        else {
            // 🔹 Já temos summary calculado a partir dos pontos
            //    Se totalKm veio 0 (ex.: sem pontos), caímos pro km do esquema.
            const hasKmFromPoints = typeof summary.totalKm === "number" && summary.totalKm > 0;
            const totalKm = hasKmFromPoints ? summary.totalKm : kmFromScheme;
            const expectedStopsValue = summary.expectedStops?.value && summary.expectedStops.value > 0
                ? summary.expectedStops.value
                : totalKm > 0
                    ? Math.ceil(totalKm / RULE_SUPPORT_KM)
                    : 0;
            finalSummary = {
                ...summary,
                totalKm,
                expectedStops: {
                    ...summary.expectedStops,
                    value: expectedStopsValue,
                    totalKm,
                    ruleKm: summary.expectedStops?.ruleKm ?? RULE_SUPPORT_KM,
                },
            };
        }
        result.push({ scheme, summary: finalSummary });
    }
    return result;
}
/**
 * Busca um esquema por ID com locations (sem pontos)
 */
async function getSchemeById(id) {
    const { data, error } = await upabaseClient_1.supabase
        .from("schemes")
        .select(`
      id,
      created_at,
      codigo,
      nome,
      trip_time,
      distancia_total_km,
      ativo,
      updated_at,
      origem_location_id,
      destino_location_id,
      direction,

      origem_location:origem_location_id (
        id,
        cidade,
        uf,
        descricao,
        lat,
        lng
      ),

      destino_location:destino_location_id (
        id,
        cidade,
        uf,
        descricao,
        lat,
        lng
      )
    `)
        .eq("id", id)
        .single();
    if (error) {
        if (error.code === "PGRST116")
            return null;
        console.error("[getSchemeById] erro:", error);
        throw new Error("Erro ao buscar esquema operacional");
    }
    const row = data;
    return {
        id: row.id,
        created_at: row.created_at,
        codigo: row.codigo,
        nome: row.nome,
        trip_time: row.trip_time ?? null,
        distancia_total_km: row.distancia_total_km,
        ativo: row.ativo,
        updated_at: row.updated_at,
        origem_location_id: row.origem_location_id,
        destino_location_id: row.destino_location_id,
        direction: row.direction ?? null,
        origem_location: Array.isArray(row.origem_location)
            ? row.origem_location[0] ?? null
            : row.origem_location ?? null,
        destino_location: Array.isArray(row.destino_location)
            ? row.destino_location[0] ?? null
            : row.destino_location ?? null,
    };
}
/**
 * Busca esquema + pontos (completo, ideal pra tela de detalhes/PDF)
 */
async function getSchemeByIdWithPoints(id) {
    const scheme = await getSchemeById(id);
    if (!scheme)
        return null;
    const points = await (0, schemePoints_service_1.getSchemePointsBySchemeId)(id);
    return {
        ...scheme,
        points,
    };
}
/**
 * Cria um esquema (sem pontos)
 */
async function createScheme(input) {
    const payload = {
        ...input,
        ativo: input.ativo ?? true,
    };
    const { data, error } = await upabaseClient_1.supabase
        .from("schemes")
        .insert(payload)
        .select("*")
        .single();
    if (error) {
        console.error("[createScheme] erro:", error);
        throw new Error("Erro ao criar esquema operacional");
    }
    return data;
}
/**
 * Atualiza um esquema (sem mexer nos pontos)
 */
async function updateScheme(id, input) {
    const { data, error } = await upabaseClient_1.supabase
        .from("schemes")
        .update(input)
        .eq("id", id)
        .select("*")
        .single();
    if (error) {
        if (error.code === "PGRST116") {
            return null;
        }
        console.error("[updateScheme] erro:", error);
        throw new Error("Erro ao atualizar esquema operacional");
    }
    return data;
}
/**
 * Exclui um esquema (pontos são apagados via ON DELETE CASCADE)
 */
async function deleteScheme(id) {
    const { error } = await upabaseClient_1.supabase.from("schemes").delete().eq("id", id);
    if (error) {
        console.error("[deleteScheme] erro:", error);
        throw new Error("Erro ao excluir esquema operacional");
    }
    return true;
}
/**
 * Gera o resumo analítico de um esquema
 */
/**
 * Regras de cálculo do resumo ANTT / operacional:
 *
 * 1) Tipos de ponto (campo scheme_points.tipo):
 *    - PE  = Ponto de Embarque
 *    - PD  = Ponto de Desembarque
 *    - PL  = Ponto Livre / Operacional (garagem, ponto comercial etc.)
 *    - PP  = Parada obrigatória / descanso de jornada
 *    - PA  = Ponto de Apoio (restaurante, posto, hotel)  -> único que conta como PC
 *    - TMJ = Troca de Motorista em Jornada
 *
 * 2) totalKm
 *    - Soma das distâncias dos trechos na rota.
 *    - Se o summary já vier com totalKm calculado, usamos o valor dele.
 *
 * 3) totalStops (paradas)
 *    - Representa TODAS as paradas operacionais da viagem
 *      (embarque, desembarque, descanso, apoio, troca de motorista, etc.).
 *    - Regra por tipo:
 *        PE  -> conta como parada (embarque)
 *        PD  -> conta como parada (desembarque)
 *        PL  -> pode contar como parada se fizer parte da rota
 *        PP  -> conta como parada (descanso obrigatório)
 *        PA  -> conta como parada (apoio/alimentação)
 *        TMJ -> conta como parada (troca de motorista)
 *    - Opcional: o ponto de pré-viagem (garagem inicial) pode ser excluído,
 *      se não quiser que ele entre na contagem de paradas.
 *
 * 4) totalPcs (PCs / Pontos de Apoio)
 *    - Representa a quantidade de Pontos de Apoio na viagem.
 *    - Por definição de negócio, PC = apenas pontos com tipo === "PA".
 *    - NÃO entram na contagem:
 *        PE, PD, PL, PP, TMJ
 *    - Regra: totalPcs = número de pontos com tipo "PA".
 *
 * 5) Relação com o front:
 *    - totalKm      -> exibido como "XX km totais".
 *    - totalStops   -> exibido como "YY paradas".
 *    - totalPcs     -> exibido como "ZZ PCs" (pontos de apoio).
 *
 * 6) Viagem curta (exemplo BSB -> GYN):
 *    - Se não houver nenhum ponto com tipo "PA", então totalPcs deve ser 0,
 *      mesmo que existam vários PE/PD/PL na rota.
 */
async function getSchemeSummary(schemeId) {
    // 1) Buscar o esquema
    const { data: scheme, error: schemeError } = await upabaseClient_1.supabase
        .from("schemes")
        .select("*")
        .eq("id", schemeId)
        .single();
    if (schemeError) {
        if (schemeError.code === "PGRST116") {
            return null;
        }
        console.error("[getSchemeSummary] erro ao buscar scheme:", schemeError);
        throw new Error("Erro ao buscar esquema operacional");
    }
    // 2) Buscar os pontos do esquema
    const { data: points, error: pointsError } = await upabaseClient_1.supabase
        .from("scheme_points")
        .select("*")
        .eq("scheme_id", schemeId)
        .order("ordem", { ascending: true });
    if (pointsError) {
        console.error("[getSchemeSummary] erro ao buscar scheme_points:", pointsError);
        throw new Error("Erro ao buscar pontos do esquema operacional");
    }
    const schemePoints = (points ?? []);
    // Se não tiver pontos, devolve um resumo "zerado"
    if (schemePoints.length === 0) {
        return {
            schemeId: scheme.id,
            schemeCodigo: scheme.codigo ?? "",
            schemeNome: scheme.nome ?? "",
            totalKm: 0,
            totalStops: 0,
            totalParadas: 0,
            totalPontos: 0,
            expectedStops: {
                value: 0,
                totalKm: 0,
                ruleKm: RULE_SUPPORT_KM,
            },
            totalTravelMinutes: 0,
            totalStopMinutes: 0,
            totalDurationMinutes: 0,
            averageSpeedKmH: null,
            countsByType: {},
            longSegmentsCount: 0,
            rulesStatus: {
                status: "OK",
                message: "Sem pontos cadastrados para este esquema",
            },
        };
    }
    // 3) Cálculos principais
    const totalKm = schemePoints.reduce((sum, p) => sum + (p.distancia_km ?? 0), 0);
    const totalTravelMinutes = schemePoints.reduce((sum, p) => sum + (p.tempo_deslocamento_min ?? 0), 0);
    const totalStopMinutes = schemePoints.reduce((sum, p) => sum + (p.tempo_no_local_min ?? 0), 0);
    const totalDurationMinutes = totalTravelMinutes + totalStopMinutes;
    const averageSpeedKmH = totalTravelMinutes > 0
        ? Number((totalKm / (totalTravelMinutes / 60)).toFixed(1))
        : null;
    // 4) Contar por tipo (PD, PA, TM, etc.)
    // -----------------------------------------
    // Cálculo de paradas (totalStops) e PCs (totalPcs)
    // -----------------------------------------
    //
    // - totalStops:
    //   Conta todas as paradas operacionais da viagem.
    //   Tipos que entram na contagem:
    //     * PE  (embarque)
    //     * PD  (desembarque)
    //     * PL  (ponto livre / operacional)   [opcional excluir pré-viagem]
    //     * PP  (parada obrigatória / descanso)
    //     * PA  (ponto de apoio / alimentação)
    //     * TMJ (troca de motorista em jornada)
    //
    // - totalPcs:
    //   Conta apenas Pontos de Apoio (PC).
    //   Por definição de negócio, PC = pontos com tipo === "PA".
    //   Tipos que NÃO entram: PE, PD, PL, PP, TMJ.
    //
    const countsByType = {};
    for (const p of schemePoints) {
        if (!p.tipo)
            continue;
        countsByType[p.tipo] = (countsByType[p.tipo] ?? 0) + 1;
    }
    const totalStops = schemePoints.length;
    const totalParadas = totalStops;
    const totalPontos = countsByType["PA"] ?? 0;
    // 5) Paradas esperadas pela regra de 495 km (ponto de apoio)
    const expectedStopsValue = totalKm > 0 ? Math.ceil(totalKm / RULE_SUPPORT_KM) : 0;
    // 6) Trechos longos (> 200 km sem parada)
    const longSegments = schemePoints.filter((p) => (p.distancia_km ?? 0) > LONG_SEGMENT_KM);
    const longSegmentsCount = longSegments.length;
    // 7) Status das regras
    let rulesStatus = {
        status: "OK",
        message: "Dentro das regras",
    };
    if (longSegmentsCount > 0) {
        rulesStatus = {
            status: "WARNING",
            message: `Dentro das regras com ${longSegmentsCount} aviso(s)`,
        };
    }
    return {
        schemeId: scheme.id,
        schemeCodigo: scheme.codigo ?? "",
        schemeNome: scheme.nome ?? "",
        totalKm,
        totalStops,
        totalParadas,
        totalPontos,
        expectedStops: {
            value: expectedStopsValue,
            totalKm,
            ruleKm: RULE_SUPPORT_KM,
        },
        totalTravelMinutes,
        totalStopMinutes,
        totalDurationMinutes,
        averageSpeedKmH,
        countsByType,
        longSegmentsCount,
        rulesStatus,
    };
}
async function findSchemeByKey(codigo, direction, tripTime) {
    const { data, error } = await upabaseClient_1.supabase
        .from("schemes")
        .select("*")
        .eq("codigo", codigo)
        .eq("direction", direction)
        .eq("trip_time", tripTime)
        .single();
    if (error) {
        // PGRST116 = nenhum registro encontrado
        if (error.code === "PGRST116") {
            return null;
        }
        console.error("[findSchemeByKey] erro:", error);
        throw new Error("Erro ao buscar esquema operacional por chave.");
    }
    return data;
}
