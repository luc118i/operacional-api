import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { locationsRouter } from "./modules/locations";
import { schemesRouter } from "./modules/schemes";
import { schemePointsRouter } from "./modules/schemePoints";
import roadSegmentsRoutes from "./modules/roadSegments/roadSegments.routes";
import { authRoutes } from "./routes/authRoutes";

import { updateSchemePointsDerivedFields } from "./modules/schemePoints/schemePoints.service";
import { supabase } from "./config/upabaseClient";

dotenv.config();

const app = express();

// Railway injeta PORT como string; converta para number.
const PORT = Number(process.env.PORT) || 3333;
// Bind explícito para ambientes containerizados (Railway/Docker).
const HOST = "0.0.0.0";

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
  "https://operacional-app.vercel.app",
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// REMOVER: você já configurou cors acima.
// app.use(cors());
// app.options(/.*/, cors());

app.use(express.json());

app.get("/status", (_req, res) => {
  res.json({ status: "ok", message: "API operacional rodando 🚍" });
});

// 🔐
app.use(authRoutes);
// 📡 rotas de leitura (públicas)
app.use("/locations", locationsRouter);
app.use("/schemes", schemesRouter);
app.use("/scheme-points", schemePointsRouter);
app.use("/road-segments", roadSegmentsRoutes);

app.post("/debug/derived/:schemeId", async (req, res) => {
  try {
    const { schemeId } = req.params;

    const { count, error } = await supabase
      .from("scheme_points")
      .select("id", { count: "exact", head: true })
      .eq("scheme_id", schemeId);

    if (error) throw error;

    const result = await updateSchemePointsDerivedFields(schemeId);

    return res.json({ ok: true, schemeId, countSeenByBackend: count, result });
  } catch (e: any) {
    console.error("[DEBUG] derived endpoint error", e);
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 API rodando em http://${HOST}:${PORT}`);
});
