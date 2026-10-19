"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Plus, Send, Trash2, Truck } from "lucide-react";
import { registrarIngresos } from "@/app/actions/inventario";
import { avisar, Inicial } from "@/components/ui";
import { BuscadorProducto } from "@/components/buscador-producto";
import { descPresentacion, hoyISO, NOMBRE_PRESENTACION, numero, soles } from "@/lib/format";

type ItemStock = {
  id: number;
  colegioId: number;
  producto: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  costo: number;
  total: number;
  /** Stock mínimo (para marcar en ámbar lo que se está acabando) */
  minimo: number;
};

/** Lo que se está cargando arriba (antes de agregarlo a la lista) */
type Borrador = { productoColegioId: number | null; cajas: string; porCaja: string; sueltas: string; costo: string };
/** Un producto ya agregado a la entrega */
type Agregado = { productoColegioId: number; cajas: number; porCaja: number; sueltas: number; costo: number };

const vacio: Borrador = { productoColegioId: null, cajas: "", porCaja: "", sueltas: "", costo: "" };
const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
const soloDigitos = (v: string) => v.replace(/\D/g, "");
const soloDecimal = (v: string) => {
  const limpio = v.replace(",", ".").replace(/[^\d.]/g, "");
  const [entero, ...resto] = limpio.split(".");
  return resto.length ? `${entero}.${resto.join("").slice(0, 2)}` : entero;
};

/** Unidades y costo de un producto (el costo es por caja/paquete, o por unidad si se compra suelto) */
function calcular(it: ItemStock, a: Agregado) {
  const esUnidad = it.presentacion === "UNIDAD";
  const unidades = (esUnidad ? 0 : a.cajas * a.porCaja) + a.sueltas;
  const costo = esUnidad ? a.sueltas * a.costo : (unidades * a.costo) / (a.porCaja || 1);
  return { unidades, costo };
}

