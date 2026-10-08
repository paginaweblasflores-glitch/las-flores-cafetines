"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, PenLine, Plus, Search, Send, Trash2, X } from "lucide-react";
import { anularReposicion, crearReposicion, type ItemNuevo } from "@/app/actions/reposiciones";
import { avisar } from "@/components/ui";
import {
  cantidadConUnidad,
  descPresentacion,
  ESTADO_REPOSICION,
  fechaHoraLima,
  normalizar,
  numero,
  UNIDADES_REPOSICION,
} from "@/lib/format";

export type ProductoCatalogo = {
  productoId: number;
  nombre: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  stock: number;
};

export type ReposicionEnviada = {
  id: number;
  codigo: string;
  estado: string;
  fecha: string;
  nota: string | null;
  motivoRechazo: string | null;
  items: {
    id: number;
    nombre: string;
    productoId: number | null;
    enCatalogo: boolean;
    cantidad: number;
    unidad: string;
    quitado: boolean;
    cantidadAprobada: number | null;
  }[];
};

const OPCIONES_UNIDAD = Object.entries(UNIDADES_REPOSICION).map(([id, [uno]]) => ({
  id,
  texto: uno.charAt(0).toUpperCase() + uno.slice(1),
}));

/** Unidad sugerida: como viene el producto (caja, paquete...) */
const unidadDe = (p: ProductoCatalogo) => (UNIDADES_REPOSICION[p.presentacion] ? p.presentacion : "UNIDAD");

