import express from "express";
import cors from "cors";
import cron from "node-cron";
import { env } from "./env";
import { revisarCorreosNuevos } from "./gmail/poller";
import { pagosRouter } from "./routes/pagos";
import { pedidosRouter } from "./routes/pedidos";
import { conciliacionesRouter } from "./routes/conciliaciones";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/pagos", pagosRouter);
app.use("/api/pedidos", pedidosRouter);
app.use("/api/conciliaciones", conciliacionesRouter);

app.listen(env.port, () => {
  console.log(`API escuchando en http://localhost:${env.port}`);
});

cron.schedule(env.pollIntervalCron, async () => {
  try {
    await revisarCorreosNuevos();
  } catch (err) {
    console.error("Error revisando correos:", err);
  }
});

revisarCorreosNuevos().catch((err) => console.error("Error en revisión inicial:", err));
