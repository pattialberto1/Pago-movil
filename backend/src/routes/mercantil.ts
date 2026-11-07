import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { parseMonto } from "../parser/bancoParser";
import { intentarConciliar } from "../reconciliation/matcher";
import { buscarPagoMovil, ErrorMercantil, mercantilActivo, telefonoMercantil, type TransaccionMercantil } from "../mercantil";

export const BANCO = "Mercantil";
export const VERIFICADO_POR_API = "consulta a Mercantil";

const HORA_MS = 3600_000;
const diaVenezuela = (ms: number) => new Date(ms - 4 * HORA_MS).toISOString().slice(0, 10);

export const mercantilRouter = Router();

async function guardar(trx: TransaccionMercantil, telefonoPagador: string) {
  const referencia = trx.payment_reference;
  const existente = await prisma.pagoRecibido.findUnique({ where: { banco_referencia: { banco: BANCO, referencia } } });
  if (existente) return existente;

  // El API solo da la fecha: si es de hoy se usa la hora de la consulta, si no, el mediodía de ese día.
  const fechaPago = trx.trx_date === diaVenezuela(Date.now()) ? new Date() : new Date(`${trx.trx_date}T12:00:00-04:00`);
  try {
    const pago = await prisma.pagoRecibido.create({
      data: {
        banco: BANCO,
        referencia,
        monto: trx.amount,
        telefonoPagador,
        fechaPago,
        fechaCorreo: new Date(),
        verificadoPor: VERIFICADO_POR_API,
        rawSnippet: JSON.stringify({ trx_date: trx.trx_date, payment_method: trx.payment_method, trx_type: trx.trx_type }),
      },
    });
    await intentarConciliar(pago.id);
    return pago;
  } catch (err) {
    // Otra cajera lo registró al mismo tiempo.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.pagoRecibido.findUniqueOrThrow({ where: { banco_referencia: { banco: BANCO, referencia } } });
    }
    throw err;
  }
}

// La cajera da referencia, monto y teléfono del cliente; se consulta el día de
// hoy y el de ayer (pagos hechos justo antes de medianoche).
mercantilRouter.post("/buscar", async (req, res) => {
  if (!mercantilActivo()) {
    res.status(503).json({ error: "La consulta a Mercantil no está configurada" });
    return;
  }

  const digitos = String(req.body?.referencia ?? "").replace(/\D/g, "");
  // Mercantil acepta la referencia completa (12) o sus últimos 4 a 6 dígitos.
  const referencia = digitos.length === 12 || (digitos.length >= 4 && digitos.length <= 6) ? digitos : digitos.slice(-6);
  const monto = parseMonto(String(req.body?.monto ?? ""));
  const telefono = telefonoMercantil(String(req.body?.telefono ?? ""));

  if (referencia.length < 4 || !(monto > 0) || !telefono) {
    res.status(400).json({ error: "Indica referencia, monto y teléfono del cliente (ej. 04141234567)" });
    return;
  }

  const ip = req.ip?.replace(/^::ffff:/, "") || "127.0.0.1";
  const telefonoPagador = `0${telefono.slice(2)}`;
  try {
    for (const fecha of [diaVenezuela(Date.now()), diaVenezuela(Date.now() - 24 * HORA_MS)]) {
      const encontrados = await buscarPagoMovil({ referencia, monto, telefonoPagador: telefono, fecha, ip });
      if (encontrados.length > 0) {
        const pagos = [];
        for (const trx of encontrados) pagos.push(await guardar(trx, telefonoPagador));
        console.log(`Mercantil confirmó ${pagos.length} pago(s) con REF …${referencia} por Bs ${monto}`);
        res.json({ encontrado: true, pagos });
        return;
      }
    }
    res.json({ encontrado: false, pagos: [] });
  } catch (err) {
    if (err instanceof ErrorMercantil || (err instanceof Error && err.name === "TimeoutError")) {
      res.status(502).json({ error: `Mercantil no respondió bien (${err.message}). Pide verificación al encargado.` });
      return;
    }
    throw err;
  }
});
