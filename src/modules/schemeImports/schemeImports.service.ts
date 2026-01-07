import { supabase } from "../../config/upabaseClient";
import { sha256 } from "./schemeImports.hash";
import { parseCsvFile } from "./schemeImports.parser.csv";
import { canonicalizeImport } from "./schemeImports.canonicalize";
import { resolveLocations } from "./schemeImports.resolveLocations";
import { validateImportBatch } from "./schemeImports.validate";
import { commitImportBatch } from "./schemeImports.commit";

type ImportSessionRow = {
  import_session_id: string;
  status: string;
  resolve_json: any;
  validation_json: any;
};

function isUniqueViolation(err: any): boolean {
  const code = err?.code ?? err?.details?.code;
  if (code === "23505") return true;
  const msg = String(err?.message ?? err);
  return msg.toLowerCase().includes("duplicate key");
}

export const schemeImportsService = {
  async dryRun({
    fileBuffer,
    filename,
    userId,
    mime,
    force,
  }: {
    fileBuffer: Buffer;
    filename: string;
    userId?: string;
    mime?: string;
    force?: boolean;
  }) {
    const baseHash = sha256(fileBuffer);
    const inputHash = force ? `${baseHash}:force:${Date.now()}` : baseHash;

    if (!force) {
      const { data: existing, error: existingError } = await supabase
        .from("import_sessions")
        .select("import_session_id, status, resolve_json, validation_json")
        .eq("input_hash", baseHash)
        .in("status", ["VALID", "INVALID", "COMMITTING"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<ImportSessionRow>();

      if (existingError) throw existingError;

      if (existing) {
        return {
          importSessionId: existing.import_session_id,
          status: existing.status,
          resolve: existing.resolve_json,
          validation: existing.validation_json,
          reused: true,
        };
      }
    }

    try {
      // 1) parse + canonical
      const rows = await parseCsvFile(fileBuffer);

      console.log("[import] rows:", rows.length);
      console.log("[import] first row keys:", Object.keys(rows[0] ?? {}));
      console.log("[import] first row sample:", rows[0]);
      console.log("[import] second row sample:", rows[1]);

      const batch = canonicalizeImport(rows);

      // 2) resolve + validate
      const resolveReport = await resolveLocations(batch);
      const validationReport = validateImportBatch(batch);

      const status = validationReport.status === "VALID" ? "VALID" : "INVALID";

      // 3) persist import_session
      const { data, error } = await supabase
        .from("import_sessions")
        .insert({
          source_filename: filename,
          source_mime: mime ?? null,
          created_by: userId ?? null,
          input_hash: inputHash,
          status,
          canonical_json: batch,
          resolve_json: resolveReport,
          validation_json: validationReport,
        })
        .select("import_session_id, status")
        .single<{ import_session_id: string; status: string }>();

      if (error) throw error;
      if (!data) throw new Error("Falha ao criar import_session (null).");

      return {
        importSessionId: data.import_session_id,
        status: data.status,
        resolve: resolveReport,
        validation: validationReport,
        reused: false,
      };
    } catch (e: any) {
      // ✅ Se estourou unique por corrida de hash, reconsulta e devolve reused=true
      if (isUniqueViolation(e)) {
        // 🚫 FORCE: não reutiliza sessão existente
        if (force) {
          throw e;
        }

        // ♻️ comportamento normal (idempotência por hash)
        const { data: again, error: err2 } = await supabase
          .from("import_sessions")
          .select("import_session_id, status, resolve_json, validation_json")
          .eq("input_hash", inputHash)
          .in("status", ["VALID", "INVALID", "COMMITTING"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<ImportSessionRow>();

        if (err2) throw err2;

        if (again) {
          return {
            importSessionId: again.import_session_id,
            status: again.status,
            resolve: again.resolve_json,
            validation: again.validation_json,
            reused: true,
          };
        }
      }

      // opcional: persistir FAILED (não é único por hash, então pode gravar)
      // ✅ mas evite gravar FAILED se o erro foi só corrida (já tratada acima)
      await supabase.from("import_sessions").insert({
        source_filename: filename,
        source_mime: mime ?? null,
        created_by: userId ?? null,
        input_hash: inputHash,
        status: "FAILED",
        error_json: {
          message: String(e?.message ?? e),
          stack: e?.stack,
        },
        canonical_json: {}, // mantém compatível com seu schema (not null)
      });

      throw e;
    }
  },

  // antes: commit(params: { importSessionId: string })
  async commit(params: { importSessionId: string; userId?: string }) {
    return commitImportBatch({
      importSessionId: params.importSessionId,
      userId: params.userId,
    });
  },
};
