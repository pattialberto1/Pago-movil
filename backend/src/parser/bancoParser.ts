export interface PagoParseado {
  banco: string;
  monto: number;
  referencia: string | null;
  telefono: string | null;
  cedula: string | null;
  fechaPago: Date;
}

/**
 * PLACEHOLDER — ajustar en cuanto tengamos ejemplos reales del correo del banco.
 *
 * Los patrones de abajo son genéricos (formatos típicos de notificación de pago
 * móvil en Venezuela: "Monto: Bs. 1.234,56", "Referencia: 000123456",
 * "Telf: 0412-1234567"). Reemplazar por los patrones exactos del correo real.
 */
const MONTO_RE = /(?:monto|bs\.?)\s*[:\s]\s*([\d.,]+)/i;
const REFERENCIA_RE = /referencia\s*[:\s]\s*(\d+)/i;
const TELEFONO_RE = /(?:tel[eé]fono|telf|celular)\s*[:\s]\s*(\+?\d[\d-]{6,})/i;
const CEDULA_RE = /(?:c[eé]dula|documento)\s*[:\s]\s*([VEJve]-?\d{6,9})/i;

function parseMontoVenezolano(raw: string): number {
  // "1.234,56" -> 1234.56
  const normalizado = raw.replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(normalizado);
}

export function parseCorreoPagoMovil(textoPlano: string, fechaCorreo: Date): PagoParseado | null {
  const montoMatch = textoPlano.match(MONTO_RE);
  if (!montoMatch) return null;

  const referenciaMatch = textoPlano.match(REFERENCIA_RE);
  const telefonoMatch = textoPlano.match(TELEFONO_RE);
  const cedulaMatch = textoPlano.match(CEDULA_RE);

  return {
    banco: "PENDIENTE_DEFINIR",
    monto: parseMontoVenezolano(montoMatch[1]),
    referencia: referenciaMatch?.[1] ?? null,
    telefono: telefonoMatch?.[1]?.replace(/-/g, "") ?? null,
    cedula: cedulaMatch?.[1]?.toUpperCase() ?? null,
    fechaPago: fechaCorreo,
  };
}
