import { getGmailClient } from "./auth";
import { parseCorreoPagoMovilBancaribe } from "../parser/bancoParser";
import { prisma } from "../db/prisma";
import { intentarConciliar } from "../reconciliation/matcher";
import { env } from "../env";

function findPart(payload: any, mimeType: string): any {
  if (!payload) return null;
  if (payload.mimeType === mimeType) return payload;
  for (const part of payload.parts ?? []) {
    const encontrada = findPart(part, mimeType);
    if (encontrada) return encontrada;
  }
  return null;
}

const ENTIDADES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Ntilde: "Ñ",
};

function decodeEntities(texto: string): string {
  return texto.replace(/&(\w+);/g, (match, nombre) => ENTIDADES[nombre] ?? match);
}

function stripHtml(html: string): string {
  const sinBloques = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  const conSaltos = sinBloques.replace(/<\/(p|div|tr|br)\s*>|<br\s*\/?>/gi, "\n");
  const sinTags = conSaltos.replace(/<[^>]+>/g, " ");
  return decodeEntities(sinTags);
}

// Los correos de notificación bancaria suelen venir solo en HTML (con banner
// e imágenes), así que buscamos texto plano si existe y si no, limpiamos el HTML.
export function decodeBody(payload: any): string {
  const partePlano = findPart(payload, "text/plain");
  const parteHtml = findPart(payload, "text/html");
  const parte = partePlano ?? parteHtml ?? payload;

  const data = parte?.body?.data;
  if (!data) return "";

  const decodificado = Buffer.from(data, "base64url").toString("utf-8");
  return parte === parteHtml ? stripHtml(decodificado) : decodificado;
}

// Correos que no son pagos recibidos; se recuerdan hasta el próximo reinicio
// para no volver a descargarlos ni repetir el aviso cada 2 minutos.
const ignorados = new Set<string>();

export async function revisarCorreosNuevos(): Promise<void> {
  const gmail = getGmailClient();

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: `from:${env.gmail.bankSenderFilter} newer_than:2d`,
      maxResults: 500,
      pageToken,
    });
    for (const m of list.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken);

  const existentes = await prisma.pagoRecibido.findMany({
    where: { gmailMessageId: { in: ids } },
    select: { gmailMessageId: true },
  });
  const procesados = new Set(existentes.map((e) => e.gmailMessageId));

  // Del más viejo al más nuevo, para conciliar en orden de llegada.
  for (const id of ids.reverse()) {
    if (procesados.has(id) || ignorados.has(id)) continue;

    const detalle = await gmail.users.messages.get({ userId: "me", id });
    const fechaCorreo = new Date(Number(detalle.data.internalDate));
    const texto = decodeBody(detalle.data.payload);

    const parseado = parseCorreoPagoMovilBancaribe(texto, fechaCorreo);
    if (!parseado) {
      ignorados.add(id);
      // Bancaribe usa el mismo remitente para los pagos móviles que hace la propia cuenta.
      if (!/usted\s+realiz[oó]\s+un\s+Pago\s+M[oó]vil/i.test(texto)) {
        console.warn(`No se pudo parsear el correo ${id}, revisar formato`);
      }
      continue;
    }

    const repetido = await prisma.pagoRecibido.findUnique({
      where: { banco_referencia: { banco: parseado.banco, referencia: parseado.referencia } },
    });
    if (repetido) continue;

    const pago = await prisma.pagoRecibido.create({
      data: {
        gmailMessageId: id,
        banco: parseado.banco,
        monto: parseado.monto,
        referencia: parseado.referencia,
        telefonoPagador: parseado.telefonoPagador,
        telefonoReceptor: parseado.telefonoReceptor,
        fechaPago: parseado.fechaPago,
        fechaCorreo,
        rawSnippet: detalle.data.snippet ?? null,
      },
    });

    await intentarConciliar(pago.id);
  }
}
