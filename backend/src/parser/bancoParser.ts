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

// Bancaribe escribe "11954,00" y Banesco "6846.0": el último separador seguido
// de 1-2 dígitos es el decimal; cualquier otro separador es de miles.
export function parseMonto(raw: string): number {
  const limpio = raw.replace(/[.,]$/, "");
  const decimal = limpio.match(/[.,](\d{1,2})$/);
  const entero = (decimal ? limpio.slice(0, -decimal[0].length) : limpio).replace(/[.,]/g, "");
  return Number.parseFloat(decimal ? `${entero}.${decimal[1]}` : entero);
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
    monto: parseMonto(montoMatch[1]),
    referencia: referenciaMatch[1],
    telefonoPagador: telefonoPagadorMatch?.[1] ?? null,
    telefonoReceptor: telefonoReceptorMatch?.[1] ?? null,
    fechaPago,
  };
}

/**
 * Notificación push de la app de Banesco (reenviada desde un Android). Formato:
 *
 *   Has recibido un Pago Movil
 *   BANESCO REGISTRO: Pago recibido a traves de Pago Movil por Bs. 1234.0 el
 *   01/01/2026; 12:00 REF 000000000000. Para mas inf. llama +580000000000.
 *
 * Cuando el pago viene de otro banco agrega el nombre: "...Pago Movil de NOMBRE por Bs...".
 * No incluye el teléfono de quien paga.
 */
const BANESCO_RE =
  /Pago recibido a trav[eé]s de Pago M[oó]vil(?:\s+de\s+.+?)?\s+por Bs\.?\s*([\d.,]+)\s+el\s+(\d{2})\/(\d{2})\/(\d{4});?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s+REF\.?\s*(\d+)/i;

export function parseNotificacionBanesco(texto: string): PagoParseado | null {
  const m = texto.replace(/\s+/g, " ").match(BANESCO_RE);
  if (!m) return null;

  const [, monto, dd, mm, yyyy, hh, min, ss = "00", referencia] = m;
  return {
    banco: "Banesco",
    monto: parseMonto(monto),
    referencia,
    telefonoPagador: null,
    telefonoReceptor: null,
    fechaPago: new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${min}:${ss}-04:00`),
  };
}
