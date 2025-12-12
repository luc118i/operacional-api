// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/auth";

interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
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
    const decoded = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      name: string;
      email: string;
      role: string;
      iat: number;
      exp: number;
    };

    req.user = {
      id: decoded.sub,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
    };

    return next();
  } catch (err: any) {
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
