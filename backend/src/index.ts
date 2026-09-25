import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { env } from "./env";
import { requireAuth } from "./auth";
import { revisarCorreosNuevos } from "./gmail/poller";
import { pagosRouter } from "./routes/pagos";
import { pedidosRouter } from "./routes/pedidos";
import { conciliacionesRouter } from "./routes/conciliaciones";
import { notificacionesRouter } from "./routes/notificaciones";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/notificaciones", notificacionesRouter);
app.use("/api", requireAuth);
app.get("/api/login", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/pagos", pagosRouter);
app.use("/api/pedidos", pedidosRouter);
app.use("/api/conciliaciones", conciliacionesRouter);

// En producción el mismo servicio sirve el frontend ya compilado.
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.listen(env.port, () => {
  console.log(`Servidor escuchando en el puerto ${env.port}`);
});

cron.schedule(env.pollIntervalCron, async () => {
  try {
    await revisarCorreosNuevos();
  } catch (err) {
    console.error("Error revisando correos:", err);
  }
});

revisarCorreosNuevos().catch((err) => console.error("Error en revisión inicial:", err));
