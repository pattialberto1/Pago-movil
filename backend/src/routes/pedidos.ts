import { Router } from "express";
import { prisma } from "../db/prisma";

export const pedidosRouter = Router();

pedidosRouter.get("/", async (_req, res) => {
  const pedidos = await prisma.pedidoPendiente.findMany({
    include: { conciliacion: { include: { pago: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(pedidos);
});

pedidosRouter.post("/", async (req, res) => {
  const { descripcion, montoEsperado, clienteNombre, clienteTelefono } = req.body;

  if (!descripcion || montoEsperado == null) {
    return res.status(400).json({ error: "descripcion y montoEsperado son requeridos" });
  }

  const pedido = await prisma.pedidoPendiente.create({
    data: { descripcion, montoEsperado, clienteNombre, clienteTelefono },
  });

  res.status(201).json(pedido);
});
