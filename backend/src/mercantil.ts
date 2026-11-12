import { createCipheriv, createHash } from "node:crypto";
import { env } from "./env";

// Cliente del API "Búsqueda de Transacciones Móviles" de Mercantil
// (POST /mobile-payment/search). Los teléfonos viajan cifrados con
// AES-128-ECB usando los primeros 16 bytes del SHA-256 de la clave secreta.

const URLS = {
  certificacion: "https://apimbu.mercantilbanco.com/mercantil-banco/sandbox/v1/mobile-payment/search",
  produccion: "https://apimbu.mercantilbanco.com/mercantil-banco/prod/v1/mobile-payment/search",
};

// Códigos de "no hay transacciones para el criterio": la documentación dice 9033,
// pero el sandbox responde 0330.
const SIN_RESULTADOS = ["9033", "0330"];

export interface TransaccionMercantil {
  trx_date: string;
  // Mercantil la devuelve como número aunque la documentación diga texto.
  payment_reference: string | number;
  amount: number;
  payment_method?: string;
  trx_type?: string;
}

export class ErrorMercantil extends Error {}

export function mercantilActivo(): boolean {
  const m = env.mercantil;
  return !!(m.clientId && m.secretKey && m.merchantId && m.telefono);
}

export function cifrar(texto: string, clave: string): string {
  const llave = createHash("sha256").update(clave).digest().subarray(0, 16);
  const cipher = createCipheriv("aes-128-ecb", llave, null);
  return Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]).toString("base64");
}

// Mercantil pide 58 + código de área (3) + número (7): 04141234567 -> 584141234567.
export function telefonoMercantil(telefono: string): string | null {
  const d = telefono.replace(/\D/g, "");
  if (/^58\d{10}$/.test(d)) return d;
  if (/^0\d{10}$/.test(d)) return `58${d.slice(1)}`;
  if (/^\d{10}$/.test(d)) return `58${d}`;
  return null;
}

export async function buscarPagoMovil(datos: {
  referencia: string;
  monto: number;
  telefonoPagador: string;
  fecha: string;
  ip: string;
}): Promise<TransaccionMercantil[]> {
  const m = env.mercantil;
  const cuerpo = {
    merchant_identify: { integratorId: m.integratorId, merchantId: m.merchantId, terminalId: m.terminalId },
    // Sin "mobile" el API falla con 500 (code 99999).
    client_identify: { ipaddress: datos.ip, browser_agent: "pago-movil", mobile: { manufacturer: "Generic" } },
    search_by: {
      amount: datos.monto,
      currency: "ves",
      origin_mobile_number: cifrar(datos.telefonoPagador, m.secretKey),
      destination_mobile_number: cifrar(telefonoMercantil(m.telefono) ?? m.telefono, m.secretKey),
      payment_reference: datos.referencia,
      trx_date: datos.fecha,
    },
  };

  const res = await fetch(URLS[m.ambiente], {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-IBM-Client-Id": m.clientId },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => null)) as {
    transaction_list?: TransaccionMercantil[];
    error_list?: { error_code: string; description: string }[] | { error_code: string; description: string };
  } | null;

  if (res.ok && data?.transaction_list) return data.transaction_list;

  const errores = data?.error_list ? [data.error_list].flat() : [];
  if (errores.some((e) => SIN_RESULTADOS.includes(e.error_code))) return [];
  const detalle = errores.map((e) => `${e.error_code}: ${e.description}`).join("; ") || `HTTP ${res.status}`;
  console.error("Error del API de Mercantil:", detalle);
  throw new ErrorMercantil(detalle);
}
