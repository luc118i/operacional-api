// src/modules/schemePoints/schemePoints.controller.ts
import type { Request, Response } from "express";

import {
  getAllSchemePoints,
  getSchemePointById,
  getSchemePointsBySchemeId,
  createSchemePoint,
  updateSchemePoint,
  deleteSchemePoint,
  setSchemePointsForScheme,
} from "./schemePoints.service";

import type {
  CreateSchemePointInput,
  UpdateSchemePointInput,
} from "./schemePoints.types";

/**
 * GET /scheme-points  -> lista geral
 */
export async function listSchemePointsHandler(_req: Request, res: Response) {
  try {
    const points = await getAllSchemePoints();
    return res.json(points);
  } catch (err) {
    console.error("[listSchemePointsHandler]", err);
    return res.status(500).json({
      message: "Erro ao listar pontos de esquema operacional",
    });
  }
}

/**
 * GET /scheme-points/:id -> busca individual
 */
export async function getSchemePointByIdHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const point = await getSchemePointById(id);

    if (!point) {
      return res
        .status(404)
        .json({ message: "Ponto de esquema operacional não encontrado" });
    }

    return res.json(point);
  } catch (err) {
    console.error("[getSchemePointByIdHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao buscar ponto de esquema operacional" });
  }
}

/**
 * GET /schemes/:schemeId/points
 * Lista ordenada POR esquema, com JOIN em locations
 */
export async function listPointsBySchemeIdHandler(req: Request, res: Response) {
  const { schemeId } = req.params;

  try {
    const points = await getSchemePointsBySchemeId(schemeId);

    return res.json(points);
  } catch (err) {
    console.error("[listPointsBySchemeIdHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao listar pontos do esquema operacional" });
  }
}

/**
 * POST /scheme-points
 * Cria um ponto individual
 */
export async function createSchemePointHandler(req: Request, res: Response) {
  try {
    const body = req.body as CreateSchemePointInput;

    // Validação mínima (agora mais flexível)
    if (
      !body.scheme_id ||
      !body.location_id ||
      typeof body.ordem !== "number"
    ) {
      return res.status(400).json({
        message: "Campos obrigatórios: scheme_id, location_id, ordem",
      });
    }

    const point = await createSchemePoint(body);
    return res.status(201).json(point);
  } catch (err) {
    console.error("[createSchemePointHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao criar ponto de esquema operacional" });
  }
}

/**
 * PUT /scheme-points/:id
 */
export async function updateSchemePointHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const input = req.body as UpdateSchemePointInput;

    const updated = await updateSchemePoint(id, input);
    if (!updated) {
      return res
        .status(404)
        .json({ message: "Ponto de esquema operacional não encontrado" });
    }

    return res.json(updated);
  } catch (err) {
    console.error("[updateSchemePointHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao atualizar ponto de esquema operacional" });
  }
}

/**
 * DELETE /scheme-points/:id
 */
export async function deleteSchemePointHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await deleteSchemePoint(id);
    return res.status(204).send();
  } catch (err) {
    console.error("[deleteSchemePointHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao excluir ponto de esquema operacional" });
  }
}

/**
 * PUT /schemes/:schemeId/points
 * -> substitui a LISTA COMPLETA de pontos
 * Perfeito para salvar o esquema vindo do front.
 */
export async function replaceSchemePointsHandler(req: Request, res: Response) {
  try {
    const { schemeId } = req.params;
    const points = req.body as CreateSchemePointInput[];

    if (!Array.isArray(points)) {
      return res.status(400).json({
        message: "Payload deve ser uma lista de pontos",
      });
    }

    const saved = await setSchemePointsForScheme(schemeId, points);

    return res.json({
      message: "Pontos do esquema atualizados com sucesso",
      quantidade: saved.length,
      pontos: saved,
    });
  } catch (err) {
    console.error("[replaceSchemePointsHandler]", err);
    return res
      .status(500)
      .json({ message: "Erro ao salvar pontos do esquema operacional" });
  }
}
