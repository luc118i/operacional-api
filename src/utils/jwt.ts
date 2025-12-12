// src/utils/jwt.ts
import jwt from "jsonwebtoken";
import {
  JWT_SECRET,
  ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  ACCESS_TOKEN_EXPIRES_IN_STRING,
} from "../config/auth";

export interface JwtUserPayload {
  sub: string;
  name: string;
  email: string;
  role: string;
}

export function signAccessToken(user: {
  id: string;
  name: string;
  email: string;
  role: string;
}) {
  const payload: JwtUserPayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_STRING, // "24h"
  });

  return {
    accessToken: token,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS, // 86400
  };
}
