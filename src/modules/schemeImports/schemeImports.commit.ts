import { supabase } from "../../config/upabaseClient";
import {
  setSchemePointsForScheme,
  updateSchemePointsDerivedFields,
} from "../schemePoints/schemePoints.service";
import { recalculateSchemePointsForScheme } from "../schemePoints/schemePoints.service";
import { updateSchemeSummary } from "../schemes/schemes.summary.service";

type ImportSessionRow = {
  import_session_id: string;
  status: string;
  canonical_json: any;
  validation_json: any;
  commit_result_json?: any;
  commit_owner: string | null;
  commit_started_at: string | null;
};

type ExistingSchemeRow = { id: string };

async function needsDerivedRecalc(schemeId: string) {
  const { data, error } = await supabase
    .from("scheme_points")
    .select("id")
    .eq("scheme_id", schemeId)
    .is("chegada_offset_min", null)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function countMissingSegments(schemeId: string): Promise<number> {
  const { count, error } = await supabase
    .from("scheme_points")
    .select("id", { count: "exact", head: true })
    .eq("scheme_id", schemeId)
    .gt("ordem", 1)
    .or(
      "distancia_km.is.null,tempo_deslocamento_min.is.null,road_segment_uuid.is.null"
    );

  if (error) throw error;
  return count ?? 0;
}

async function countMissingDerived(schemeId: string): Promise<number> {
  const { count, error } = await supabase
    .from("scheme_points")
    .select("id", { count: "exact", head: true })
    .eq("scheme_id", schemeId)
    .gt("ordem", 1) // <= alinhar com segments
    .or(
      [
        "distancia_acumulada_km.is.null",
        "chegada_offset_min.is.null",
        "saida_offset_min.is.null",
        // velocidade_media_kmh: só cobre se sua função realmente preenche sempre
        "velocidade_media_kmh.is.null",
      ].join(",")
    );

  if (error) throw error;
  return count ?? 0;
}

async function needsSegmentRecalc(schemeId: string) {
  const { data, error } = await supabase
    .from("scheme_points")
    .select("id")
    .eq("scheme_id", schemeId)
    .or(
      "distancia_km.is.null,tempo_deslocamento_min.is.null,road_segment_uuid.is.null"
    )

    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function findExistingSchemeByKey(params: {
  codigoLinha: string;
  sentido: string;
  horaPartida: string;
}): Promise<ExistingSchemeRow | null> {
  const { data, error } = await supabase
    .from("schemes")
    .select("id")
    .eq("codigo", params.codigoLinha)
    .eq("direction", params.sentido)
    .eq("trip_time", params.horaPartida)
    .maybeSingle<ExistingSchemeRow>();

  if (error) throw error;
  return data ?? null;
}

async function claimImportSessionForCommit(params: {
  importSessionId: string;
  owner: string;
  ttlSeconds?: number;
}) {
  const { data, error } = await supabase.rpc(
    "claim_import_session_for_commit",
    {
      p_import_session_id: params.importSessionId,
      p_owner: params.owner,
      p_ttl_seconds: params.ttlSeconds ?? 900,
    }
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row)
    throw new Error("RPC claim_import_session_for_commit retornou vazio.");

  return row as {
    claimed: boolean;
    status: string;
    commit_owner: string | null;
    commit_started_at: string | null;
  };
}

async function countSchemePoints(schemeId: string): Promise<number> {
  const { count, error } = await supabase
    .from("scheme_points")
    .select("scheme_id", { count: "exact", head: true })
    .eq("scheme_id", schemeId);

  if (error) throw error;
  return count ?? 0;
}

export async function commitImportBatch(params: {
  importSessionId: string;
  userId?: string;
}) {
  const { importSessionId, userId } = params;

  // 0) Carrega sessão
  const { data: session, error } = await supabase
    .from("import_sessions")
    .select(
      "import_session_id, status, canonical_json, validation_json, commit_result_json, commit_owner, commit_started_at"
    )
    .eq("import_session_id", importSessionId)
    .maybeSingle<ImportSessionRow>();

  if (error) throw error;
  if (!session) throw new Error("Import session não encontrada.");

  // ✅ Idempotência: se já finalizou, retorna o resultado salvo
  if (session.status === "COMMITTED" || session.status === "PARTIAL") {
    if (session.commit_result_json) return session.commit_result_json;
    throw new Error(
      `Sessão ${session.status} sem commit_result_json (inconsistência).`
    );
  }

  // ✅ Anti concorrência: se já está em COMMITTING, não permite outro commit
  if (session.status === "COMMITTING") {
    throw new Error(
      `Commit em andamento (owner=${session.commit_owner ?? "?"}, started_at=${
        session.commit_started_at ?? "?"
      }).`
    );
  }

  // Só permite iniciar se VALID
  if (session.status !== "VALID") {
    throw new Error(
      `Import session não está VALID (status atual: ${session.status}).`
    );
  }

  // 1) Claim cross-instance (atômico)
  const owner = `commit:${userId ?? "anonymous"}:${process.pid}:${Date.now()}`;
  const claim = await claimImportSessionForCommit({
    importSessionId,
    owner,
    ttlSeconds: 900,
  });

  if (!claim.claimed) {
    throw new Error(
      `Não foi possível claimar a sessão para commit (status atual: ${
        claim.status
      }, owner atual: ${claim.commit_owner ?? "?"}).`
    );
  }

  // 2) Valida payloads
  const batch = session.canonical_json;
  if (!batch?.schemes || !Array.isArray(batch.schemes)) {
    await supabase
      .from("import_sessions")
      .update({
        status: "FAILED",
        commit_finished_at: new Date().toISOString(),
        last_error: "canonical_json inválido (schemes ausente).",
        commit_result_json: null,
      })
      .eq("import_session_id", importSessionId);

    throw new Error("canonical_json inválido (schemes ausente).");
  }

  const validation = session.validation_json;
  if (!validation?.schemes || !Array.isArray(validation.schemes)) {
    await supabase
      .from("import_sessions")
      .update({
        status: "FAILED",
        commit_finished_at: new Date().toISOString(),
        last_error: "validation_json inválido/ausente na import session.",
        commit_result_json: null,
      })
      .eq("import_session_id", importSessionId);

    throw new Error("validation_json inválido/ausente na import session.");
  }

  // 3) importa apenas schemes VALID do report
  const validExternalKeys = new Set(
    validation.schemes
      .filter((r: any) => r.status === "VALID")
      .map((r: any) => r.externalKey)
  );

  const schemesToImport = batch.schemes.filter((s: any) =>
    validExternalKeys.has(s.externalKey)
  );

  const results: any[] = [];
  let createdCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (const scheme of schemesToImport) {
      try {
        const existing = await findExistingSchemeByKey({
          codigoLinha: scheme.codigoLinha,
          sentido: scheme.sentido,
          horaPartida: scheme.horaPartida,
        });

        if (existing) {
          const existingSchemeId = existing.id;

          // 1) segmentos: verifica -> recalcula se necessário -> barreira
          const missingSegBefore = await countMissingSegments(existingSchemeId);
          let recalc = null;
          let derived = null;

          if (missingSegBefore > 0) {
            recalc = await recalculateSchemePointsForScheme(existingSchemeId);
          }

          const missingSegAfter = await countMissingSegments(existingSchemeId);
          if (missingSegAfter > 0) {
            throw new Error(
              `Segments incompletos após recalc: ${missingSegAfter}`
            );
          }

          const missingDerBefore = await countMissingDerived(existingSchemeId);
          if (missingDerBefore > 0) {
            derived = await updateSchemePointsDerivedFields(existingSchemeId);
          }

          const missingDerAfter = await countMissingDerived(existingSchemeId);
          if (missingDerAfter > 0) {
            throw new Error(
              `Derived incompletos após update: ${missingDerAfter}`
            );
          }

          const summary = await updateSchemeSummary(existingSchemeId);

          const repaired = missingSegBefore > 0 || missingDerBefore > 0;

          results.push({
            externalKey: scheme.externalKey,
            schemeId: existingSchemeId,
            status: repaired ? "REPAIRED_EXISTING" : "SKIPPED_ALREADY_EXISTS",
            recalc,
            derived,
            summary,
            missingSegBefore,
            missingDerBefore,
          });

          if (!repaired) skippedCount++;
          continue;
        }

        // --------- CREATED ---------
        const { data: createdScheme, error: createError } = await supabase
          .from("schemes")
          .insert({
            codigo: scheme.codigoLinha,
            nome: scheme.nomeLinha,
            direction: scheme.sentido,
            trip_time: scheme.horaPartida,
          })
          .select("id")
          .single<{ id: string }>();

        if (createError) throw createError;
        if (!createdScheme) throw new Error("Falha ao criar scheme (null).");

        const createdSchemeId = createdScheme.id;

        const missing = (scheme.points ?? []).filter((p: any) => !p.locationId);
        if (missing.length > 0) {
          throw new Error(
            `Scheme possui pontos sem locationId (${missing.length}).`
          );
        }

        const pts = scheme.points.map((p: any, idx: number, arr: any[]) => ({
          scheme_id: createdSchemeId,
          location_id: p.locationId,
          ordem: p.sequencia,
          tempo_no_local_min: p.paradaMin ?? 0,
          is_initial: idx === 0,
          is_final: idx === arr.length - 1,
        }));
        await setSchemePointsForScheme(createdSchemeId, pts);

        const recalc = await recalculateSchemePointsForScheme(createdSchemeId);

        const missingSegAfter = await countMissingSegments(createdSchemeId);
        if (missingSegAfter > 0) {
          throw new Error(
            `Segments incompletos após recalc: ${missingSegAfter}`
          );
        }

        // ✅ novos derivados (equivalente ao “recalcAllRoutePoints” do front)
        console.log("[COMMIT] calling derived for", createdSchemeId);
        const derived = await updateSchemePointsDerivedFields(createdSchemeId);
        console.log("[COMMIT] derived result", { createdSchemeId, derived });

        const missingDerAfter = await countMissingDerived(createdSchemeId);
        if (missingDerAfter > 0) {
          throw new Error(
            `Derived incompletos após update: ${missingDerAfter}`
          );
        }

        // ✅ header do scheme
        const summary = await updateSchemeSummary(createdSchemeId);

        createdCount++;
        results.push({
          externalKey: scheme.externalKey,
          schemeId: createdSchemeId,
          status: "CREATED",
          recalc,
          derived,
          summary,
        });
      } catch (e: any) {
        failedCount++;
        results.push({
          externalKey: scheme.externalKey,
          status: "FAILED",
          error: String(e?.message ?? e),
        });
      }
    }

    const commitResult = {
      status: failedCount > 0 ? "PARTIAL_SUCCESS" : "SUCCESS",
      summary: { createdCount, skippedCount, failedCount },
      results,
      commitOwner: owner, // opcional, útil pra debug
    };

    await supabase
      .from("import_sessions")
      .update({
        status: failedCount > 0 ? "PARTIAL" : "COMMITTED",
        committed_at: new Date().toISOString(),
        commit_finished_at: new Date().toISOString(),
        commit_result_json: commitResult,
        last_error: null,
      })
      .eq("import_session_id", importSessionId);

    return commitResult;
  } catch (fatal: any) {
    await supabase
      .from("import_sessions")
      .update({
        status: "FAILED",
        commit_finished_at: new Date().toISOString(),
        last_error: String(fatal?.message ?? fatal),
        commit_result_json: {
          status: "FAILED",
          error: String(fatal?.message ?? fatal),
        },
      })
      .eq("import_session_id", importSessionId);

    throw fatal;
  }
}
