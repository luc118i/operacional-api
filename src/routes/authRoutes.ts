// src/routes/authRoutes.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";

import { supabase } from "../config/upabaseClient";
import { signAccessToken } from "../utils/jwt";

// Interface alinhada com a tabela `users` no Supabase
interface UserEntity {
  id: string;
  name: string;
  email: string;
  username: string;
  password_hash: string;
  role: string;
}

/**
 * Busca usuário por email OU username
 */
async function findUserByIdentifier(
  identifier: string
): Promise<UserEntity | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, username, password_hash, role")
    .or(`email.eq.${identifier},username.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Supabase v2: "PGRST116" costuma ser "No rows found"
    console.error("[findUserByIdentifier] erro Supabase:", error);

    if ((error as any).code === "PGRST116") {
      return null;
    }

    throw error;
  }

  if (!data) {
    return null;
  }

  return data as UserEntity;
}

// ✅ AQUI está o export que faltava
export const authRoutes = Router();

authRoutes.post(
  "/auth/login",
  async (req: Request, res: Response): Promise<void> => {
    const { identifier, password } = req.body as {
      identifier?: string;
      password?: string;
    };

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

      const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
      );

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

      const { accessToken, expiresIn } = signAccessToken({
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
    } catch (err) {
      console.error("[POST /auth/login] erro:", err);
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Ocorreu um erro inesperado. Tente novamente mais tarde.",
          details: null,
        },
      });
    }
  }
);
