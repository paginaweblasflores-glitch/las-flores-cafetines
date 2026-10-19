"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, ClipboardList, Clock, Pencil, Search, Send, TriangleAlert, UserRound } from "lucide-react";
import { crearEnvio, editarEnvio } from "@/app/actions/envios";
import { avisar, Inicial, Modal } from "@/components/ui";
import { bajoDeBarra, NavegacionInferior, useTecladoAbierto, type ItemNavegacion } from "@/components/navegacion-inferior";
import { BarraSuperiorMovil, PerfilMovil } from "@/components/movil";
import { enBaldes, fechaLarga, horaLima, normalizar } from "@/lib/format";

type Producto = {
  id: number;
  colegioId: number;
  nombre: string;
  categoria: string;
  /** Si viene en balde: cuántos vasos rinde cada uno (la cocina escribe baldes) */
  vasosPorBalde: number | null;
};
type EnvioHoy = {
  id: number;
  colegioId: number;
  /** Producto en ese colegio: cada uno se envía una vez al día */
  productoColegioId: number;
  producto: string;
  enviada: number;
  recibida: number | null;
  estado: "PENDIENTE" | "CONFORME" | "OBSERVADO" | "ANULADO";
  motivo: string | null;
  hora: string;
  recibidoPor: string | null;
};

type Seccion = "enviar" | "enviados" | "perfil";

