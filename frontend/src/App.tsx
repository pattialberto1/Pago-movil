import { useCallback, useEffect, useState } from "react";
import {
  api,
  getNombreGuardado,
  getSesion,
  NoAutorizado,
  setSesion,
  type Pago,
  type PagosDelDia,
  type Config,
  type Sesion,
  type Solicitud,
} from "./api";
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
const cuando = (iso: string) => (diaDe(iso) === hoy() ? `hoy a las ${hora(iso)}` : `${diaLargo(iso)}, ${hora(iso)}`);

function Referencia({ valor, resaltar = 6 }: { valor: string; resaltar?: number }) {
  const corte = Math.max(0, valor.length - resaltar);
  return (
    <span className="ref">
      <span className="ref-inicio">{valor.slice(0, corte)}</span>
      <strong>{valor.slice(corte)}</strong>
    </span>
  );
}

function Login({ onEntrar }: { onEntrar: (sesion: Sesion) => void }) {
  const [nombre, setNombre] = useState(getNombreGuardado());
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.login(clave);
      onEntrar({ clave, nombre: nombre.trim() });
    } catch (err) {
      setError(err instanceof NoAutorizado ? "Contraseña incorrecta" : "No se pudo conectar");
    }
  }

  return (
    <form className="login" onSubmit={entrar}>
      <h1>Pago Móvil</h1>
      <input placeholder="Tu nombre o caja" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      <input type="password" placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} required />
      <button type="submit" disabled={!nombre.trim() || !clave}>
        Entrar
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

type Resultado = { ref: string; pagos: Pago[] } | null;

function PedirVerificacion({
  sesion,
  refInicial,
  bancos,
  onSalir,
  onConfirmado,
}: {
  sesion: Sesion;
  refInicial: string;
  bancos: string[];
  onSalir: () => void;
  onConfirmado: (pago: Pago, cobradoPorMi: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [banco, setBanco] = useState(bancos[0] ?? "");
  const [referencia, setReferencia] = useState(refInicial);
  const [monto, setMonto] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!id) return;
    const intervalo = setInterval(async () => {
      try {
        const s = await api.solicitud(sesion.clave, id);
        setSolicitud(s);
        if (s.estado !== "PENDIENTE") clearInterval(intervalo);
        if (s.estado === "CONFIRMADA" && s.pago) onConfirmado(s.pago, s.pago.cobradoPor === s.solicitadoPor);
      } catch (err) {
        if (err instanceof NoAutorizado) onSalir();
      }
    }, 3000);
    return () => clearInterval(intervalo);
  }, [id, sesion.clave, onSalir, onConfirmado]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const r = await api.pedirVerificacion(sesion, { banco, referencia, monto });
      if (r.yaRegistrado) setError("Ese pago ya llegó al sistema. Toca Verificar otra vez.");
      else if (r.id) setId(r.id);
    } catch (err) {
      if (err instanceof NoAutorizado) onSalir();
      else setError(err instanceof Error ? err.message : "Error");
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button className="pedir" onClick={() => setAbierto(true)}>
        Pedir verificación al encargado
      </button>
    );
  }

  if (!id) {
    return (
      <form className="verificacion" onSubmit={enviar}>
        <label>
          Banco
          <select value={banco} onChange={(e) => setBanco(e.target.value)}>
            {bancos.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Referencia completa (del comprobante del cliente)
          <input
            inputMode="numeric"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value.replace(/\D/g, ""))}
            required
          />
        </label>
        <label>
          Monto (Bs)
          <input inputMode="decimal" placeholder="Ej. 12500,00" value={monto} onChange={(e) => setMonto(e.target.value)} required />
        </label>
        <div className="fila">
          <button type="submit" disabled={enviando || referencia.length < 6 || !monto}>
            Enviar al encargado
          </button>
          <button type="button" className="enlace" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </div>
        {referencia.length < 6 && <p className="nota">Escribe la referencia completa, no solo los últimos dígitos.</p>}
        {error && <p className="error">{error}</p>}
      </form>
    );
  }

  if (!solicitud || solicitud.estado === "PENDIENTE") {
    return <div className="verif espera">⏳ Esperando que el encargado revise el banco…</div>;
  }

  if (solicitud.estado === "RECHAZADA") {
    return (
      <div className="verif rechazo">
        ✗ <strong>{solicitud.resueltoPor}</strong> no encontró el pago en el banco. No lo aceptes.
      </div>
    );
  }

  return <div className="verif ok">✓ Pago verificado por {solicitud.resueltoPor}.</div>;
}

