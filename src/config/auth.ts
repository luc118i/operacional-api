// src/config/auth.ts
export const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_IN_PRODUCTION";

export const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 24 * 60 * 60; // 24h
export const ACCESS_TOKEN_EXPIRES_IN_STRING = "24h"; // usado no jwt.sign
