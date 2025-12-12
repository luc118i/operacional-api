"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSchemePointsHandler = listSchemePointsHandler;
exports.getSchemePointByIdHandler = getSchemePointByIdHandler;
exports.listPointsBySchemeIdHandler = listPointsBySchemeIdHandler;
exports.createSchemePointHandler = createSchemePointHandler;
exports.updateSchemePointHandler = updateSchemePointHandler;
exports.deleteSchemePointHandler = deleteSchemePointHandler;
exports.replaceSchemePointsHandler = replaceSchemePointsHandler;
const schemePoints_service_1 = require("./schemePoints.service");
/**
 * GET /scheme-points  -> lista geral
 */
async function listSchemePointsHandler(_req, res) {
    try {
        const points = await (0, schemePoints_service_1.getAllSchemePoints)();
        return res.json(points);
    }
    catch (err) {
        console.error("[listSchemePointsHandler]", err);
        return res.status(500).json({
            message: "Erro ao listar pontos de esquema operacional",
        });
    }
}
/**
 * GET /scheme-points/:id -> busca individual
 */
async function getSchemePointByIdHandler(req, res) {
    try {
        const { id } = req.params;
        const point = await (0, schemePoints_service_1.getSchemePointById)(id);
        if (!point) {
            return res
                .status(404)
                .json({ message: "Ponto de esquema operacional não encontrado" });
        }
        return res.json(point);
    }
    catch (err) {
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
async function listPointsBySchemeIdHandler(req, res) {
    const { schemeId } = req.params;
    try {
        const points = await (0, schemePoints_service_1.getSchemePointsBySchemeId)(schemeId);
        return res.json(points);
    }
    catch (err) {
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
async function createSchemePointHandler(req, res) {
    try {
        const body = req.body;
        // Validação mínima (agora mais flexível)
        if (!body.scheme_id ||
            !body.location_id ||
            typeof body.ordem !== "number") {
            return res.status(400).json({
                message: "Campos obrigatórios: scheme_id, location_id, ordem",
            });
        }
        const point = await (0, schemePoints_service_1.createSchemePoint)(body);
        return res.status(201).json(point);
    }
    catch (err) {
        console.error("[createSchemePointHandler]", err);
        return res
            .status(500)
            .json({ message: "Erro ao criar ponto de esquema operacional" });
    }
}
/**
 * PUT /scheme-points/:id
 */
async function updateSchemePointHandler(req, res) {
    try {
        const { id } = req.params;
        const input = req.body;
        const updated = await (0, schemePoints_service_1.updateSchemePoint)(id, input);
        if (!updated) {
            return res
                .status(404)
                .json({ message: "Ponto de esquema operacional não encontrado" });
        }
        return res.json(updated);
    }
    catch (err) {
        console.error("[updateSchemePointHandler]", err);
        return res
            .status(500)
            .json({ message: "Erro ao atualizar ponto de esquema operacional" });
    }
}
/**
 * DELETE /scheme-points/:id
 */
async function deleteSchemePointHandler(req, res) {
    try {
        const { id } = req.params;
        await (0, schemePoints_service_1.deleteSchemePoint)(id);
        return res.status(204).send();
    }
    catch (err) {
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
async function replaceSchemePointsHandler(req, res) {
    try {
        const { schemeId } = req.params;
        const points = req.body;
        if (!Array.isArray(points)) {
            return res.status(400).json({
                message: "Payload deve ser uma lista de pontos",
            });
        }
        const saved = await (0, schemePoints_service_1.setSchemePointsForScheme)(schemeId, points);
        return res.json({
            message: "Pontos do esquema atualizados com sucesso",
            quantidade: saved.length,
            pontos: saved,
        });
    }
    catch (err) {
        console.error("[replaceSchemePointsHandler]", err);
        return res
            .status(500)
            .json({ message: "Erro ao salvar pontos do esquema operacional" });
    }
}
