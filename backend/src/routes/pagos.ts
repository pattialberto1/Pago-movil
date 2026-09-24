import { Router } from "express";
import { prisma } from "../db/prisma";

export const pagosRouter = Router();

pagosRouter.get("/", async (req, res) => {
  const { referencia, telefono, monto } = req.query;

  const pagos = await prisma.pagoRecibido.findMany({
    where: {
      referencia: referencia ? { contains: String(referencia) } : undefined,
      telefonoPagador: telefono ? { contains: String(telefono) } : undefined,
      monto: monto ? Number(monto) : undefined,
    },
    include: { conciliacion: { include: { pedido: true } } },
    orderBy: { fechaPago: "desc" },
    take: 100,
  });

  res.json(pagos);
});
