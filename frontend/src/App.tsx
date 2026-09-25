import { useCallback, useEffect, useState } from "react";
import { api, getClave, NoAutorizado, setClave, type Pago, type PagosDelDia } from "./api";
import "./App.css";

const TZ = "America/Caracas";
const bs = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-VE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const diaLargo = (iso: string) => {
  const texto = new Date(iso).toLocaleDateString("es-VE", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

function Referencia({ valor, resaltar = 6 }: { valor: string; resaltar?: number }) {
  const corte = Math.max(0, valor.length - resaltar);
  return (
    <span className="ref">
      <span className="ref-inicio">{valor.slice(0, corte)}</span>
      <strong>{valor.slice(corte)}</strong>
    </span>
  );
}

function Login({ onEntrar }: { onEntrar: (clave: string) => void }) {
  const [clave, setValor] = useState("");
  const [error, setError] = useState("");

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.login(clave);
      onEntrar(clave);
    } catch (err) {
      setError(err instanceof NoAutorizado ? "Contraseña incorrecta" : "No se pudo conectar");
    }
  }

  return (
    <form className="login" onSubmit={entrar}>
      <h1>Pago Móvil</h1>
      <input
        type="password"
        placeholder="Contraseña"
        value={clave}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
      />
      <button type="submit">Entrar</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

type Resultado = { ref: string; pagos: Pago[] } | null;

function Verificador({ clave, onSalir }: { clave: string; onSalir: () => void }) {
  const [ref, setRef] = useState("");
  const [resultado, setResultado] = useState<Resultado>(null);
  const [error, setError] = useState("");
  const [buscando, setBuscando] = useState(false);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBuscando(true);
    try {
      setResultado(await api.buscar(clave, ref));
    } catch (err) {
      if (err instanceof NoAutorizado) onSalir();
      else setError(err instanceof Error ? err.message : "Error");
      setResultado(null);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="verificador">
      <form onSubmit={verificar}>
        <label htmlFor="ref">Últimos dígitos de la referencia</label>
        <div className="fila">
          <input
            id="ref"
            inputMode="numeric"
            placeholder="Ej. 878883"
            value={ref}
            onChange={(e) => {
              setRef(e.target.value.replace(/\D/g, ""));
              setResultado(null);
            }}
            autoFocus
          />
          <button type="submit" disabled={buscando || ref.length < 4}>
            Verificar
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {resultado && resultado.pagos.length === 0 && (
        <div className="resultado no">
          <div className="titulo">✗ NO ENCONTRADO</div>
          <p>No hay ningún pago con referencia terminada en <strong>{resultado.ref}</strong> en los últimos 3 días.</p>
          <p className="nota">Si el cliente acaba de pagar, espera 2 minutos y vuelve a verificar.</p>
        </div>
      )}

      {resultado && resultado.pagos.length > 0 && (
        <div className="resultado si">
          <div className="titulo">✓ PAGO RECIBIDO</div>
          {resultado.pagos.length > 1 && (
            <p className="nota">
              Hay {resultado.pagos.length} pagos que terminan en {resultado.ref}. Confirma el monto con el cliente.
            </p>
          )}
          {resultado.pagos.map((p) => (
            <div key={p.id} className="detalle">
              {diaDe(p.fechaPago) !== hoy() && <div className="aviso">⚠ Este pago NO es de hoy</div>}
              <div className="monto">Bs {bs.format(Number(p.monto))}</div>
              <div>
                {diaLargo(p.fechaPago)}, {hora(p.fechaPago)}
              </div>
              <div>
                Ref. <Referencia valor={p.referencia} resaltar={resultado.ref.length} />
              </div>
              {p.telefonoPagador && <div>Tel. {p.telefonoPagador}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ListaDelDia({ clave, onSalir }: { clave: string; onSalir: () => void }) {
  const [fecha, setFecha] = useState(hoy());
  const [datos, setDatos] = useState<PagosDelDia | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.pagosDelDia(clave, fecha));
    } catch (err) {
      if (err instanceof NoAutorizado) onSalir();
    }
  }, [clave, fecha, onSalir]);

  useEffect(() => {
    cargar();
    if (fecha !== hoy()) return;
    const intervalo = setInterval(cargar, 30_000);
    return () => clearInterval(intervalo);
  }, [cargar, fecha]);

  const esHoy = fecha === hoy();

  return (
    <section className="dia">
      <div className="dia-cabecera">
        <div>
          <h2>
            {esHoy ? "Hoy · " : ""}
            {diaLargo(`${fecha}T12:00:00-04:00`)}
          </h2>
          {datos && (
            <p className="resumen">
              {datos.cantidad} pagos · Bs {bs.format(datos.total)}
            </p>
          )}
        </div>
        <input type="date" value={fecha} max={hoy()} onChange={(e) => e.target.value && setFecha(e.target.value)} />
      </div>

      {datos && datos.pagos.length === 0 && <p className="vacio">No hay pagos este día.</p>}

      {datos && datos.pagos.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Referencia</th>
              <th className="num">Monto (Bs)</th>
              <th className="tel">Teléfono</th>
            </tr>
          </thead>
          <tbody>
            {datos.pagos.map((p) => (
              <tr key={p.id}>
                <td>{hora(p.fechaPago)}</td>
                <td>
                  <Referencia valor={p.referencia} />
                </td>
                <td className="num">{bs.format(Number(p.monto))}</td>
                <td className="tel">{p.telefonoPagador ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function App() {
  const [clave, setClaveState] = useState<string | null>(getClave());

  const entrar = (c: string) => {
    setClave(c);
    setClaveState(c);
  };
  const salir = useCallback(() => {
    setClave(null);
    setClaveState(null);
  }, []);

  if (!clave) return <Login onEntrar={entrar} />;

  return (
    <div className="app">
      <header>
        <h1>Pago Móvil</h1>
        <button className="salir" onClick={salir}>
          Salir
        </button>
      </header>
      <Verificador clave={clave} onSalir={salir} />
      <ListaDelDia clave={clave} onSalir={salir} />
    </div>
  );
}
