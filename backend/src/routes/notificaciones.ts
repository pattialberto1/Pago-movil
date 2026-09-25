import { Router, text } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { env } from "../env";
import { claveCorrecta } from "../auth";
import { parseNotificacionBanesco } from "../parser/bancoParser";
import { intentarConciliar } from "../reconciliation/matcher";

export const notificacionesRouter = Router();

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
    res.status(422).json({ error: "No es un pago móvil recibido" });
    return;
  }

  try {
    const creado = await prisma.pagoRecibido.create({
      data: { ...pago, fechaCorreo: new Date(), rawSnippet: texto.slice(0, 500) },
    });
    await intentarConciliar(creado.id);
    console.log(`Notificación de Banesco guardada: Bs ${pago.monto} REF ${pago.referencia}`);
    res.status(201).json({ ok: true, referencia: pago.referencia });
  } catch (err) {
    // Android puede repetir la misma notificación: la referencia ya está guardada.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.json({ ok: true, duplicado: true });
      return;
    }
    throw err;
  }
});
