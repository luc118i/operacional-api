import { supabase } from "../../config/upabaseClient";
import { setSchemePointsForScheme } from "../schemePoints/schemePoints.service";
import { recalculateSchemePointsForScheme } from "../schemePoints/schemePoints.service";

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

async function findExistingSchemeByKey(params: {
  codigoLinha: string;
  sentido: string;
  horaPartida: string;
}): Promise<ExistingSchemeRow | null> {
  const { data, error } = await supabase
    .from("schemes")
    .select("id")
    .eq("codigo_linha", params.codigoLinha)
    .eq("sentido", params.sentido)
    .eq("hora_partida", params.horaPartida)
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
          const pointsCount = await countSchemePoints(existing.id);

          if (pointsCount === 0) {
            const missing = (scheme.points ?? []).filter(
              (p: any) => !p.locationId
            );
            if (missing.length > 0) {
              throw new Error(
                `Scheme existente está sem pontos, mas import possui pontos sem locationId (${missing.length}).`
              );
            }

            const { error: delErr } = await supabase
              .from("scheme_points")
              .delete()
              .eq("scheme_id", existing.id);

            if (delErr) throw delErr;

            await setSchemePointsForScheme(
              existing.id,
              scheme.points.map((p: any) => ({
                scheme_id: existing.id,
                location_id: p.locationId,
                ordem: p.sequencia,
                parada_min: p.paradaMin ?? 0,
              }))
            );

            const recalc = await recalculateSchemePointsForScheme(existing.id);

            results.push({
              externalKey: scheme.externalKey,
              schemeId: existing.id,
              status: "RESUMED_POINTS",
              recalc,
              key: {
                codigoLinha: scheme.codigoLinha,
                sentido: scheme.sentido,
                horaPartida: scheme.horaPartida,
              },
            });

            continue;
          }

          skippedCount++;
          results.push({
            externalKey: scheme.externalKey,
            schemeId: existing.id,
            status: "SKIPPED_ALREADY_EXISTS",
            key: {
              codigoLinha: scheme.codigoLinha,
              sentido: scheme.sentido,
              horaPartida: scheme.horaPartida,
            },
          });
          continue;
        }

        const { data: createdScheme, error: createError } = await supabase
          .from("schemes")
          .insert({
            codigo_linha: scheme.codigoLinha,
            nome_linha: scheme.nomeLinha,
            sentido: scheme.sentido,
            hora_partida: scheme.horaPartida,
            operating_days_mask: scheme.operatingDaysMask,
          })
          .select("id")
          .single<{ id: string }>();

        if (createError) throw createError;
        if (!createdScheme) throw new Error("Falha ao criar scheme (null).");

        const schemeId = createdScheme.id;

        const missing = (scheme.points ?? []).filter((p: any) => !p.locationId);
        if (missing.length > 0) {
          throw new Error(
            `Scheme possui pontos sem locationId (${missing.length}).`
          );
        }

        const { error: delErr } = await supabase
          .from("scheme_points")
          .delete()
          .eq("scheme_id", schemeId);

        if (delErr) throw delErr;

        await setSchemePointsForScheme(
          schemeId,
          scheme.points.map((p: any) => ({
            scheme_id: schemeId,
            location_id: p.locationId,
            ordem: p.sequencia,
            parada_min: p.paradaMin ?? 0,
          }))
        );

        const recalc = await recalculateSchemePointsForScheme(schemeId);

        createdCount++;
        results.push({
          externalKey: scheme.externalKey,
          schemeId,
          status: "CREATED",
          recalc,
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
