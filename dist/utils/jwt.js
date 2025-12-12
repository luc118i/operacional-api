"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
// src/utils/jwt.ts
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_1 = require("../config/auth");
function signAccessToken(user) {
    const payload = {
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
    };
    const token = jsonwebtoken_1.default.sign(payload, auth_1.JWT_SECRET, {
        expiresIn: auth_1.ACCESS_TOKEN_EXPIRES_IN_STRING, // "24h"
    });
    return {
        accessToken: token,
        expiresIn: auth_1.ACCESS_TOKEN_EXPIRES_IN_SECONDS, // 86400
    };
}
