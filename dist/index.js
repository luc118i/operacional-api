"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const locations_1 = require("./modules/locations");
const schemes_1 = require("./modules/schemes");
const schemePoints_1 = require("./modules/schemePoints");
const roadSegments_routes_1 = __importDefault(require("./modules/roadSegments/roadSegments.routes"));
const authRoutes_1 = require("./routes/authRoutes");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3333;
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
];
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}
app.use((0, cors_1.default)({
    origin: allowedOrigins,
}));
app.use(express_1.default.json());
app.get("/status", (_req, res) => {
    res.json({ status: "ok", message: "API operacional rodando 🚍" });
});
// 🔐
app.use(authRoutes_1.authRoutes);
// 📡 rotas de leitura (públicas)
app.use("/locations", locations_1.locationsRouter);
app.use("/schemes", schemes_1.schemesRouter);
app.use("/scheme-points", schemePoints_1.schemePointsRouter);
app.use("/road-segments", roadSegments_routes_1.default);
app.listen(port, () => {
    console.log(`🚀 API rodando em http://localhost:${port}`);
});
