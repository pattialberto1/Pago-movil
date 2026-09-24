import { useEffect, useState } from "react";
import { api, type Pago, type Pedido } from "./api";
import "./App.css";

function EstadoBadge({ estado }: { estado: string }) {
  return <span className={`badge badge-${estado.toLowerCase()}`}>{estado}</span>;
}

function NuevoPedidoForm({ onCreado }: { onCreado: () => void }) {
  const [descripcion, setDescripcion] = useState("");
  const [montoEsperado, setMontoEsperado] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.crearPedido({
        descripcion,
        montoEsperado,
        clienteNombre: clienteNombre || null,
        clienteTelefono: clienteTelefono || null,
      });
      setDescripcion("");
      setMontoEsperado("");
      setClienteNombre("");
      setClienteTelefono("");
      onCreado();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-pedido">
      <input placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
      <input placeholder="Monto esperado" type="number" step="0.01" value={montoEsperado} onChange={(e) => setMontoEsperado(e.target.value)} required />
      <input placeholder="Cliente (opcional)" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
      <input placeholder="Teléfono cliente (opcional)" value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} />
      <button type="submit" disabled={enviando}>Agregar pedido</button>
    </form>
  );
}

export default function App() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargarTodo() {
    setCargando(true);
    try {
      const [p, ped] = await Promise.all([api.listarPagos(), api.listarPedidos()]);
      setPagos(p);
      setPedidos(ped);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  async function buscar() {
    setCargando(true);
    try {
      const p = await api.listarPagos(busqueda ? { referencia: busqueda } : {});
      setPagos(p);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="app">
      <h1>Verificación de Pago Móvil</h1>

      <section>
        <h2>Pedidos pendientes</h2>
        <NuevoPedidoForm onCreado={cargarTodo} />
        <table>
          <thead>
            <tr><th>Descripción</th><th>Monto</th><th>Cliente</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td>{p.descripcion}</td>
                <td>{p.montoEsperado}</td>
                <td>{p.clienteNombre ?? "-"}</td>
                <td><EstadoBadge estado={p.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Pagos recibidos</h2>
        <div className="buscador">
          <input
            placeholder="Buscar por referencia..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <button onClick={buscar} disabled={cargando}>Buscar</button>
        </div>
        <table>
          <thead>
            <tr><th>Fecha</th><th>Banco</th><th>Monto</th><th>Referencia</th><th>Teléfono</th><th>Conciliación</th></tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.fechaPago).toLocaleString()}</td>
                <td>{p.banco}</td>
                <td>{p.monto}</td>
                <td>{p.referencia ?? "-"}</td>
                <td>{p.telefono ?? "-"}</td>
                <td>{p.conciliacion ? <EstadoBadge estado={p.conciliacion.estado} /> : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