/** Solo números enteros: se quita el "-" y cualquier otro signo */
const soloDigitos = (v: string) => v.replace(/\D/g, "");
/** Baldes: se permite medio o un cuarto (1.5, 0.25); coma o punto */
const soloBaldes = (v: string) => {
  const limpio = v.replace(",", ".").replace(/[^\d.]/g, "");
  const [entero, ...resto] = limpio.split(".");
  return resto.length ? `${entero}.${resto.join("").slice(0, 2)}` : entero;
};
const bloquearSignos = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (["-", "+", "e", "E", ".", ","].includes(e.key)) e.preventDefault();
};

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
  const [seccion, setSeccion] = useState<Seccion>("enviar");
  const [editando, setEditando] = useState<EnvioHoy | null>(null);
  const teclado = useTecladoAbierto();
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

  // Cada producto se envía una vez al día: lo ya enviado sale de la lista; lo que falta se sigue viendo
  const enviados = useMemo(() => new Set(envios.map((e) => e.productoColegioId)), [envios]);
  const porEnviar = (cId: number) => productos.filter((p) => p.colegioId === cId && !enviados.has(p.id));
  const enviadosA = (cId: number) => envios.filter((e) => e.colegioId === cId);
  const todoEnviadoA = (cId: number) => porEnviar(cId).length === 0 && enviadosA(cId).length > 0;

  const colegio = colegios.find((c) => c.id === colegioId);
  const enviadosHoy = enviadosA(colegioId);
  const faltan = porEnviar(colegioId);
  const todoEnviado = todoEnviadoA(colegioId);
  const q = normalizar(busqueda);
  const delColegio = faltan.filter((p) => !q || normalizar(p.nombre).includes(q));

  const n = (v: string | undefined) => (v === undefined || v.trim() === "" ? 0 : Number(v));
  /** Lo que se guarda: unidades (o vasos, si el producto viene en balde) */
  const unidadesDe = (p: Producto) =>
    p.vasosPorBalde ? Math.round(n(cantidades[p.id]) * p.vasosPorBalde) : n(cantidades[p.id]);
  const lineas = faltan
    .filter((p) => unidadesDe(p) > 0)
    .map((p) => ({ productoColegioId: p.id, cantidad: unidadesDe(p), nombre: p.nombre }));
  const total = lineas.reduce((a, l) => a + l.cantidad, 0);
  const invalido = lineas.some((l) => !Number.isInteger(l.cantidad));

  const cambiar = (p: Producto, valor: string) =>
    setCantidades((c) => ({ ...c, [p.id]: p.vasosPorBalde ? soloBaldes(valor) : soloDigitos(valor) }));
  const productoDe = (pcId: number) => productos.find((p) => p.id === pcId);
  const escritosEn = (cId: number) => porEnviar(cId).filter((p) => n(cantidades[p.id]) > 0).length;

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
  const titulos: Record<Seccion, string> = {
    enviar: "Enviar a colegio",
    enviados: "Enviados hoy",
    perfil: "Perfil",
  };

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
                  {todoEnviadoA(c.id) && (
                    <CheckCircle2 className="ml-1.5 inline h-4 w-4 align-[-3px] text-verde" aria-label="Todo enviado hoy" />
                  )}
                  {c.id !== colegioId && !todoEnviadoA(c.id) && escritosEn(c.id) > 0 && (
                    <span
                      className="ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-verde px-1.5 align-middle text-xs text-white"
                      title="Productos escritos sin enviar"
                    >
                      {escritosEn(c.id)}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {todoEnviado ? (
              <div className="card mt-4 flex flex-col items-center px-6 py-10 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-verde-50 text-verde-700">
                  <CheckCircle2 className="h-8 w-8" />
                </span>
                <p className="mt-3 text-lg font-semibold">Ya enviaste todos los productos de hoy</p>
                <p className="mt-1 text-sm text-suave">
                  A <b className="text-tinta">{colegio?.nombre}</b>: {enviadosHoy.length} producto
                  {enviadosHoy.length === 1 ? "" : "s"}, {enviadosHoy.reduce((a, e) => a + e.enviada, 0)} unidades.
                </p>
                <button onClick={() => setSeccion("enviados")} className="btn-secundario mt-5 h-11">
                  <ClipboardList className="h-4 w-4" /> Ver enviados hoy
                </button>
              </div>
            ) : (
              <>
                {/* Lo que ya salió hoy a este colegio (lo demás se puede seguir enviando) */}
                {enviadosHoy.length > 0 && (
                  <button
                    onClick={() => setSeccion("enviados")}
                    className="mt-4 flex w-full items-center gap-3 rounded-xl bg-verde-50 px-4 py-3 text-left text-sm text-verde-700"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      Ya enviaste <b>{enviadosHoy.length}</b> producto{enviadosHoy.length === 1 ? "" : "s"} hoy. Faltan{" "}
                      <b>{faltan.length}</b>.
                    </span>
                    <span className="shrink-0 font-semibold underline">Ver enviados</span>
                  </button>
                )}

                <div className="relative mt-4">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar producto..."
                    className="input py-3 pl-10 text-base"
                  />
                </div>

                {/* Productos del día que faltan enviar, con su cantidad */}
                <ul ref={lista} className="card mt-3 divide-y divide-borde overflow-hidden empty:hidden">
                  {delColegio.map((p, i) => {
                    const v = cantidades[p.id] ?? "";
                    const marcado = n(v) > 0;
                    return (
                      <li key={p.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${marcado ? "bg-verde-50/60" : ""}`}>
                        <div className="flex min-w-0 items-center gap-3">
                          <Inicial nombre={p.nombre} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.nombre}</p>
                            <p className="text-xs text-suave">
                              {p.vasosPorBalde ? (
                                <>
                                  En baldes de {p.vasosPorBalde} vasos
                                  {marcado && <b className="text-verde-700"> · {unidadesDe(p)} vasos</b>}
                                </>
                              ) : (
                                p.categoria
                              )}
                            </p>
                          </div>
                        </div>
                        <input
                          type={p.vasosPorBalde ? "text" : "number"}
                          inputMode={p.vasosPorBalde ? "decimal" : "numeric"}
                          min="0"
                          step="1"
                          value={v}
                          placeholder={p.vasosPorBalde ? "baldes" : "0"}
                          onChange={(e) => cambiar(p, e.target.value)}
                          onKeyDown={(e) => {
                            if (!p.vasosPorBalde) bloquearSignos(e);
                            else if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault();
                            siguiente(e);
                          }}
                          onFocus={(e) => e.target.select()}
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
          </>
        )}

        {/* Lo enviado hoy y su estado */}
        {seccion === "enviados" && (
          <section className="pt-1">
            {envios.length === 0 ? (
              <p className="card p-5 text-center text-sm text-suave">Todavía no se envió nada hoy.</p>
            ) : (
              <div className="space-y-4">
                {porRecibir > 0 && (
                  <p className="text-xs text-suave">Mientras el colegio no lo reciba, puedes corregir la cantidad con el lápiz.</p>
                )}
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
                                  {e.producto}{" "}
                                  <span className="text-suave">
                                    × {e.enviada}
                                    {productoDe(e.productoColegioId)?.vasosPorBalde
                                      ? ` vasos (${enBaldes(e.enviada, productoDe(e.productoColegioId)!.vasosPorBalde!)})`
                                      : ""}
                                  </span>
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
                                      onClick={() => setEditando(e)}
                                      className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-verde-700 hover:bg-verde-50"
                                    >
                                      <Pencil className="h-3 w-3" /> Corregir
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
        {seccion === "perfil" && <PerfilMovil fecha={fechaLarga(hoy)} volverAlPanel={!esCocina} />}
      </main>

      {/* Botón de envío fijo abajo, siempre a mano */}
      {seccion === "enviar" && !todoEnviado && (
        <div className="fixed inset-x-0 z-20 border-t border-borde bg-white/95 backdrop-blur" style={{ bottom: bajoDeBarra(teclado) }}>
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

      {editando && <HojaCorregir key={editando.id} envio={editando} cerrar={() => setEditando(null)} />}

      <NavegacionInferior items={menu} activo={seccion} cambiar={setSeccion} />
    </div>
  );
}

/** Corregir la cantidad de algo ya enviado, mientras el colegio no lo haya recibido */
function HojaCorregir({ envio, cerrar }: { envio: EnvioHoy; cerrar: () => void }) {
  const [valor, setValor] = useState(String(envio.enviada));
  const [guardando, setGuardando] = useState(false);
  const cantidad = valor === "" ? NaN : Number(valor);
  const valido = Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= 10000;

  async function guardar() {
    if (!valido || guardando) return;
    if (cantidad === envio.enviada) return cerrar();
    setGuardando(true);
    const r = await editarEnvio(envio.id, cantidad);
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(r.mensaje ?? "Cantidad corregida");
    cerrar();
  }

  return (
    <Modal abierto onCerrar={cerrar} titulo={envio.producto} subtitulo={`Enviaste ${envio.enviada} · aún no lo reciben`}>
      <label className="block">
        <span className="label">Cantidad correcta</span>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={valor}
          onChange={(e) => setValor(soloDigitos(e.target.value))}
          onKeyDown={(e) => {
            bloquearSignos(e);
            if (e.key === "Enter") guardar();
          }}
          onFocus={(e) => e.target.select()}
          enterKeyHint="done"
          className="input h-16 text-center text-3xl font-semibold"
          autoFocus
        />
      </label>
      {!valido && <p className="mt-2 text-sm text-rojo">Escribe una cantidad de 1 o más.</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando || !valido} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
