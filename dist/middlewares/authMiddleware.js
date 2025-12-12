"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_1 = require("../config/auth");
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: {
                code: "UNAUTHORIZED",
                message: "Token de autenticação não informado.",
                details: null,
            },
        });
    }
    const token = authHeader.substring(7); // remove "Bearer "
    try {
        const decoded = jsonwebtoken_1.default.verify(token, auth_1.JWT_SECRET);
        req.user = {
            id: decoded.sub,
            name: decoded.name,
            email: decoded.email,
            role: decoded.role,
        };
        return next();
    }
    catch (err) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({
                error: {
                    code: "TOKEN_EXPIRED",
                    message: "Sua sessão expirou. Faça login novamente.",
                    details: null,
                },
            });
        }
        return res.status(401).json({
            error: {
                code: "INVALID_TOKEN",
                message: "Token de autenticação inválido.",
                details: null,
            },
        });
    }
}
