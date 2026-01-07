// src/modules/schemeImports/schemeImports.controller.ts
import { Request, Response } from "express";
import { schemeImportsService } from "./schemeImports.service";

function errorResponse(
  res: Response,
  params: {
    status: number;
    code: string;
    message: string;
    details?: any;
  }
) {
  return res.status(params.status).json({
    error: {
      code: params.code,
      message: params.message,
      details: params.details ?? null,
    },
  });
}

function parseForceFlag(req: Request): boolean {
  const raw = req.query.force;
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toLowerCase();
  return s === "1" || s === "true";
}

export async function dryRunImportSchemesHandler(req: Request, res: Response) {
  try {
    const file = req.file;

    if (!file) {
      return errorResponse(res, {
        status: 400,
        code: "BAD_REQUEST",
        message:
          "Arquivo CSV é obrigatório (multipart/form-data, campo: file).",
      });
    }

    const userId = req.user?.id;
    const force = parseForceFlag(req);

    const out = await schemeImportsService.dryRun({
      fileBuffer: file.buffer,
      filename: file.originalname,
      userId,
      mime: file.mimetype,
      force,
    });

    return res.status(200).json({
      ok: true,
      importSessionId: out.importSessionId,
      status: out.status,
      reused: !!out.reused,
      resolve: out.resolve,
      validation: out.validation,
    });
  } catch (e: any) {
    return errorResponse(res, {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno ao executar DRY-RUN.",
      details: String(e?.message ?? e),
    });
  }
}

export async function commitImportSchemesHandler(req: Request, res: Response) {
  try {
    const { importSessionId } = req.body ?? {};

    if (!importSessionId || typeof importSessionId !== "string") {
      return errorResponse(res, {
        status: 400,
        code: "BAD_REQUEST",
        message: "importSessionId é obrigatório e deve ser string.",
      });
    }

    const result = await schemeImportsService.commit({ importSessionId });

    return res.status(200).json({
      ok: true,
      importSessionId,
      result,
    });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const lower = message.toLowerCase();

    // 404 – sessão não existe
    if (lower.includes("import session não encontrada")) {
      return errorResponse(res, {
        status: 404,
        code: "NOT_FOUND",
        message,
      });
    }

    // 409 – commit em andamento / lock não adquirido
    if (
      lower.includes("commit em andamento") ||
      lower.includes("não foi possível claimar")
    ) {
      return errorResponse(res, {
        status: 409,
        code: "IMPORT_SESSION_LOCKED",
        message,
      });
    }

    // 422 – não comittable
    if (
      lower.includes("não está valid") ||
      lower.includes("canonical_json inválido") ||
      lower.includes("validation_json inválido")
    ) {
      return errorResponse(res, {
        status: 422,
        code: "IMPORT_SESSION_NOT_COMMITTABLE",
        message,
      });
    }

    return errorResponse(res, {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno ao executar COMMIT.",
      details: message,
    });
  }
}
