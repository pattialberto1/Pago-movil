const API_URL = import.meta.env.VITE_API_URL ?? "";
const CLAVE_KEY = "pm_clave";

export interface Pago {
  id: string;
  monto: string;
  referencia: string;
  telefonoPagador: string | null;
  fechaPago: string;
}

export interface PagosDelDia {
  fecha: string;
  cantidad: number;
  total: number;
  pagos: Pago[];
}

export class NoAutorizado extends Error {}

export function getClave(): string | null {
  try {
    return localStorage.getItem(CLAVE_KEY);
  } catch {
    return null;
  }
}

export function setClave(clave: string | null) {
  try {
    if (clave) localStorage.setItem(CLAVE_KEY, clave);
    else localStorage.removeItem(CLAVE_KEY);
  } catch {
    // Sin almacenamiento: habrá que escribir la contraseña de nuevo al recargar.
  }
}

async function request<T>(path: string, clave: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${clave}` },
  });
  if (res.status === 401) throw new NoAutorizado();
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

export const api = {
  login: (clave: string) => request<{ ok: true }>("/api/login", clave),
  pagosDelDia: (clave: string, fecha: string) =>
    request<PagosDelDia>(`/api/pagos?fecha=${fecha}`, clave),
  buscar: (clave: string, ref: string) =>
    request<{ ref: string; pagos: Pago[] }>(`/api/pagos/buscar?ref=${encodeURIComponent(ref)}`, clave),
};
