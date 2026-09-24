import { prisma } from "../db/prisma";

const VENTANA_HORAS = 48;

/**
 * Intenta conciliar un pago recién ingresado contra los pedidos pendientes.
 * Regla simple para el MVP: monto exacto + pedido aún sin conciliar,
 * dentro de una ventana de tiempo razonable.
 * Si hay 1 solo candidato -> VERIFICADO. Si hay 0 -> SIN_MATCH. Si hay 2+ -> AMBIGUO.
 */
export async function intentarConciliar(pagoId: string): Promise<void> {
  const pago = await prisma.pagoRecibido.findUniqueOrThrow({ where: { id: pagoId } });

  const desde = new Date(pago.fechaPago);
  desde.setHours(desde.getHours() - VENTANA_HORAS);

  const candidatos = await prisma.pedidoPendiente.findMany({
    where: {
      montoEsperado: pago.monto,
      estado: "PENDIENTE",
      createdAt: { gte: desde },
      conciliacion: null,
    },
  });

  if (candidatos.length === 1) {
    const pedido = candidatos[0];
    await prisma.$transaction([
      prisma.conciliacion.create({
        data: {
          pagoId: pago.id,
          pedidoId: pedido.id,
          estado: "VERIFICADO",
          metodoMatch: "monto_exacto",
        },
      }),
      prisma.pedidoPendiente.update({
        where: { id: pedido.id },
        data: { estado: "PAGADO" },
      }),
    ]);
    return;
  }

  await prisma.conciliacion.create({
    data: {
      pagoId: pago.id,
      estado: candidatos.length === 0 ? "SIN_MATCH" : "AMBIGUO",
    },
  });
}
