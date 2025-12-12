// src/modules/schemes/schemes.controller.ts
import type { Request, Response } from "express";
import {
  getAllSchemesWithSummary,
  getSchemeById,
  createScheme,
  updateScheme,
  deleteScheme,
  getSchemeSummary,
  getSchemeByIdWithPoints,
  findSchemeByKey,
} from "./schemes.service";
import type { CreateSchemeInput, UpdateSchemeInput } from "./schemes.types";

export async function listSchemesHandler(_req: Request, res: Response) {
  try {
    const schemesWithSummary = await getAllSchemesWithSummary();
    return res.json(schemesWithSummary);
  } catch (err) {
    console.error("[listSchemesHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao listar esquemas operacionais" });
  }
}

export async function getSchemeByIdHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const scheme = await getSchemeById(id);
    if (!scheme) {
      return res
        .status(404)
        .json({ message: "Esquema operacional não encontrado" });
    }

    return res.json(scheme);
  } catch (err) {
    console.error("[getSchemeByIdHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao buscar esquema operacional" });
  }
}

/**
 * GET /schemes/:id/full
 * Retorna esquema + locations + pontos (completo)
 */
export async function getSchemeFullHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const scheme = await getSchemeByIdWithPoints(id);
    if (!scheme) {
      return res
        .status(404)
        .json({ message: "Esquema operacional não encontrado" });
    }

    return res.json(scheme);
  } catch (err) {
    console.error("[getSchemeFullHandler]", err);
    return res.status(500).json({
      message: "Erro ao buscar esquema operacional completo",
    });
  }
}

export async function createSchemeHandler(req: Request, res: Response) {
  try {
    const body = req.body as CreateSchemeInput;

    if (
      !body.codigo ||
      !body.nome ||
      !body.origem_location_id ||
      !body.destino_location_id ||
      typeof body.distancia_total_km !== "number"
    ) {
      return res
        .status(400)
        .json({ message: "Dados obrigatórios não informados" });
    }

    const scheme = await createScheme(body);
    return res.status(201).json(scheme);
  } catch (err) {
    console.error("[createSchemeHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao criar esquema operacional" });
  }
}

export async function updateSchemeHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const body = req.body as UpdateSchemeInput;

    const updated = await updateScheme(id, body);
    if (!updated) {
      return res
        .status(404)
        .json({ message: "Esquema operacional não encontrado" });
    }

    return res.json(updated);
  } catch (err) {
    console.error("[updateSchemeHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao atualizar esquema operacional" });
  }
}

export async function deleteSchemeHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    await deleteScheme(id);
    return res.status(204).send();
  } catch (err) {
    console.error("[deleteSchemeHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao excluir esquema operacional" });
  }
}

export async function getSchemeSummaryHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const summary = await getSchemeSummary(id);
    if (!summary) {
      return res
        .status(404)
        .json({ message: "Esquema operacional não encontrado" });
    }

    return res.json(summary);
  } catch (err) {
    console.error("[getSchemeSummaryHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao gerar resumo do esquema operacional" });
  }
}

export async function searchSchemeByKeyHandler(req: Request, res: Response) {
  try {
    const { codigo, direction, tripTime } = req.query;

    if (!codigo || !direction || !tripTime) {
      return res.status(400).json({
        message:
          "Parâmetros obrigatórios: codigo, direction e tripTime (HH:MM).",
      });
    }

    const scheme = await findSchemeByKey(
      String(codigo),
      String(direction),
      String(tripTime)
    );

    if (!scheme) {
      return res.status(404).json({
        message: "Nenhum esquema encontrado para essa combinação.",
      });
    }

    return res.json(scheme);
  } catch (err) {
    console.error("[searchSchemeByKeyHandler]", err);
    return res.status(500).json({
      message: "Erro ao buscar esquema operacional por combinação de chave.",
    });
  }
}