/** Reposición: el personal arma su lista de pedido y ve las que ya envió */
export function Reposicion({
  colegioId,
  catalogo,
  enviadas,
  precarga = [],
  alPrecargar,
}: {
  colegioId: number;
  catalogo: ProductoCatalogo[];
  enviadas: ReposicionEnviada[];
  /** Productos que se agregan a la lista al abrir (desde "Se está acabando") */
  precarga?: ItemNuevo[];
  alPrecargar?: () => void;
}) {
  const [vista, setVista] = useState<"nueva" | "enviadas">("nueva");
  const [items, setItems] = useState<ItemNuevo[]>([]);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Borrador: la lista queda guardada en el celular hasta que se envía
  const clave = `lf_reposicion_${colegioId}`;
  const cargado = useRef(false);
  const precargaInicial = useRef(precarga);
  const avisarPrecarga = useRef(alPrecargar);
  useEffect(() => {
    let guardados: ItemNuevo[] = [];
    try {
      const g = JSON.parse(localStorage.getItem(clave) ?? "null") as { items: ItemNuevo[]; nota: string } | null;
      if (g?.items?.length) guardados = g.items;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (g?.nota) setNota(g.nota);
    } catch {}
    // Lo que viene de "Se está acabando" se suma a la lista (sin repetir lo que ya estaba)
    const nuevos = precargaInicial.current.filter(
      (n) => !guardados.some((x) => x.productoId != null && x.productoId === n.productoId),
    );
    // Se restaura después de hidratar para que el HTML del servidor coincida
    if (guardados.length || nuevos.length) setItems([...guardados, ...nuevos]);
    if (precargaInicial.current.length) {
      avisar(
        nuevos.length
          ? `${nuevos.length} producto${nuevos.length === 1 ? "" : "s"} agregado${nuevos.length === 1 ? "" : "s"}: revisa las cantidades`
          : "Esos productos ya estaban en tu lista",
      );
      avisarPrecarga.current?.();
    }
    cargado.current = true;
  }, [clave]);
  useEffect(() => {
    if (!cargado.current) return;
    try {
      if (items.length || nota.trim()) localStorage.setItem(clave, JSON.stringify({ items, nota }));
      else localStorage.removeItem(clave);
    } catch {}
  }, [items, nota, clave]);

  function agregar(nuevo: ItemNuevo) {
    setItems((lista) => {
      // El mismo producto en la misma unidad se suma
      const i = lista.findIndex(
        (x) =>
          x.unidad === nuevo.unidad &&
          (nuevo.productoId ? x.productoId === nuevo.productoId : !x.productoId && normalizar(x.nombre) === normalizar(nuevo.nombre)),
      );
      if (i < 0) return [...lista, nuevo];
      return lista.map((x, k) => (k === i ? { ...x, cantidad: x.cantidad + nuevo.cantidad } : x));
    });
  }
  const cambiar = (k: number, c: Partial<ItemNuevo>) => setItems((l) => l.map((x, i) => (i === k ? { ...x, ...c } : x)));
  const quitar = (k: number) => setItems((l) => l.filter((_, i) => i !== k));

  const invalida = items.some((x) => !Number.isInteger(x.cantidad) || x.cantidad <= 0);

  async function enviar() {
    if (!items.length || invalida || enviando) return;
    setEnviando(true);
    const r = await crearReposicion(colegioId, items, nota);
    setEnviando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(r.mensaje ?? "Enviada");
    setItems([]);
    setNota("");
    setVista("enviadas");
    window.scrollTo({ top: 0 });
  }

  const porAprobar = enviadas.filter((e) => e.estado === "POR_APROBAR").length;

  return (
    <div>
      {/* Nueva lista / Mis pedidos */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-borde bg-white p-1" role="tablist">
        {[
          { id: "nueva" as const, texto: items.length ? `Nueva lista (${items.length})` : "Nueva lista" },
          { id: "enviadas" as const, texto: `Mis pedidos${porAprobar ? ` (${porAprobar})` : ""}` },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={vista === t.id}
            onClick={() => setVista(t.id)}
            className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              vista === t.id ? "bg-panel text-white" : "text-suave"
            }`}
          >
            {t.texto}
          </button>
        ))}
      </div>

      {vista === "nueva" ? (
        <>
          <Agregar catalogo={catalogo} agregar={agregar} />

          {/* La lista armada */}
          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold">Tu lista ({items.length})</h2>
            {items.length === 0 ? (
              <p className="card p-5 text-center text-sm text-suave">
                Agrega productos del catálogo u otros que necesites.
              </p>
            ) : (
              <ul className="card divide-y divide-borde">
                {items.map((x, k) => (
                  <li key={`${x.productoId ?? x.nombre}-${x.unidad}-${k}`} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium">
                        {x.nombre}
                        {!x.productoId && <span className="chip ml-2 bg-fondo align-middle text-suave">Fuera de catálogo</span>}
                      </p>
                      <button
                        onClick={() => quitar(k)}
                        className="-m-1 rounded-lg p-1.5 text-rojo hover:bg-rojo-50"
                        aria-label={`Quitar ${x.nombre}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[6rem_1fr] gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={Number.isFinite(x.cantidad) ? x.cantidad : ""}
                        onChange={(e) => cambiar(k, { cantidad: e.target.value === "" ? NaN : Number(e.target.value) })}
                        onFocus={(e) => e.target.select()}
                        className="input h-11 text-center text-base font-semibold"
                        aria-label={`Cantidad de ${x.nombre}`}
                      />
                      <select
                        value={x.unidad}
                        onChange={(e) => cambiar(k, { unidad: e.target.value })}
                        className="input h-11 text-base"
                        aria-label={`Unidad de ${x.nombre}`}
                      >
                        {OPCIONES_UNIDAD.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.texto}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {items.length > 0 && (
            <>
              <label className="mt-4 block">
                <span className="label">Nota para logística (opcional)</span>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                  placeholder="Ej.: la salchicha es urgente"
                  className="input text-base"
                />
              </label>
              <button
                onClick={enviar}
                disabled={enviando || invalida}
                className="btn-primario mt-4 h-12 w-full text-base disabled:bg-borde disabled:text-suave disabled:opacity-100"
              >
                <Send className="h-4 w-4" />
                {enviando
                  ? "Enviando..."
                  : invalida
                    ? "Revisa las cantidades"
                    : `Enviar lista (${items.length} producto${items.length === 1 ? "" : "s"})`}
              </button>
              <p className="mt-2 text-center text-xs text-suave">Logística la revisa y hace la compra.</p>
            </>
          )}
        </>
      ) : (
        <MisPedidos enviadas={enviadas} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Agregar a la lista: del catálogo o escrito a mano */
function Agregar({ catalogo, agregar }: { catalogo: ProductoCatalogo[]; agregar: (x: ItemNuevo) => void }) {
  const [modo, setModo] = useState<"catalogo" | "otro">("catalogo");
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<ProductoCatalogo | null>(null);
  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("UNIDAD");
  const cantidadRef = useRef<HTMLInputElement>(null);

  const q = normalizar(busqueda);
  const resultados = catalogo.filter((p) => !q || normalizar(p.nombre).includes(q));
  const n = Number(cantidad);
  const listo = Number.isInteger(n) && n > 0 && (modo === "catalogo" ? !!elegido : nombre.trim().length > 0);

  function elegir(p: ProductoCatalogo) {
    setElegido(p);
    setUnidad(unidadDe(p));
    setBusqueda("");
    setTimeout(() => cantidadRef.current?.focus(), 0);
  }

  function confirmar() {
    if (!listo) return;
    if (modo === "catalogo" && elegido) {
      agregar({ productoId: elegido.productoId, nombre: elegido.nombre, cantidad: n, unidad });
      setElegido(null);
    } else {
      const limpio = nombre.trim().replace(/\s+/g, " ");
      agregar({ productoId: null, nombre: limpio.charAt(0).toUpperCase() + limpio.slice(1), cantidad: n, unidad });
      setNombre("");
    }
    setCantidad("");
    avisar("Agregado a la lista");
  }

  return (
    <section className="card p-4">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {[
          { id: "catalogo" as const, texto: "Del catálogo", icono: BookOpen },
          { id: "otro" as const, texto: "Otro producto", icono: PenLine },
        ].map((m) => {
          const Icono = m.icono;
          return (
            <button
              key={m.id}
              onClick={() => {
                setModo(m.id);
                setUnidad(m.id === "catalogo" && elegido ? unidadDe(elegido) : "UNIDAD");
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium ${
                modo === m.id ? "border-verde bg-verde-50 text-verde-700" : "border-borde text-suave"
              }`}
            >
              <Icono className="h-4 w-4" /> {m.texto}
            </button>
          );
        })}
      </div>

      {modo === "catalogo" ? (
        elegido ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-fondo px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium">{elegido.nombre}</p>
              <p className="text-xs text-suave">
                Hay {numero(elegido.stock)} unid. · {elegido.unidadesPorPresentacion > 1 ? "viene en " : "se pide "}
                {descPresentacion(elegido.presentacion, elegido.unidadesPorPresentacion)}
              </p>
            </div>
            <button onClick={() => setElegido(null)} className="rounded-lg p-1.5 text-suave hover:bg-white" aria-label="Elegir otro">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en el catálogo..."
                className="input py-3 pl-10 text-base"
              />
            </div>
            <ul className="mt-2 max-h-60 divide-y divide-borde overflow-y-auto rounded-xl border border-borde">
              {resultados.map((p) => (
                <li key={p.productoId}>
                  <button onClick={() => elegir(p)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-fondo">
                    <span className="min-w-0 truncate">{p.nombre}</span>
                    <span className="shrink-0 text-xs text-suave">Hay {numero(p.stock)}</span>
                  </button>
                </li>
              ))}
              {resultados.length === 0 && !q && (
                <li className="px-3 py-4 text-center text-sm text-suave">
                  El catálogo está vacío. Usa &quot;Otro producto&quot; para escribirlo.
                </li>
              )}
              {resultados.length === 0 && q && (
                <li className="px-3 py-4 text-center text-sm text-suave">
                  No está en el catálogo.{" "}
                  <button
                    onClick={() => {
                      setModo("otro");
                      setNombre(busqueda);
                      setUnidad("UNIDAD");
                    }}
                    className="font-medium text-verde-700 underline"
                  >
                    Agregarlo como otro producto
                  </button>
                </li>
              )}
            </ul>
          </>
        )
      ) : (
        <label className="block">
          <span className="label">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Cucharón, platos descartables"
            className="input h-11 text-base"
          />
        </label>
      )}

      {(modo === "otro" || elegido) && (
        <div className="mt-3 grid grid-cols-[6rem_1fr] gap-2">
          <label className="block">
            <span className="label">Cantidad</span>
            <input
              ref={cantidadRef}
              type="number"
              inputMode="numeric"
              min="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmar()}
              enterKeyHint="done"
              placeholder="0"
              className="input h-11 text-center text-base font-semibold"
            />
          </label>
          <label className="block">
            <span className="label">En</span>
            <span className="relative block">
              <select value={unidad} onChange={(e) => setUnidad(e.target.value)} className="input h-11 appearance-none text-base">
                {OPCIONES_UNIDAD.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.texto}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-suave" />
            </span>
          </label>
        </div>
      )}

      {(modo === "otro" || elegido) && (
        <button onClick={confirmar} disabled={!listo} className="btn-secundario mt-3 h-11 w-full">
          <Plus className="h-4 w-4" /> Agregar a la lista
        </button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** Historial de listas enviadas con su estado */
function MisPedidos({ enviadas }: { enviadas: ReposicionEnviada[] }) {
  const [anulando, setAnulando] = useState<number | null>(null);

  async function anular(id: number) {
    setAnulando(id);
    const r = await anularReposicion(id);
    setAnulando(null);
    if (r.ok) avisar(r.mensaje ?? "Anulada");
    else avisar(r.error, "error");
  }

  if (enviadas.length === 0) {
    return <p className="card p-6 text-center text-sm text-suave">Todavía no enviaste ninguna lista.</p>;
  }

  return (
    <ul className="space-y-2">
      {enviadas.map((e) => {
        const est = ESTADO_REPOSICION[e.estado];
        const revisada = e.estado === "APROBADA" || e.estado === "EN_COMPRA" || e.estado === "COMPRADA";
        return (
          <li key={e.id}>
            <details className="card group overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3.5">
                <span className="min-w-0">
                  <span className="block font-semibold">{e.codigo}</span>
                  <span className="block text-xs text-suave">
                    {fechaHoraLima(e.fecha)} · {e.items.length} producto{e.items.length === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`chip ${est?.clase ?? ""}`}>{est?.texto ?? e.estado}</span>
                  <ChevronDown className="h-4 w-4 text-suave transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="border-t border-borde px-3.5 pt-2 pb-3.5">
                {e.estado === "RECHAZADA" && e.motivoRechazo && (
                  <p className="mb-2 rounded-lg bg-rojo-50 px-3 py-2 text-sm text-rojo">Motivo: {e.motivoRechazo}</p>
                )}
                <ul className="divide-y divide-borde text-sm">
                  {e.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                      <span className={`min-w-0 ${i.quitado ? "text-suave line-through" : ""}`}>{i.nombre}</span>
                      <span className="shrink-0 text-right">
                        {i.quitado ? (
                          <span className="text-xs text-rojo">Quitado</span>
                        ) : revisada && i.cantidadAprobada != null ? (
                          <>
                            <span className="text-suave line-through">{i.cantidad}</span>{" "}
                            <b>{cantidadConUnidad(i.cantidadAprobada, i.unidad)}</b>
                          </>
                        ) : (
                          cantidadConUnidad(i.cantidad, i.unidad)
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {e.nota && <p className="mt-2 text-xs text-suave">Nota: {e.nota}</p>}
                {e.estado === "POR_APROBAR" && (
                  <button
                    onClick={() => anular(e.id)}
                    disabled={anulando === e.id}
                    className="mt-3 flex items-center gap-1 text-sm text-rojo hover:underline"
                  >
                    <X className="h-4 w-4" /> {anulando === e.id ? "Anulando..." : "Anular esta lista"}
                  </button>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
