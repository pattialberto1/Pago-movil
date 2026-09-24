import { getGmailClient } from "./auth";
import { parseCorreoPagoMovil } from "../parser/bancoParser";
import { prisma } from "../db/prisma";
import { intentarConciliar } from "../reconciliation/matcher";
import { env } from "../env";

function decodeBody(payload: any): string {
  const part =
    payload.parts?.find((p: any) => p.mimeType === "text/plain") ?? payload;
  const data = part?.body?.data;
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf-8");
}

export async function revisarCorreosNuevos(): Promise<void> {
  const gmail = getGmailClient();

  const list = await gmail.users.messages.list({
    userId: "me",
    q: `from:${env.gmail.bankSenderFilter} newer_than:1d`,
    maxResults: 20,
  });

  const mensajes = list.data.messages ?? [];

  for (const { id } of mensajes) {
    if (!id) continue;

    const yaExiste = await prisma.pagoRecibido.findUnique({
      where: { gmailMessageId: id },
    });
    if (yaExiste) continue;

    const detalle = await gmail.users.messages.get({ userId: "me", id });
    const fechaCorreo = new Date(Number(detalle.data.internalDate));
    const texto = decodeBody(detalle.data.payload);

    const parseado = parseCorreoPagoMovil(texto, fechaCorreo);
    if (!parseado) {
      console.warn(`No se pudo parsear el correo ${id}, revisar formato`);
      continue;
    }

    const pago = await prisma.pagoRecibido.create({
      data: {
        gmailMessageId: id,
        banco: parseado.banco,
        monto: parseado.monto,
        referencia: parseado.referencia,
        telefono: parseado.telefono,
        cedula: parseado.cedula,
        fechaPago: parseado.fechaPago,
        fechaCorreo,
        rawSnippet: detalle.data.snippet ?? null,
      },
    });

    await intentarConciliar(pago.id);
  }
}
