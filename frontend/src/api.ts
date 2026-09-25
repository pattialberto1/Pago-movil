const API_URL = import.meta.env.VITE_API_URL ?? "";
const CLAVE_KEY = "pm_clave";
const NOMBRE_KEY = "pm_nombre";

export interface Pago {
  id: string;
  banco: string;
  monto: string;
  referencia: string;
  telefonoPagador: string | null;
  fechaPago: string;
  cobradoAt: string | null;
  cobradoPor: string | null;
  verificadoPor: string | null;
}

export interface PagosDelDia {
  fecha: string;
  cantidad: number;
  total: number;
  pagos: Pago[];
}

export interface Sesion {
  clave: string;
  nombre: string;
}

export interface Config {
  verificacionTelegram: boolean;
  bancos: string[];
}

export interface Solicitud {
  id: string;
  estado: "PENDIENTE" | "CONFIRMADA" | "RECHAZADA";
  resueltoPor: string | null;
  solicitadoPor: string;
  pago: Pago | null;
}

export class NoAutorizado extends Error {}

export function getSesion(): Sesion | null {
  try {
    const clave = localStorage.getItem(CLAVE_KEY);
    const nombre = localStorage.getItem(NOMBRE_KEY);
    return clave && nombre ? { clave, nombre } : null;
  } catch {
    return null;
  }
}

export function setSesion(sesion: Sesion | null) {
  try {
    if (sesion) {
      localStorage.setItem(CLAVE_KEY, sesion.clave);
      localStorage.setItem(NOMBRE_KEY, sesion.nombre);
    } else {
      localStorage.removeItem(CLAVE_KEY);
    }
  } catch {
    // Sin almacenamiento: habrá que entrar de nuevo al recargar.
  }
}

export function getNombreGuardado(): string {
  try {
    return localStorage.getItem(NOMBRE_KEY) ?? "";
  } catch {
    return "";
  }
}

async function request<T>(path: string, clave: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
  });
  if (res.status === 401) throw new NoAutorizado();
  const data = await res.json();
  if (!res.ok && res.status !== 409) throw new Error(data.error ?? `Error ${res.status}`);
  return { status: res.status, data };
}

export const api = {
  login: (clave: string) => request<{ ok: true }>("/api/login", clave),
  pagosDelDia: async (clave: string, fecha: string) =>
    (await request<PagosDelDia>(`/api/pagos?fecha=${fecha}`, clave)).data,
  buscar: async (clave: string, ref: string) =>
    (await request<{ ref: string; pagos: Pago[] }>(`/api/pagos/buscar?ref=${encodeURIComponent(ref)}`, clave)).data,
  // 200: lo marcó esta cajera. 409: ya estaba cobrado (el pago trae quién y cuándo).
  cobrar: async (sesion: Sesion, id: string) => {
    const { status, data } = await request<Pago>(`/api/pagos/${id}/cobrar`, sesion.clave, {
      method: "POST",
      body: JSON.stringify({ cobradoPor: sesion.nombre }),
    });
    return { yaCobrado: status === 409, pago: data };
  },
  config: async (clave: string) => (await request<Config>("/api/config", clave)).data,
  // 409: el pago ya estaba registrado (llegó el aviso del banco mientras tanto).
  pedirVerificacion: async (sesion: Sesion, datos: { banco: string; referencia: string; monto: string }) => {
    const { status, data } = await request<{ id?: string; error?: string }>("/api/verificaciones", sesion.clave, {
      method: "POST",
      body: JSON.stringify({ ...datos, solicitadoPor: sesion.nombre }),
    });
    return { yaRegistrado: status === 409, id: data.id, error: data.error };
  },
  solicitud: async (clave: string, id: string) =>
    (await request<Solicitud>(`/api/verificaciones/${id}`, clave)).data,
  deshacer: async (clave: string, id: string) => {
    const { status, data } = await request<{ ok?: true; error?: string }>(`/api/pagos/${id}/deshacer`, clave, {
      method: "POST",
    });
    if (status === 409) throw new Error(data.error);
  },
};
