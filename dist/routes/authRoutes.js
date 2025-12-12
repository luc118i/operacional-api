"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
// src/routes/authRoutes.ts
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const upabaseClient_1 = require("../config/upabaseClient");
const jwt_1 = require("../utils/jwt");
/**
 * Busca usuário por email OU username
 */
async function findUserByIdentifier(identifier) {
    const { data, error } = await upabaseClient_1.supabase
        .from("users")
        .select("id, name, email, username, password_hash, role")
        .or(`email.eq.${identifier},username.eq.${identifier}`)
        .limit(1)
        .maybeSingle();
    if (error) {
        // Supabase v2: "PGRST116" costuma ser "No rows found"
        console.error("[findUserByIdentifier] erro Supabase:", error);
        if (error.code === "PGRST116") {
            return null;
        }
        throw error;
    }
    if (!data) {
        return null;
    }
    return data;
}
// ✅ AQUI está o export que faltava
exports.authRoutes = (0, express_1.Router)();
exports.authRoutes.post("/auth/login", async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        res.status(400).json({
            error: {
                code: "VALIDATION_ERROR",
                message: "Dados inválidos na requisição.",
                details: {
                    identifier: !identifier ? "Campo obrigatório" : undefined,
                    password: !password ? "Campo obrigatório" : undefined,
                },
            },
        });
        return;
    }
    try {
        const user = await findUserByIdentifier(identifier);
        if (!user) {
            res.status(401).json({
                error: {
                    code: "INVALID_CREDENTIALS",
                    message: "Credenciais inválidas. Verifique usuário/senha.",
                    details: null,
                },
            });
            return;
        }
        const passwordMatches = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!passwordMatches) {
            res.status(401).json({
                error: {
                    code: "INVALID_CREDENTIALS",
                    message: "Credenciais inválidas. Verifique usuário/senha.",
                    details: null,
                },
            });
            return;
        }
        const { accessToken, expiresIn } = (0, jwt_1.signAccessToken)({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
        res.json({
            accessToken,
            tokenType: "Bearer",
            expiresIn,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    }
    catch (err) {
        console.error("[POST /auth/login] erro:", err);
        res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ocorreu um erro inesperado. Tente novamente mais tarde.",
                details: null,
            },
        });
    }
});
