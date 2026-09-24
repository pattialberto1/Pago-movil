import { Router } from "express";
import { prisma } from "../db/prisma";

export const conciliacionesRouter = Router();

conciliacionesRouter.get("/", async (req, res) => {
  const { estado } = req.query;

  const conciliaciones = await prisma.conciliacion.findMany({
    where: { estado: estado ? String(estado) as any : undefined },
    include: { pago: true, pedido: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json(conciliaciones);
});

// Confirmación manual: un usuario liga a mano un pago ambiguo/sin match con un pedido.
conciliacionesRouter.post("/:id/confirmar", async (req, res) => {
  const { id } = req.params;
  const { pedidoId, revisadoPor } = req.body;

  if (!pedidoId) {
    return res.status(400).json({ error: "pedidoId es requerido" });
  }

  const conciliacion = await prisma.conciliacion.update({
    where: { id },
    data: { pedidoId, estado: "VERIFICADO", metodoMatch: "manual", revisadoPor },
  });

  await prisma.pedidoPendiente.update({
    where: { id: pedidoId },
    data: { estado: "PAGADO" },
  });

  res.json(conciliacion);
});
