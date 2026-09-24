const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface Pago {
  id: string;
  banco: string;
  monto: string;
  referencia: string | null;
  telefono: string | null;
  fechaPago: string;
  conciliacion: { estado: string; pedido: Pedido | null } | null;
}

export interface Pedido {
  id: string;
  descripcion: string;
  montoEsperado: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  estado: string;
  createdAt: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`Error en ${path}: ${res.status}`);
  return res.json();
}

export const api = {
  listarPagos: (params: Record<string, string> = {}) =>
    request<Pago[]>(`/api/pagos?${new URLSearchParams(params)}`),
  listarPedidos: () => request<Pedido[]>("/api/pedidos"),
  crearPedido: (data: Omit<Pedido, "id" | "estado" | "createdAt">) =>
    request<Pedido>("/api/pedidos", { method: "POST", body: JSON.stringify(data) }),
  confirmarConciliacion: (conciliacionId: string, pedidoId: string, revisadoPor?: string) =>
    request(`/api/conciliaciones/${conciliacionId}/confirmar`, {
      method: "POST",
      body: JSON.stringify({ pedidoId, revisadoPor }),
    }),
};
