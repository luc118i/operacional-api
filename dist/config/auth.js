"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCESS_TOKEN_EXPIRES_IN_STRING = exports.ACCESS_TOKEN_EXPIRES_IN_SECONDS = exports.JWT_SECRET = void 0;
// src/config/auth.ts
exports.JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_IN_PRODUCTION";
exports.ACCESS_TOKEN_EXPIRES_IN_SECONDS = 24 * 60 * 60; // 24h
exports.ACCESS_TOKEN_EXPIRES_IN_STRING = "24h"; // usado no jwt.sign
