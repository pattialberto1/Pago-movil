import { Router } from "express";
import { prisma } from "../db/prisma";

export const pagosRouter = Router();

const HORA_MS = 3600_000;

function hoyVenezuela(): string {
  return new Date(Date.now() - 4 * HORA_MS).toISOString().slice(0, 10);
}

pagosRouter.get("/", async (req, res) => {
  const fecha =
    typeof req.query.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)
      ? req.query.fecha
      : hoyVenezuela();

  const desde = new Date(`${fecha}T00:00:00-04:00`);
  const hasta = new Date(desde.getTime() + 24 * HORA_MS);

  const pagos = await prisma.pagoRecibido.findMany({
    where: { fechaPago: { gte: desde, lt: hasta } },
    orderBy: { fechaPago: "desc" },
  });
  const total = pagos.reduce((suma, p) => suma + Number(p.monto), 0);

  res.json({ fecha, cantidad: pagos.length, total, pagos });
});

// La cajera escribe los últimos dígitos de la referencia. Se buscan los últimos
// 3 días para cubrir pagos hechos justo antes de medianoche.
pagosRouter.get("/buscar", async (req, res) => {
  const ref = String(req.query.ref ?? "").replace(/\D/g, "");
  if (ref.length < 4) {
    res.status(400).json({ error: "Escribe al menos 4 dígitos de la referencia" });
    return;
  }

  const pagos = await prisma.pagoRecibido.findMany({
    where: {
      referencia: { endsWith: ref },
      fechaPago: { gte: new Date(Date.now() - 72 * HORA_MS) },
    },
    orderBy: { fechaPago: "desc" },
  });

  res.json({ ref, pagos });
});

// updateMany con cobradoAt: null hace el marcado atómico: si dos cajeras
// marcan a la vez, solo una gana y la otra recibe 409 con quién lo cobró.
pagosRouter.post("/:id/cobrar", async (req, res) => {
  const cobradoPor = String(req.body?.cobradoPor ?? "").trim().slice(0, 60);
  if (!cobradoPor) {
    res.status(400).json({ error: "Falta el nombre de quien cobra" });
    return;
  }

  const { count } = await prisma.pagoRecibido.updateMany({
    where: { id: req.params.id, cobradoAt: null },
    data: { cobradoAt: new Date(), cobradoPor },
  });
  const pago = await prisma.pagoRecibido.findUnique({ where: { id: req.params.id } });
  if (!pago) {
    res.status(404).json({ error: "Pago no encontrado" });
    return;
  }

  res.status(count === 1 ? 200 : 409).json(pago);
});

const VENTANA_DESHACER_MS = 10 * 60_000;

pagosRouter.post("/:id/deshacer", async (req, res) => {
  const { count } = await prisma.pagoRecibido.updateMany({
    where: { id: req.params.id, cobradoAt: { gte: new Date(Date.now() - VENTANA_DESHACER_MS) } },
    data: { cobradoAt: null, cobradoPor: null },
  });
  if (count === 0) {
    res.status(409).json({ error: "Solo se puede deshacer durante los primeros 10 minutos" });
    return;
  }
  res.json({ ok: true });
});
