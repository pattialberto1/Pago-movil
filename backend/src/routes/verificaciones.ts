import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { env } from "../env";
import { parseMonto } from "../parser/bancoParser";
import { editarMensaje, enviarATodos, responderBoton, telegramActivo, type CallbackQuery } from "../telegram";

export const BANCOS = ["Bancaribe", "Banesco"];

const bs = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hora = (d: Date) =>
  d.toLocaleTimeString("es-VE", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit" });

export const verificacionesRouter = Router();

verificacionesRouter.post("/", async (req, res) => {
  if (!telegramActivo()) {
    res.status(503).json({ error: "La verificación por Telegram no está configurada" });
    return;
  }

  const banco = String(req.body?.banco ?? "");
  const referencia = String(req.body?.referencia ?? "").replace(/\D/g, "");
  const monto = parseMonto(String(req.body?.monto ?? ""));
  const solicitadoPor = String(req.body?.solicitadoPor ?? "").trim().slice(0, 60);

  if (!BANCOS.includes(banco) || referencia.length < 6 || !(monto > 0) || !solicitadoPor) {
    res.status(400).json({ error: "Indica banco, referencia completa y monto" });
    return;
  }

  // Si el aviso del banco llegó mientras tanto, no hace falta molestar al encargado.
  const existente = await prisma.pagoRecibido.findUnique({ where: { banco_referencia: { banco, referencia } } });
  if (existente) {
    res.status(409).json({ error: "Ese pago ya está registrado: vuelve a verificarlo", pago: existente });
    return;
  }

  const sol = await prisma.solicitudVerificacion.create({
    data: { banco, referencia, monto, solicitadoPor },
  });

  const texto =
    `🔎 Verificar pago móvil\n\n` +
    `Caja: ${solicitadoPor}\nBanco: ${banco}\nReferencia: ${referencia}\nMonto: Bs ${bs.format(monto)}\n` +
    `Pedido a las ${hora(sol.createdAt)}\n\n` +
    `Revisa los movimientos de ${banco} y confirma solo si la referencia y el monto coinciden.`;
  const enviados = await enviarATodos(texto, [
    { text: "✅ Confirmar", callback_data: `v:ok:${sol.id}` },
    { text: "❌ Rechazar", callback_data: `v:no:${sol.id}` },
  ]);

  if (enviados.length === 0) {
    await prisma.solicitudVerificacion.delete({ where: { id: sol.id } });
    res.status(502).json({ error: "No se pudo avisar por Telegram. Verifica el pago directamente en el banco." });
    return;
  }

  await prisma.solicitudVerificacion.update({
    where: { id: sol.id },
    data: { telegramMensajes: JSON.stringify(enviados) },
  });
  res.status(201).json({ id: sol.id });
});

verificacionesRouter.get("/:id", async (req, res) => {
  const sol = await prisma.solicitudVerificacion.findUnique({ where: { id: req.params.id } });
  if (!sol) {
    res.status(404).json({ error: "Solicitud no encontrada" });
    return;
  }
  const pago = sol.pagoId ? await prisma.pagoRecibido.findUnique({ where: { id: sol.pagoId } }) : null;
  res.json({ ...sol, pago });
});

// Registra el pago confirmado y lo marca como cobrado por la cajera que lo pidió,
// para que nadie más pueda aceptarlo. Si el aviso del banco llega después, se
// descarta como duplicado por banco + referencia.
async function registrarPagoConfirmado(solId: string, verificadoPor: string) {
  const sol = await prisma.solicitudVerificacion.findUniqueOrThrow({ where: { id: solId } });
  const ahora = new Date();

  let pago = await prisma.pagoRecibido.findUnique({
    where: { banco_referencia: { banco: sol.banco, referencia: sol.referencia } },
  });
  if (!pago) {
    try {
      pago = await prisma.pagoRecibido.create({
        data: {
          banco: sol.banco,
          referencia: sol.referencia,
          monto: sol.monto,
          fechaPago: sol.createdAt,
          fechaCorreo: ahora,
          verificadoPor,
          cobradoAt: ahora,
          cobradoPor: sol.solicitadoPor,
          rawSnippet: "Registrado manualmente tras verificación por Telegram",
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      pago = await prisma.pagoRecibido.findUniqueOrThrow({
        where: { banco_referencia: { banco: sol.banco, referencia: sol.referencia } },
      });
    }
  }
  if (!pago.cobradoAt) {
    await prisma.pagoRecibido.updateMany({
      where: { id: pago.id, cobradoAt: null },
      data: { cobradoAt: ahora, cobradoPor: sol.solicitadoPor, verificadoPor },
    });
  }
  await prisma.solicitudVerificacion.update({ where: { id: solId }, data: { pagoId: pago.id } });
}

export async function manejarBotonTelegram(cb: CallbackQuery) {
  const [prefijo, accion, solId] = (cb.data ?? "").split(":");
  if (prefijo !== "v" || !solId) return;

  const chatId = String(cb.message?.chat.id ?? cb.from.id);
  if (!env.telegram.chatIds.includes(chatId)) {
    await responderBoton(cb.id, "No autorizado");
    return;
  }

  const quien = cb.from.first_name ?? "Encargado";
  const estado = accion === "ok" ? "CONFIRMADA" : "RECHAZADA";

  // Solo el primero que responde decide, aunque haya varios encargados.
  const { count } = await prisma.solicitudVerificacion.updateMany({
    where: { id: solId, estado: "PENDIENTE" },
    data: { estado, resueltoPor: quien, resueltoAt: new Date() },
  });
  if (count === 0) {
    await responderBoton(cb.id, "Esta solicitud ya fue respondida");
    return;
  }

  if (estado === "CONFIRMADA") await registrarPagoConfirmado(solId, quien);
  await responderBoton(cb.id, estado === "CONFIRMADA" ? "Pago confirmado" : "Pago rechazado");

  const sol = await prisma.solicitudVerificacion.findUniqueOrThrow({ where: { id: solId } });
  const resumen =
    `${sol.banco} · Ref. ${sol.referencia} · Bs ${bs.format(Number(sol.monto))} · ${sol.solicitadoPor}\n\n` +
    (estado === "CONFIRMADA" ? `✅ Confirmado por ${quien}` : `❌ Rechazado por ${quien}`) +
    ` a las ${hora(new Date())}`;
  const mensajes: { chatId: string; messageId: number }[] = JSON.parse(sol.telegramMensajes ?? "[]");
  for (const m of mensajes) await editarMensaje(m.chatId, m.messageId, resumen);
}
