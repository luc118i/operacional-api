"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSchemesHandler = listSchemesHandler;
exports.getSchemeByIdHandler = getSchemeByIdHandler;
exports.getSchemeFullHandler = getSchemeFullHandler;
exports.createSchemeHandler = createSchemeHandler;
exports.updateSchemeHandler = updateSchemeHandler;
exports.deleteSchemeHandler = deleteSchemeHandler;
exports.getSchemeSummaryHandler = getSchemeSummaryHandler;
exports.searchSchemeByKeyHandler = searchSchemeByKeyHandler;
const schemes_service_1 = require("./schemes.service");
async function listSchemesHandler(_req, res) {
    try {
        const schemesWithSummary = await (0, schemes_service_1.getAllSchemesWithSummary)();
        return res.json(schemesWithSummary);
    }
    catch (err) {
        console.error("[listSchemesHandler]", err);
        return res
            .status(500)
            .json({ message: "Erro ao listar esquemas operacionais" });
    }
}
async function getSchemeByIdHandler(req, res) {
    try {
        const { id } = req.params;
        const scheme = await (0, schemes_service_1.getSchemeById)(id);
        if (!scheme) {
            return res
                .status(404)
                .json({ message: "Esquema operacional não encontrado" });
        }
        return res.json(scheme);
    }
    catch (err) {
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
async function getSchemeFullHandler(req, res) {
    try {
        const { id } = req.params;
        const scheme = await (0, schemes_service_1.getSchemeByIdWithPoints)(id);
        if (!scheme) {
            return res
                .status(404)
                .json({ message: "Esquema operacional não encontrado" });
        }
        return res.json(scheme);
    }
    catch (err) {
        console.error("[getSchemeFullHandler]", err);
        return res.status(500).json({
            message: "Erro ao buscar esquema operacional completo",
        });
    }
}
async function createSchemeHandler(req, res) {
    try {
        const body = req.body;
        if (!body.codigo ||
            !body.nome ||
            !body.origem_location_id ||
            !body.destino_location_id ||
            typeof body.distancia_total_km !== "number") {
            return res
                .status(400)
                .json({ message: "Dados obrigatórios não informados" });
        }
        const scheme = await (0, schemes_service_1.createScheme)(body);
        return res.status(201).json(scheme);
    }
    catch (err) {
        console.error("[createSchemeHandler]", err);
        return res
            .status(500)
            .json({ message: "Erro ao criar esquema operacional" });
    }
}
async function updateSchemeHandler(req, res) {
    try {
        const { id } = req.params;
        const body = req.body;
        const updated = await (0, schemes_service_1.updateScheme)(id, body);
        if (!updated) {
            return res
                .status(404)
                .json({ message: "Esquema operacional não encontrado" });
        }
        return res.json(updated);
    }
    catch (err) {
        console.error("[updateSchemeHandler]", err);
        return res
            .status(500)
            .json({ message: "Erro ao atualizar esquema operacional" });
    }
}
async function deleteSchemeHandler(req, res) {
    try {
        const { id } = req.params;
        await (0, schemes_service_1.deleteScheme)(id);
        return res.status(204).send();
    }
    catch (err) {
        console.error("[deleteSchemeHandler]", err);
        return res
            .status(500)
            .json({ message: "Erro ao excluir esquema operacional" });
    }
}
async function getSchemeSummaryHandler(req, res) {
    try {
        const { id } = req.params;
        const summary = await (0, schemes_service_1.getSchemeSummary)(id);
        if (!summary) {
            return res
                .status(404)
                .json({ message: "Esquema operacional não encontrado" });
        }
        return res.json(summary);
    }
    catch (err) {
        console.error("[getSchemeSummaryHandler]", err);
        return res
            .status(500)
            .json({ message: "Erro ao gerar resumo do esquema operacional" });
    }
}
async function searchSchemeByKeyHandler(req, res) {
    try {
        const { codigo, direction, tripTime } = req.query;
        if (!codigo || !direction || !tripTime) {
            return res.status(400).json({
                message: "Parâmetros obrigatórios: codigo, direction e tripTime (HH:MM).",
            });
        }
        const scheme = await (0, schemes_service_1.findSchemeByKey)(String(codigo), String(direction), String(tripTime));
        if (!scheme) {
            return res.status(404).json({
                message: "Nenhum esquema encontrado para essa combinação.",
            });
        }
        return res.json(scheme);
    }
    catch (err) {
        console.error("[searchSchemeByKeyHandler]", err);
        return res.status(500).json({
            message: "Erro ao buscar esquema operacional por combinação de chave.",
        });
    }
}
