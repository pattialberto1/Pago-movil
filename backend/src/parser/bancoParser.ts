export interface PagoParseado {
  banco: string;
  monto: number;
  referencia: string;
  telefonoPagador: string | null;
  telefonoReceptor: string | null;
  fechaPago: Date;
}

/**
 * Parser específico para las notificaciones de "pago móvil" de Bancaribe
 * (remitente: conexionmipago@bancaribe.com.ve). Formato real observado:
 *
 *   Bancaribe se complace en informarle que el 01-01-2026 a las 12:00:00,
 *   recibió un pago móvil con los siguientes datos:
 *
 *   Monto: 1234,56 Bolívares
 *   Teléfono pagador: 04140000000
 *   Teléfono receptor: 04240000000
 *   Referencia: 000000000000
 */
const FECHA_RE = /el\s+(\d{2})-(\d{2})-(\d{4})\s+a las\s+(\d{2}):(\d{2}):(\d{2})/i;
const MONTO_RE = /Monto:\s*([\d.,]+)\s*Bol[ií]vares/i;
const TELEFONO_PAGADOR_RE = /Tel[eé]fono pagador:\s*(\d+)/i;
const TELEFONO_RECEPTOR_RE = /Tel[eé]fono receptor:\s*(\d+)/i;
const REFERENCIA_RE = /Referencia:\s*(\d+)/i;

function parseMontoVenezolano(raw: string): number {
  // "11.954,00" o "11954,00" -> 11954.00
  const normalizado = raw.replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(normalizado);
}

export function parseCorreoPagoMovilBancaribe(
  texto: string,
  fechaCorreo: Date
): PagoParseado | null {
  const montoMatch = texto.match(MONTO_RE);
  const referenciaMatch = texto.match(REFERENCIA_RE);
  if (!montoMatch || !referenciaMatch) return null;

  const telefonoPagadorMatch = texto.match(TELEFONO_PAGADOR_RE);
  const telefonoReceptorMatch = texto.match(TELEFONO_RECEPTOR_RE);
  const fechaMatch = texto.match(FECHA_RE);

  let fechaPago = fechaCorreo;
  if (fechaMatch) {
    const [, dd, mm, yyyy, hh, min, ss] = fechaMatch;
    // Hora de Venezuela (UTC-4, sin horario de verano); el servidor puede estar en UTC.
    fechaPago = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-04:00`);
  }

  return {
    banco: "Bancaribe",
    monto: parseMontoVenezolano(montoMatch[1]),
    referencia: referenciaMatch[1],
    telefonoPagador: telefonoPagadorMatch?.[1] ?? null,
    telefonoReceptor: telefonoReceptorMatch?.[1] ?? null,
    fechaPago,
  };
}
