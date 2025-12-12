"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetLocations = handleGetLocations;
exports.handleGetLocationBySigla = handleGetLocationBySigla;
exports.handleGetLocation = handleGetLocation;
exports.handleCreateLocation = handleCreateLocation;
exports.handleUpdateLocation = handleUpdateLocation;
exports.handleDeleteLocation = handleDeleteLocation;
const locations_service_1 = require("./locations.service");
async function handleGetLocations(req, res) {
    try {
        const { q } = req.query;
        const locations = q
            ? await (0, locations_service_1.searchLocations)(String(q))
            : await (0, locations_service_1.getAllLocations)();
        res.json(locations);
    }
    catch (err) {
        console.error("[handleGetLocations] erro:", err);
        res.status(500).json({ error: err.message ?? "Erro ao buscar locais" });
    }
}
async function handleGetLocationBySigla(req, res) {
    try {
        const { sigla } = req.params;
        const normalized = sigla?.toUpperCase().trim();
        if (!normalized) {
            return res.status(400).json({ error: "Sigla inválida" });
        }
        const location = await (0, locations_service_1.getLocationBySigla)(normalized);
        if (!location) {
            return res.status(404).json({ error: "Local não encontrado" });
        }
        return res.json(location);
    }
    catch (err) {
        console.error("[handleGetLocationBySigla] erro:", err);
        return res
            .status(500)
            .json({ error: err.message ?? "Erro ao buscar local pela sigla" });
    }
}
async function handleGetLocation(req, res) {
    try {
        const { id } = req.params;
        const location = await (0, locations_service_1.getLocationById)(id);
        if (!location) {
            return res.status(404).json({ error: "Local não encontrado" });
        }
        res.json(location);
    }
    catch (err) {
        console.error("[handleGetLocation] erro:", err);
        res.status(500).json({ error: err.message ?? "Erro ao buscar local" });
    }
}
async function handleCreateLocation(req, res) {
    try {
        const created = await (0, locations_service_1.createLocation)(req.body);
        res.status(201).json(created);
    }
    catch (err) {
        console.error("[handleCreateLocation] erro:", err);
        res.status(500).json({ error: err.message ?? "Erro ao criar local" });
    }
}
async function handleUpdateLocation(req, res) {
    try {
        const { id } = req.params;
        const updated = await (0, locations_service_1.updateLocation)(id, req.body);
        res.json(updated);
    }
    catch (err) {
        console.error("[handleUpdateLocation] erro:", err);
        res.status(500).json({ error: err.message ?? "Erro ao atualizar local" });
    }
}
async function handleDeleteLocation(req, res) {
    try {
        const { id } = req.params;
        await (0, locations_service_1.deleteLocation)(id);
        res.status(204).send();
    }
    catch (err) {
        console.error("[handleDeleteLocation] erro:", err);
        res.status(500).json({ error: err.message ?? "Erro ao excluir local" });
    }
}
