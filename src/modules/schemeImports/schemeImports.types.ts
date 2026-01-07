// src/modules/schemeImports/schemeImports.types.ts
import { Request, Response } from "express";
import { schemeImportsService } from "./schemeImports.service";

export async function dryRunImportSchemesHandler(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: "Arquivo CSV não enviado." });
  }

  const report = await schemeImportsService.dryRun({
    fileBuffer: req.file.buffer,
    filename: req.file.originalname,
    userId: (req as any).user?.id,
  });

  return res.json(report);
}

export async function commitImportSchemesHandler(req: Request, res: Response) {
  const { importSessionId } = req.body;

  if (!importSessionId) {
    return res.status(400).json({ error: "importSessionId é obrigatório." });
  }

  const result = await schemeImportsService.commit({
    importSessionId,
    userId: (req as any).user?.id,
  });

  return res.json(result);
}

export type SchemeImportBatch = {
  schemes: SchemeImportDraft[];
  meta?: {
    totalRows: number;
    totalSchemes: number;
  };
};

export type SchemeImportDraft = {
  externalKey: string;
  codigoLinha: string;
  nomeLinha: string;
  sentido: string;
  horaPartida: string;
  operatingDaysMask: number;
  points: SchemeImportPointDraft[];

  // preenchido na validação
  status?: "VALID" | "INVALID";
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
};

export type SchemeImportPointDraft = {
  sequencia: number;
  descricaoRaw: string;
  descricaoNorm?: string;
  paradaMin: number;
  locationId?: string;
};

export type ValidationIssue = {
  code:
    | "MISSING_REQUIRED_FIELDS"
    | "INSUFFICIENT_POINTS"
    | "DUPLICATE_SEQUENCE"
    | "SEQUENCE_NOT_ASCENDING"
    | "LOCATION_NOT_FOUND"
    | "DUPLICATE_LOCATION_IN_SCHEME"
    | "EMPTY_PARADA_ASSUMED_ZERO";
  level: "ERROR" | "WARNING";
  message: string;
  details?: any;
};

export type ImportSessionRow = {
  import_session_id: string;
  status: string;
  canonical_json: any;
  validation_json: any;
  commit_result_json?: any;
  commit_owner?: string | null;
  commit_started_at?: string | null;
};