export function FormularioEntrega({
  colegios,
  colegioInicial,
  stock,
}: {
  colegios: { id: number; nombre: string }[];
  colegioInicial: number;
  stock: ItemStock[];
}) {
  const [colegioId, setColegioId] = useState(colegioInicial);
  const [fecha, setFecha] = useState(hoyISO());
  const [obs, setObs] = useState("");
  const [b, setB] = useState<Borrador>(vacio);
  const [lista, setLista] = useState<Agregado[]>([]);
  const [pendiente, iniciar] = useTransition();
  const zonaCarga = useRef<HTMLDivElement>(null);

  const disponibles = stock.filter((s) => s.colegioId === colegioId);
  const item = (id: number | null) => disponibles.find((s) => s.id === id);
  const it = item(b.productoColegioId);
  const esUnidad = !it || it.presentacion === "UNIDAD";
  const nombreCaja = it ? (NOMBRE_PRESENTACION[it.presentacion] ?? "Caja").toLowerCase() : "caja";

  // Lo que se está cargando, ya calculado
  const actual: Agregado | null = it
    ? {
        productoColegioId: it.id,
        cajas: esUnidad ? 0 : n(b.cajas),
        porCaja: esUnidad ? 1 : n(b.porCaja) || it.unidadesPorPresentacion,
        sueltas: n(b.sueltas),
        costo: n(b.costo),
      }
    : null;
  const calc = it && actual ? calcular(it, actual) : null;
  const faltaPorCaja = !!it && !esUnidad && n(b.cajas) > 0 && n(b.porCaja) < 1;
  const puedeAgregar = !!calc && calc.unidades > 0 && !faltaPorCaja;

  const total = lista.reduce(
    (a, x) => {
      const i = item(x.productoColegioId);
      if (!i) return a;
      const c = calcular(i, x);
      return { unidades: a.unidades + c.unidades, costo: a.costo + c.costo };
    },
    { unidades: 0, costo: 0 },
  );

  function elegir(id: number | null) {
    const nuevo = item(id);
    setB({
      productoColegioId: id,
      cajas: "",
      sueltas: "",
      porCaja: nuevo ? String(nuevo.unidadesPorPresentacion) : "",
      costo: nuevo ? String(nuevo.costo) : "",
    });
  }

  function agregar() {
    if (!puedeAgregar || !actual) return;
    setLista((l) => [...l, actual]);
    setB(vacio);
    // De vuelta al buscador para cargar el siguiente
    setTimeout(() => zonaCarga.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus(), 30);
  }

  /** Volver a cargar arriba un producto de la lista para corregirlo */
  function editar(x: Agregado) {
    setLista((l) => l.filter((y) => y.productoColegioId !== x.productoColegioId));
    setB({
      productoColegioId: x.productoColegioId,
      cajas: x.cajas ? String(x.cajas) : "",
      porCaja: String(x.porCaja),
      sueltas: x.sueltas ? String(x.sueltas) : "",
      costo: String(x.costo),
    });
    zonaCarga.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function guardar() {
    if (lista.length === 0) return avisar("Agrega al menos un producto.", "error");
    iniciar(async () => {
      const r = await registrarIngresos(
        fecha,
        lista.map((x) => ({
          productoColegioId: x.productoColegioId,
          cajas: x.cajas,
          unidadesPorCaja: x.porCaja || 1,
          sueltas: x.sueltas,
          costo: x.costo,
        })),
        obs,
      );
      if (r.ok) {
        avisar(r.mensaje ?? "Guardado");
        setLista([]);
        setB(vacio);
        setObs("");
      } else avisar(r.error, "error");
    });
  }

  const alPresionarEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      agregar();
    }
  };
  const campo = "input text-base";

  return (
    <div className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-medium">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-verde-50 text-verde">
          <Truck className="h-4 w-4" />
        </span>
        Nueva entrega
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-2">
          <span className="label">Colegio</span>
          <select
            value={colegioId}
            disabled={lista.length > 0}
            onChange={(e) => {
              setColegioId(Number(e.target.value));
              setB(vacio);
            }}
            className="input"
          >
            {colegios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {lista.length > 0 && <span className="mt-1 block text-xs text-suave">Para cambiar de colegio, primero registra o quita los productos.</span>}
        </label>
        <label>
          <span className="label">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input" />
        </label>
      </div>

      {/* ---------- Zona de carga: un producto a la vez ---------- */}
      <div ref={zonaCarga} className="mt-5 rounded-xl border border-verde/40 bg-verde-50/40 p-4">
        <p className="label">Producto</p>
        <BuscadorProducto
          opciones={disponibles
            .filter((s) => !lista.some((x) => x.productoColegioId === s.id))
            .map((s) => ({
              id: s.id,
              nombre: s.producto,
              stock: s.total,
              minimo: s.minimo,
              detalle: descPresentacion(s.presentacion, s.unidadesPorPresentacion),
            }))}
          valor={b.productoColegioId}
          onElegir={elegir}
        />

        {it && (
          <>
            <div className={`mt-3 grid gap-3 ${esUnidad ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
              {!esUnidad && (
                <>
                  <label>
                    <span className="label capitalize">{nombreCaja}s</span>
                    <input
                      inputMode="numeric"
                      value={b.cajas}
                      onChange={(e) => setB({ ...b, cajas: soloDigitos(e.target.value) })}
                      onKeyDown={alPresionarEnter}
                      className={campo}
                      autoFocus
                    />
                  </label>
                  <label>
                    <span className="label">Unidades por {nombreCaja}</span>
                    <input
                      inputMode="numeric"
                      value={b.porCaja}
                      onChange={(e) => setB({ ...b, porCaja: soloDigitos(e.target.value) })}
                      onKeyDown={alPresionarEnter}
                      className={campo}
                    />
                  </label>
                </>
              )}
              <label>
                <span className="label">{esUnidad ? "Unidades" : "Sueltas"}</span>
                <input
                  inputMode="numeric"
                  value={b.sueltas}
                  onChange={(e) => setB({ ...b, sueltas: soloDigitos(e.target.value) })}
                  onKeyDown={alPresionarEnter}
                  className={campo}
                  autoFocus={esUnidad}
                />
              </label>
              <label>
                <span className="label">Costo por {esUnidad ? "unidad" : nombreCaja} (S/)</span>
                <input
                  inputMode="decimal"
                  value={b.costo}
                  onChange={(e) => setB({ ...b, costo: soloDecimal(e.target.value) })}
                  onKeyDown={alPresionarEnter}
                  className={campo}
                />
              </label>
            </div>

            {/* Resultado de este producto + Agregar */}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                {calc && calc.unidades > 0 ? (
                  <>
                    {!esUnidad && n(b.cajas) > 0 && (
                      <span className="text-suave">
                        {n(b.cajas)} {nombreCaja}
                        {n(b.cajas) === 1 ? "" : "s"} × {actual?.porCaja}
                        {n(b.sueltas) > 0 ? ` + ${n(b.sueltas)} sueltas` : ""} ={" "}
                      </span>
                    )}
                    <b>{numero(calc.unidades)} unidades</b> · costo <b className="text-verde-700">{soles(calc.costo)}</b>
                    <span className="text-suave"> · quedará en {numero(it.total + calc.unidades)}</span>
                  </>
                ) : faltaPorCaja ? (
                  <span className="text-rojo">Indica cuántas unidades trae cada {nombreCaja}.</span>
                ) : (
                  <span className="text-suave">Escribe la cantidad.</span>
                )}
              </p>
              <button onClick={agregar} disabled={!puedeAgregar} className="btn-primario shrink-0">
                <Plus className="h-4 w-4" /> Agregar a la entrega
              </button>
            </div>
          </>
        )}
      </div>

      {/* ---------- Productos agregados ---------- */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold">
          Productos de esta entrega {lista.length > 0 && <span className="font-normal text-suave">({lista.length})</span>}
        </p>
        {lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-campo/50 px-4 py-6 text-center text-sm text-suave">
            Todavía no agregaste productos. Elige uno arriba, escribe la cantidad y toca &quot;Agregar a la entrega&quot;.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-borde">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cómo viene</th>
                  <th className="text-right">Unidades</th>
                  <th className="text-right">Costo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((x) => {
                  const i = item(x.productoColegioId);
                  if (!i) return null;
                  const c = calcular(i, x);
                  const unidad = i.presentacion === "UNIDAD";
                  const caja = (NOMBRE_PRESENTACION[i.presentacion] ?? "Caja").toLowerCase();
                  const partes = [
                    x.cajas ? `${x.cajas} ${caja}${x.cajas === 1 ? "" : "s"} × ${x.porCaja}` : "",
                    x.sueltas ? `${x.sueltas} ${unidad ? "unidades" : "sueltas"}` : "",
                  ].filter(Boolean);
                  return (
                    <tr key={x.productoColegioId}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <Inicial nombre={i.producto} />
                          <span className="font-medium">{i.producto}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-suave">
                        {partes.join(" + ")} · {soles(x.costo)} c/{unidad ? "unid." : caja}
                      </td>
                      <td className="text-right font-medium tabular-nums">{numero(c.unidades)}</td>
                      <td className="text-right font-medium tabular-nums">{soles(c.costo)}</td>
                      <td className="w-20">
                        <span className="flex justify-end gap-1">
                          <button
                            onClick={() => editar(x)}
                            className="rounded-lg p-1.5 text-suave hover:bg-fondo hover:text-tinta"
                            aria-label={`Editar ${i.producto}`}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setLista((l) => l.filter((y) => y.productoColegioId !== x.productoColegioId))}
                            className="rounded-lg p-1.5 text-suave hover:bg-rojo-50 hover:text-rojo"
                            aria-label={`Quitar ${i.producto}`}
                            title="Quitar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <label className="mt-4 block">
        <span className="label">Observación</span>
        <input value={obs} onChange={(e) => setObs(e.target.value)} className="input" placeholder="Ej: Guía 0012, proveedor..." />
      </label>

      {/* ---------- Total acumulado y registrar ---------- */}
      <div className="mt-5 flex flex-col gap-3 rounded-xl bg-panel p-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          {lista.length} producto{lista.length === 1 ? "" : "s"} · <b>{numero(total.unidades)}</b> unidades · total{" "}
          <b className="text-lg">{soles(total.costo)}</b>
        </p>
        <button onClick={guardar} disabled={pendiente || lista.length === 0} className="btn-primario">
          <Send className="h-4 w-4" />
          {pendiente ? "Registrando..." : "Registrar entrega"}
        </button>
      </div>
    </div>
  );
}
