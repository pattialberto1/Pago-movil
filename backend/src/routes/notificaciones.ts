import { Router, text } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { env } from "../env";
import { claveCorrecta } from "../auth";
import { parseNotificacionBanesco, type PagoParseado } from "../parser/bancoParser";
import { intentarConciliar } from "../reconciliation/matcher";

export const notificacionesRouter = Router();

async function guardarPago(pago: PagoParseado, texto: string): Promise<"nuevo" | "duplicado"> {
  try {
    const creado = await prisma.pagoRecibido.create({
      data: { ...pago, fechaCorreo: new Date(), rawSnippet: texto.slice(0, 500) },
    });
    await intentarConciliar(creado.id);
    console.log(`Notificación de Banesco guardada: Bs ${pago.monto} REF ${pago.referencia}`);
    return "nuevo";
  } catch (err) {
    // Android puede repetir la misma notificación: la referencia ya está guardada.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicado";
    throw err;
  }
}

// Recibe el texto de cada notificación de la app de Banesco, reenviada desde
// un Android (MacroDroid). Acepta texto plano o JSON con el texto en cualquier campo.
notificacionesRouter.post("/banesco", text({ type: "*/*", limit: "16kb" }), async (req, res) => {
  if (!claveCorrecta(String(req.query.clave ?? ""), env.ingestToken)) {
    console.warn(
      env.ingestToken
        ? "Notificación de Banesco rechazada: la clave de la URL no coincide con INGEST_TOKEN"
        : "Notificación de Banesco rechazada: falta la variable INGEST_TOKEN en el servidor"
    );
    res.status(401).json({ error: "Clave incorrecta" });
    return;
  }

  const texto =
    typeof req.body === "string"
      ? req.body
      : Object.values(req.body ?? {}).filter((v) => typeof v === "string").join(" ");

  const pago = parseNotificacionBanesco(texto);
  if (!pago) {
    console.warn("Notificación de Banesco ignorada (no es un pago móvil recibido):", texto.slice(0, 200));
    // Si parece un pago, se guarda para reintentarlo cuando se ajuste el lector.
    if (/pago recibido/i.test(texto)) {
      await prisma.notificacionPendiente.create({ data: { banco: "Banesco", texto: texto.slice(0, 2000) } });
    }
    res.status(422).json({ error: "No es un pago móvil recibido" });
    return;
  }

  const resultado = await guardarPago(pago, texto);
  res.status(resultado === "nuevo" ? 201 : 200).json({ ok: true, duplicado: resultado === "duplicado" });
});

export async function reprocesarNotificacionesPendientes() {
  const pendientes = await prisma.notificacionPendiente.findMany();
  let recuperados = 0;
  for (const n of pendientes) {
    const pago = parseNotificacionBanesco(n.texto);
    const vencida = Date.now() - n.createdAt.getTime() > 7 * 24 * 3600_000;
    if (pago) {
      if ((await guardarPago(pago, n.texto)) === "nuevo") recuperados++;
    }
    if (pago || vencida) await prisma.notificacionPendiente.delete({ where: { id: n.id } });
  }
  if (recuperados) console.log(`Recuperados ${recuperados} pagos de notificaciones pendientes`);
}
