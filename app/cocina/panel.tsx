"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, ClipboardList, Clock, Search, Send, TriangleAlert, UserRound, X } from "lucide-react";
import { anularEnvio, crearEnvio } from "@/app/actions/envios";
import { avisar, Inicial } from "@/components/ui";
import { ALTO_NAVEGACION, NavegacionInferior, type ItemNavegacion } from "@/components/navegacion-inferior";
import { BarraSuperiorMovil, PerfilMovil } from "@/components/movil";
import { fechaLarga, horaLima, normalizar } from "@/lib/format";

type Producto = { id: number; colegioId: number; nombre: string; categoria: string };
type EnvioHoy = {
  id: number;
  colegioId: number;
  producto: string;
  enviada: number;
  recibida: number | null;
  estado: "PENDIENTE" | "CONFORME" | "OBSERVADO" | "ANULADO";
  motivo: string | null;
  hora: string;
  recibidoPor: string | null;
};

type Seccion = "enviar" | "enviados" | "perfil";

export function PanelCocina({
  hoy,
  esCocina,
  colegios,
  productos,
  envios,
}: {
  hoy: string;
  esCocina: boolean;
  colegios: { id: number; nombre: string }[];
  productos: Producto[];
  envios: EnvioHoy[];
}) {
  const [colegioId, setColegioId] = useState(colegios[0]?.id ?? 0);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [busqueda, setBusqueda] = useState("");
  const [enviando, iniciar] = useTransition();
  const [anulando, setAnulando] = useState<number | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("enviar");
  const lista = useRef<HTMLUListElement>(null);

  // Borrador: lo escrito se guarda en el celular hasta que se envía
  const claveBorrador = `lf_cocina_borrador_${hoy}`;
  const cargado = useRef(false);
  useEffect(() => {
    try {
      // Los borradores de días anteriores ya no sirven
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("lf_cocina_borrador_") && k !== claveBorrador) localStorage.removeItem(k);
      }
      const guardado = localStorage.getItem(claveBorrador);
      // Se restaura después de hidratar para que el HTML del servidor coincida
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (guardado) setCantidades(JSON.parse(guardado));
    } catch {}
    cargado.current = true;
  }, [claveBorrador]);
  useEffect(() => {
    if (!cargado.current) return;
    try {
      const conValor = Object.fromEntries(Object.entries(cantidades).filter(([, v]) => v.trim() !== ""));
      if (Object.keys(conValor).length) localStorage.setItem(claveBorrador, JSON.stringify(conValor));
      else localStorage.removeItem(claveBorrador);
    } catch {}
  }, [cantidades, claveBorrador]);

  const colegio = colegios.find((c) => c.id === colegioId);
  const delColegio = useMemo(() => {
    const q = normalizar(busqueda);
    return productos.filter((p) => p.colegioId === colegioId && (!q || normalizar(p.nombre).includes(q)));
  }, [productos, colegioId, busqueda]);

  const n = (v: string | undefined) => (v === undefined || v.trim() === "" ? 0 : Number(v));
  const lineas = productos
    .filter((p) => p.colegioId === colegioId && n(cantidades[p.id]) > 0)
    .map((p) => ({ productoColegioId: p.id, cantidad: n(cantidades[p.id]), nombre: p.nombre }));
  const total = lineas.reduce((a, l) => a + l.cantidad, 0);
  const invalido = lineas.some((l) => !Number.isInteger(l.cantidad));

  const cambiar = (id: number, valor: string) => setCantidades((c) => ({ ...c, [id]: valor }));
  const escritosEn = (cId: number) => productos.filter((p) => p.colegioId === cId && n(cantidades[p.id]) > 0).length;

  // "Siguiente" del teclado del celular pasa al próximo producto
  function siguiente(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const campos = [...(lista.current?.querySelectorAll<HTMLInputElement>("input") ?? [])];
    const prox = campos[campos.indexOf(e.currentTarget) + 1];
    if (prox) prox.focus();
    else e.currentTarget.blur();
  }

  function enviar() {
    if (lineas.length === 0 || invalido) return;
    iniciar(async () => {
      const r = await crearEnvio(
        colegioId,
        lineas.map(({ productoColegioId, cantidad }) => ({ productoColegioId, cantidad })),
      );
      if (r.ok) {
        avisar(r.mensaje ?? "Envío registrado");
        setCantidades((c) => {
          const resto = { ...c };
          for (const l of lineas) delete resto[l.productoColegioId];
          return resto;
        });
      } else avisar(r.error, "error");
    });
  }

  async function anular(id: number) {
    setAnulando(id);
    const r = await anularEnvio(id);
    setAnulando(null);
    if (r.ok) avisar(r.mensaje ?? "Anulado");
    else avisar(r.error, "error");
  }

  const porRecibir = envios.filter((e) => e.estado === "PENDIENTE").length;
  const observados = envios.filter((e) => e.estado === "OBSERVADO").length;
  const menu: ItemNavegacion<Seccion>[] = [
    { id: "enviar", texto: "Enviar", icono: Send },
    {
      id: "enviados",
      texto: "Enviados hoy",
      icono: ClipboardList,
      marca: observados > 0 ? String(observados) : porRecibir > 0 ? String(porRecibir) : null,
      alerta: observados > 0,
    },
    { id: "perfil", texto: "Perfil", icono: UserRound },
  ];
  const titulos: Record<Seccion, string> = { enviar: "Enviar a colegio", enviados: "Enviados hoy", perfil: "Perfil" };

  return (
    <div
      className="min-h-screen bg-fondo"
      style={{ paddingBottom: `calc(${seccion === "enviar" ? "10rem" : "5.5rem"} + env(safe-area-inset-bottom))` }}
    >

      <main className="mx-auto max-w-3xl px-4">
        <div className="sticky top-0 z-20 -mx-4 bg-fondo/95 px-4 backdrop-blur">
          <BarraSuperiorMovil titulo={titulos[seccion]} volverAlPanel={!esCocina} />
        </div>

        {seccion === "enviar" && (
          <>
            {/* Colegio destino */}
            <p className="mt-1 mb-2 text-sm font-medium">¿A qué colegio envías?</p>
            <div className="grid grid-cols-2 gap-2">
              {colegios.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColegioId(c.id)}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                    c.id === colegioId ? "border-panel bg-panel text-white" : "border-borde bg-white text-suave"
                  }`}
                >
                  {c.nombre}
                  {c.id !== colegioId && escritosEn(c.id) > 0 && (
                    <span className="ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-verde px-1.5 align-middle text-xs text-white" title="Productos escritos sin enviar">{escritosEn(c.id)}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto..."
                className="input py-3 pl-10 text-base"
              />
            </div>

            {/* Productos del día con su cantidad */}
            <ul ref={lista} className="mt-3 space-y-2">
              {delColegio.map((p, i) => {
                const v = cantidades[p.id] ?? "";
                const marcado = n(v) > 0;
                return (
                  <li
                    key={p.id}
                    className={`card flex items-center justify-between gap-3 p-3 ${marcado ? "border-verde shadow-[0_0_0_3px] shadow-verde/15" : ""}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Inicial nombre={p.nombre} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.nombre}</p>
                        <p className="text-xs text-suave">{p.categoria}</p>
                      </div>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={v}
                      placeholder="0"
                      onChange={(e) => cambiar(p.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={siguiente}
                      enterKeyHint={i === delColegio.length - 1 ? "done" : "next"}
                      className="input h-11 w-24 shrink-0 text-center text-lg font-semibold"
                      aria-label={`Cantidad de ${p.nombre}`}
                    />
                  </li>
                );
              })}
            </ul>
            {delColegio.length === 0 && (
              <p className="py-10 text-center text-sm text-suave">
                {busqueda ? `No hay productos con "${busqueda}".` : "Este colegio no tiene productos del día."}
              </p>
            )}
          </>
        )}

        {/* Lo enviado hoy y su estado */}
        {seccion === "enviados" && (
          <section className="pt-1">
            {envios.length === 0 ? (
              <p className="card p-5 text-center text-sm text-suave">Todavía no se envió nada hoy.</p>
            ) : (
              <div className="space-y-4">
                {colegios
                  .filter((c) => envios.some((e) => e.colegioId === c.id))
                  .map((c) => (
                    <div key={c.id} className="card overflow-hidden">
                      <p className="border-b border-borde bg-[#fafbfa] px-4 py-2.5 text-sm font-semibold">{c.nombre}</p>
                      <ul className="divide-y divide-borde">
                        {envios
                          .filter((e) => e.colegioId === c.id)
                          .map((e) => (
                            <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <p className="font-medium">
                                  {e.producto} <span className="text-suave">× {e.enviada}</span>
                                </p>
                                <p className="text-xs text-suave">Enviado {horaLima(e.hora)}</p>
                                {e.estado === "OBSERVADO" && (
                                  <p className="mt-1 text-xs text-[#8a5a00]">
                                    Llegaron {e.recibida} de {e.enviada} · {e.motivo}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                {e.estado === "PENDIENTE" && (
                                  <>
                                    <span className="chip bg-fondo text-suave">
                                      <Clock className="h-3 w-3" /> Por recibir
                                    </span>
                                    <button
                                      onClick={() => anular(e.id)}
                                      disabled={anulando === e.id}
                                      className="flex items-center gap-1 text-xs text-rojo hover:underline"
                                    >
                                      <X className="h-3 w-3" /> {anulando === e.id ? "Anulando..." : "Anular"}
                                    </button>
                                  </>
                                )}
                                {e.estado === "CONFORME" && (
                                  <span className="chip bg-verde-50 text-verde-700">
                                    <CheckCircle2 className="h-3 w-3" /> Recibido
                                  </span>
                                )}
                                {e.estado === "OBSERVADO" && (
                                  <span className="chip bg-ambar-50 text-[#8a5a00]">
                                    <TriangleAlert className="h-3 w-3" /> Con observación
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {/* Cuenta y cerrar sesión */}
        {seccion === "perfil" && (
          <PerfilMovil
            fecha={fechaLarga(hoy)}
            volverAlPanel={!esCocina}
          />
        )}
      </main>

      {/* Botón de envío fijo abajo, siempre a mano */}
      {seccion === "enviar" && (
        <div className="fixed inset-x-0 z-20 border-t border-borde bg-white/95 backdrop-blur" style={{ bottom: ALTO_NAVEGACION }}>
          <div className="mx-auto max-w-3xl px-4 py-3">
            {lineas.length > 0 && (
              <p className="mb-2 truncate text-center text-xs text-suave">
                Para <b className="text-tinta">{colegio?.nombre}</b> · {lineas.length} producto{lineas.length === 1 ? "" : "s"}
              </p>
            )}
            <button
              onClick={enviar}
              disabled={enviando || lineas.length === 0 || invalido}
              className="btn-primario h-12 w-full text-base disabled:bg-borde disabled:text-suave disabled:opacity-100"
            >
              <Send className="h-4 w-4" />
              {enviando
                ? "Enviando..."
                : invalido
                  ? "Solo números enteros"
                  : lineas.length > 0
                    ? `Enviar ${total} unidad${total === 1 ? "" : "es"}`
                    : "Escribe las cantidades para enviar"}
            </button>
          </div>
        </div>
      )}

      <NavegacionInferior items={menu} activo={seccion} cambiar={setSeccion} />
    </div>
  );
}