function Verificador({ sesion, config, onSalir }: { sesion: Sesion; config: Config | null; onSalir: () => void }) {
  const [ref, setRef] = useState("");
  const [resultado, setResultado] = useState<Resultado>(null);
  const [marcadosAqui, setMarcadosAqui] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const manejarError = (err: unknown) => {
    if (err instanceof NoAutorizado) onSalir();
    else setError(err instanceof Error ? err.message : "Error");
  };

  const confirmado = useCallback((pago: Pago, cobradoPorMi: boolean) => {
    if (cobradoPorMi) setMarcadosAqui((m) => new Set(m).add(pago.id));
    setResultado((r) => r && { ref: r.ref, pagos: [pago] });
  }, []);

  const reemplazar = (pago: Pago) =>
    setResultado((r) => r && { ...r, pagos: r.pagos.map((p) => (p.id === pago.id ? pago : p)) });

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOcupado(true);
    setMarcadosAqui(new Set());
    try {
      setResultado(await api.buscar(sesion.clave, ref));
    } catch (err) {
      manejarError(err);
      setResultado(null);
    } finally {
      setOcupado(false);
    }
  }

  async function cobrar(pago: Pago) {
    setError("");
    setOcupado(true);
    try {
      const { yaCobrado, pago: actualizado } = await api.cobrar(sesion, pago.id);
      if (!yaCobrado) setMarcadosAqui((s) => new Set(s).add(pago.id));
      reemplazar(actualizado);
    } catch (err) {
      manejarError(err);
    } finally {
      setOcupado(false);
    }
  }

  async function deshacer(pago: Pago) {
    setError("");
    setOcupado(true);
    try {
      await api.deshacer(sesion.clave, pago.id);
      setMarcadosAqui((s) => {
        const copia = new Set(s);
        copia.delete(pago.id);
        return copia;
      });
      reemplazar({ ...pago, cobradoAt: null, cobradoPor: null });
    } catch (err) {
      manejarError(err);
    } finally {
      setOcupado(false);
    }
  }

  const disponibles = resultado?.pagos.filter((p) => !p.cobradoAt || marcadosAqui.has(p.id)) ?? [];
  const todosCobrados = !!resultado && resultado.pagos.length > 0 && disponibles.length === 0;

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
          <button type="submit" disabled={ocupado || ref.length < 4}>
            Verificar
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {resultado && resultado.pagos.length === 0 && (
        <div className="resultado no">
          <div className="titulo">✗ NO ENCONTRADO</div>
          <p>
            No hay ningún pago con referencia terminada en <strong>{resultado.ref}</strong> en los últimos 3 días.
          </p>
          <p className="nota">
            Si el cliente acaba de pagar, espera 2 minutos y vuelve a verificar. A veces el banco no envía el
            aviso: si el cliente insiste en que pagó, no lo rechaces sin{" "}
            {config?.verificacionTelegram ? "pedir verificación." : "revisar los movimientos del banco."}
          </p>
          {config?.verificacionTelegram && (
            <PedirVerificacion
              key={resultado.ref}
              sesion={sesion}
              refInicial={resultado.ref}
              bancos={config.bancos}
              onSalir={onSalir}
              onConfirmado={confirmado}
            />
          )}
        </div>
      )}

      {resultado && resultado.pagos.length > 0 && (
        <div className={`resultado ${todosCobrados ? "no" : "si"}`}>
          <div className="titulo">{todosCobrados ? "⚠ YA FUE COBRADO" : "✓ PAGO RECIBIDO"}</div>
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
                <strong>{p.banco}</strong> · {diaLargo(p.fechaPago)}, {hora(p.fechaPago)}
              </div>
              <div>
                Ref. <Referencia valor={p.referencia} resaltar={resultado.ref.length} />
              </div>
              {p.telefonoPagador && <div>Tel. {p.telefonoPagador}</div>}
              {p.verificadoPor && <div className="nota">Verificado manualmente por {p.verificadoPor}</div>}

              {!p.cobradoAt && (
                <button className="cobrar" onClick={() => cobrar(p)} disabled={ocupado}>
                  Marcar como cobrado
                </button>
              )}
              {p.cobradoAt && marcadosAqui.has(p.id) && (
                <div className="cobrado-aqui">
                  ✓ Marcado como cobrado
                  <button className="enlace" onClick={() => deshacer(p)} disabled={ocupado}>
                    Deshacer
                  </button>
                </div>
              )}
              {p.cobradoAt && !marcadosAqui.has(p.id) && (
                <div className="ya-cobrado">
                  Ya lo cobró <strong>{p.cobradoPor}</strong> {cuando(p.cobradoAt)}
                </div>
              )}
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
  const cobrados = datos?.pagos.filter((p) => p.cobradoAt).length ?? 0;
  const porBanco = new Map<string, number>();
  for (const p of datos?.pagos ?? []) porBanco.set(p.banco, (porBanco.get(p.banco) ?? 0) + Number(p.monto));

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
              {datos.cantidad} pagos · {cobrados} cobrados · Bs {bs.format(datos.total)}
            </p>
          )}
          {porBanco.size > 1 && (
            <p className="resumen">
              {[...porBanco].map(([banco, total]) => `${banco}: Bs ${bs.format(total)}`).join(" · ")}
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
              <th className="tel">Cobrado por</th>
            </tr>
          </thead>
          <tbody>
            {datos.pagos.map((p) => (
              <tr key={p.id} className={p.cobradoAt ? "fila-cobrada" : undefined}>
                <td>
                  {p.cobradoAt && <span className="check">✓ </span>}
                  {hora(p.fechaPago)}
                </td>
                <td>
                  <Referencia valor={p.referencia} />
                  <div className="banco">{p.banco}</div>
                </td>
                <td className="num">{bs.format(Number(p.monto))}</td>
                <td className="tel">{p.cobradoPor ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function App() {
  const [sesion, setSesionState] = useState<Sesion | null>(getSesion());
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    if (!sesion) return;
    api.config(sesion.clave).then(setConfig).catch(() => setConfig(null));
  }, [sesion]);

  const entrar = (s: Sesion) => {
    setSesion(s);
    setSesionState(s);
  };
  const salir = useCallback(() => {
    setSesion(null);
    setSesionState(null);
  }, []);

  if (!sesion) return <Login onEntrar={entrar} />;

  return (
    <div className="app">
      <header>
        <h1>Pago Móvil</h1>
        <div className="usuario">
          {sesion.nombre}
          <button className="salir" onClick={salir}>
            Salir
          </button>
        </div>
      </header>
      <Verificador sesion={sesion} config={config} onSalir={salir} />
      <ListaDelDia clave={sesion.clave} onSalir={salir} />
    </div>
  );
}
