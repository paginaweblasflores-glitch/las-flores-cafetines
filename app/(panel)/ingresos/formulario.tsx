"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Plus, Send, Sparkles, Trash2, Truck } from "lucide-react";
import { registrarIngresos } from "@/app/actions/inventario";
import { aprenderEquivalenciasIA, prepararProductosIA, type BoletaLeida, type ItemCreado, type LineaLeida } from "@/app/actions/ia";
import { avisar, Inicial, Modal } from "@/components/ui";
import { BuscadorProducto } from "@/components/buscador-producto";
import { descPresentacion, fechaCorta, hoyISO, mayusculas, NOMBRE_PRESENTACION, numero, soles } from "@/lib/format";
import type { Presentacion } from "@/lib/types";
import { PanelIA } from "./panel-ia";

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

/** Lo que leyó la IA de esa línea de la boleta */
type DeIA = Pick<LineaLeida, "texto" | "importe" | "confianza" | "nota" | "aprendida">;
/** Producto que todavía no está en este colegio (se crea o se agrega al registrar) */
type PorCrear = { productoId: number | null; nombre: string; categoriaId: number | null; presentacion: Presentacion };

/** Lo que se está cargando arriba (antes de agregarlo a la lista) */
type Borrador = { productoColegioId: number | null; cajas: string; porCaja: string; sueltas: string; costo: string; ia?: DeIA };
/** Un producto ya agregado a la entrega */
type Agregado = {
  clave: string;
  productoColegioId: number | null;
  cajas: number;
  porCaja: number;
  sueltas: number;
  costo: number;
  ia?: DeIA;
  nuevo?: PorCrear;
};

const vacio: Borrador = { productoColegioId: null, cajas: "", porCaja: "", sueltas: "", costo: "" };
const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
const soloDigitos = (v: string) => v.replace(/\D/g, "");
const soloDecimal = (v: string) => {
  const limpio = v.replace(",", ".").replace(/[^\d.]/g, "");
  const [entero, ...resto] = limpio.split(".");
  return resto.length ? `${entero}.${resto.join("").slice(0, 2)}` : entero;
};
let contador = 0;
const nuevaClave = () => `l${++contador}`;
const PRESENTACIONES_COMPRA: Presentacion[] = ["UNIDAD", "CAJA", "PAQUETE", "BOLSA", "OTRO"];

/** Unidades y costo de un producto (el costo es por caja/paquete, o por unidad si se compra suelto) */
function calcular(presentacion: string, a: Agregado) {
  const esUnidad = presentacion === "UNIDAD";
  const unidades = (esUnidad ? 0 : a.cajas * a.porCaja) + a.sueltas;
  const costo = esUnidad ? a.sueltas * a.costo : (unidades * a.costo) / (a.porCaja || 1);
  return { unidades, costo };
}
/** La boleta y lo calculado difieren en más de 5 céntimos */
const noCuadra = (a: number, b: number) => Math.abs(a - b) > 0.05;

export function FormularioEntrega({
  colegios,
  colegioInicial,
  stock,
  categorias,
  iaConectada,
  esAdmin,
}: {
  colegios: { id: number; nombre: string }[];
  colegioInicial: number;
  stock: ItemStock[];
  categorias: { id: number; nombre: string }[];
  iaConectada: boolean;
  esAdmin: boolean;
}) {
  const [colegioId, setColegioId] = useState(colegioInicial);
  const [fecha, setFecha] = useState(hoyISO());
  const [obs, setObs] = useState("");
  const [b, setB] = useState<Borrador>(vacio);
  const [lista, setLista] = useState<Agregado[]>([]);
  /** Productos creados/agregados por la IA en esta sesión (hasta que la página se actualice) */
  const [extra, setExtra] = useState<ItemCreado[]>([]);
  /** Total impreso en la boleta (para cuadrar); null = no se usó la IA o no se leyó */
  const [totalBoleta, setTotalBoleta] = useState<string>("");
  const [editandoNuevo, setEditandoNuevo] = useState<Agregado | null>(null);
  const [pendiente, iniciar] = useTransition();
  const zonaCarga = useRef<HTMLDivElement>(null);

  const disponibles = [...stock, ...extra.filter((e) => !stock.some((s) => s.id === e.id))].filter((s) => s.colegioId === colegioId);
  const item = (id: number | null) => disponibles.find((s) => s.id === id);
  const it = item(b.productoColegioId);
  const esUnidad = !it || it.presentacion === "UNIDAD";
  const nombreCaja = it ? (NOMBRE_PRESENTACION[it.presentacion] ?? "Caja").toLowerCase() : "caja";
  const colegioNombre = colegios.find((c) => c.id === colegioId)?.nombre ?? "";

  /** Nombre y presentación de una línea (sea del catálogo o por crear) */
  const info = (x: Agregado) => {
    if (x.nuevo) return { producto: x.nuevo.nombre, presentacion: x.nuevo.presentacion };
    const i = item(x.productoColegioId);
    return i ? { producto: i.producto, presentacion: i.presentacion } : null;
  };

  // Lo que se está cargando, ya calculado
  const actual: Agregado | null = it
    ? {
        clave: nuevaClave(),
        productoColegioId: it.id,
        cajas: esUnidad ? 0 : n(b.cajas),
        porCaja: esUnidad ? 1 : n(b.porCaja) || it.unidadesPorPresentacion,
        sueltas: n(b.sueltas),
        costo: n(b.costo),
        ia: b.ia,
      }
    : null;
  const calc = it && actual ? calcular(it.presentacion, actual) : null;
  const faltaPorCaja = !!it && !esUnidad && n(b.cajas) > 0 && n(b.porCaja) < 1;
  const puedeAgregar = !!calc && calc.unidades > 0 && !faltaPorCaja;

  const total = lista.reduce(
    (a, x) => {
      const i = info(x);
      if (!i) return a;
      const c = calcular(i.presentacion, x);
      return { unidades: a.unidades + c.unidades, costo: a.costo + c.costo };
    },
    { unidades: 0, costo: 0 },
  );
  const boleta = totalBoleta.trim() === "" ? null : Number(totalBoleta);
  const porCrear = lista.filter((x) => x.nuevo);
  const usoIA = lista.some((x) => x.ia);

  function elegir(id: number | null) {
    const nuevo = item(id);
    setB({
      productoColegioId: id,
      cajas: "",
      sueltas: "",
      porCaja: nuevo ? String(nuevo.unidadesPorPresentacion) : "",
      costo: nuevo ? String(nuevo.costo) : "",
      ia: b.ia,
    });
  }

  function agregar() {
    if (!puedeAgregar || !actual) return;
    setLista((l) => [...l, actual]);
    setB(vacio);
    // De vuelta al buscador para cargar el siguiente
    setTimeout(() => zonaCarga.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus(), 30);
  }

  /** Volver a cargar arriba un producto de la lista para corregirlo (los nuevos se corrigen en su ventana) */
  function editar(x: Agregado) {
    if (x.nuevo) return setEditandoNuevo(x);
    setLista((l) => l.filter((y) => y.clave !== x.clave));
    setB({
      productoColegioId: x.productoColegioId,
      cajas: x.cajas ? String(x.cajas) : "",
      porCaja: String(x.porCaja),
      sueltas: x.sueltas ? String(x.sueltas) : "",
      costo: String(x.costo),
      ia: x.ia,
    });
    zonaCarga.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /** Lo que leyó la IA pasa a la lista (se suma a lo que ya hubiera) */
  function alLeer(r: BoletaLeida) {
    setB(vacio);
    setLista((previa) => {
      const l = [...previa];
      for (const x of r.lineas) {
        const ia: DeIA = { texto: x.texto, importe: x.importe, confianza: x.confianza, nota: x.nota, aprendida: x.aprendida };
        const enColegio = x.productoColegioId && item(x.productoColegioId) ? x.productoColegioId : null;
        const linea: Agregado = {
          clave: nuevaClave(),
          productoColegioId: enColegio,
          cajas: x.cajas,
          porCaja: x.porCaja,
          sueltas: x.sueltas,
          costo: x.costo,
          ia,
          nuevo: enColegio
            ? undefined
            : { productoId: x.productoId, nombre: x.nombre, categoriaId: x.categoriaId, presentacion: x.presentacion },
        };
        // El mismo producto dos veces con el mismo precio: se juntan en una línea
        const k = l.findIndex(
          (y) =>
            (enColegio ? y.productoColegioId === enColegio : y.nuevo?.nombre === x.nombre) &&
            y.porCaja === linea.porCaja &&
            y.costo === linea.costo,
        );
        if (k >= 0) {
          const y = l[k];
          l[k] = {
            ...y,
            cajas: y.cajas + linea.cajas,
            sueltas: y.sueltas + linea.sueltas,
            ia: y.ia && ia.importe != null ? { ...y.ia, importe: (y.ia.importe ?? 0) + ia.importe } : y.ia,
          };
        } else l.push(linea);
      }
      return l;
    });
    if (r.total != null) setTotalBoleta(String(r.total));
    if (!obs.trim()) {
      setObs(
        [r.documento, r.proveedor && !r.documento.toUpperCase().includes(r.proveedor.toUpperCase()) ? r.proveedor : "", r.fecha ? fechaCorta(r.fecha) : ""]
          .filter(Boolean)
          .join(" · "),
      );
    }
  }

  function guardar() {
    if (lista.length === 0) return avisar("Agrega al menos un producto.", "error");
    const sinCategoria = porCrear.filter((x) => !x.nuevo!.productoId && !x.nuevo!.categoriaId);
    if (sinCategoria.length) {
      setEditandoNuevo(sinCategoria[0]);
      return avisar(`Elige la categoría de "${sinCategoria[0].nuevo!.nombre}".`, "error");
    }
    iniciar(async () => {
      let lineas = lista;
      let creadosNuevos = 0;
      // 1) Crear los productos que faltan (o agregarlos a este colegio)
      if (porCrear.length) {
        const r = await prepararProductosIA(
          colegioId,
          porCrear.map((x) => ({
            clave: x.clave,
            productoId: x.nuevo!.productoId,
            nombre: x.nuevo!.nombre,
            categoriaId: x.nuevo!.categoriaId,
            presentacion: x.nuevo!.presentacion,
            porCaja: x.porCaja,
            costo: x.costo,
          })),
        );
        if (!r.ok) return avisar(r.error, "error");
        creadosNuevos = r.nuevos;
        setExtra((e) => [...e, ...r.creados]);
        const porClave = new Map(r.creados.map((c) => [c.clave, c.id]));
        lineas = lista.map((x) => (x.nuevo ? { ...x, productoColegioId: porClave.get(x.clave) ?? null, nuevo: undefined } : x));
        // Si algo falla después, ya no se vuelven a crear
        setLista(lineas);
      }
      // 2) Registrar la entrega (igual que siempre)
      const r = await registrarIngresos(
        fecha,
        lineas
          .filter((x) => x.productoColegioId)
          .map((x) => ({
            productoColegioId: x.productoColegioId!,
            cajas: x.cajas,
            unidadesPorCaja: x.porCaja || 1,
            sueltas: x.sueltas,
            costo: x.costo,
          })),
        obs,
      );
      if (!r.ok) return avisar(r.error, "error");
      // 3) Aprender cómo sale cada producto en la boleta
      const pares = lineas.filter((x) => x.ia?.texto && x.productoColegioId).map((x) => ({ texto: x.ia!.texto, productoColegioId: x.productoColegioId! }));
      if (pares.length) await aprenderEquivalenciasIA(pares);
      avisar(
        (r.mensaje ?? "Guardado") +
          (creadosNuevos ? ` Se crearon ${creadosNuevos} producto${creadosNuevos === 1 ? "" : "s"} nuevo${creadosNuevos === 1 ? "" : "s"}: falta ponerles el precio de venta en Catálogo.` : ""),
      );
      setLista([]);
      setB(vacio);
      setObs("");
      setTotalBoleta("");
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
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,48rem)_360px]">
      {/* En celular la IA va arriba; en PC, a la derecha */}
      <div className="lg:sticky lg:top-6 lg:order-2">
        <PanelIA conectada={iaConectada} esAdmin={esAdmin} colegioId={colegioId} colegioNombre={colegioNombre} onLeida={alLeer} />
      </div>

      <div className="card p-5 lg:order-1">
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
          {b.ia && (
            <p className="mt-2 text-xs text-suave">
              En la boleta: <span className="font-mono">{b.ia.texto}</span>
              {b.ia.importe != null && ` · importe ${soles(b.ia.importe)}`}
            </p>
          )}

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
              Todavía no agregaste productos. Elige uno arriba, escribe la cantidad y toca &quot;Agregar a la entrega&quot;
              {iaConectada ? ", o usa «Llenar con IA»." : "."}
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
                    const i = info(x);
                    if (!i) return null;
                    const c = calcular(i.presentacion, x);
                    const unidad = i.presentacion === "UNIDAD";
                    const caja = (NOMBRE_PRESENTACION[i.presentacion] ?? "Caja").toLowerCase();
                    const partes = [
                      x.cajas ? `${x.cajas} ${caja}${x.cajas === 1 ? "" : "s"} × ${x.porCaja}` : "",
                      x.sueltas ? `${x.sueltas} ${unidad ? "unidades" : "sueltas"}` : "",
                    ].filter(Boolean);
                    const difiere = x.ia?.importe != null && noCuadra(c.costo, x.ia.importe);
                    const revisar = (x.ia && x.ia.confianza !== "ALTA") || difiere;
                    return (
                      <tr key={x.clave} className={revisar ? "bg-ambar-50/50" : ""}>
                        <td>
                          <span className="flex items-center gap-2.5">
                            <Inicial nombre={i.producto} />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">{i.producto}</span>
                                {x.nuevo &&
                                  (x.nuevo.productoId ? (
                                    <span className="chip bg-[#e8f0fb] text-[#2b5ea7]">Se agrega a este colegio</span>
                                  ) : (
                                    <span className="chip bg-[#f1ebfa] text-[#6a3fb0]">Nuevo</span>
                                  ))}
                                {x.ia && x.ia.confianza !== "ALTA" && <span className="chip bg-ambar-50 text-[#8a5a00]">Revisar</span>}
                              </span>
                              {x.ia && (
                                <span className="block text-xs text-suave">
                                  <Sparkles className="mr-0.5 inline h-3 w-3" />
                                  {x.ia.texto}
                                  {x.ia.aprendida && " · ya aprendido"}
                                </span>
                              )}
                              {x.ia?.nota && <span className="block text-xs text-[#8a5a00]">{x.ia.nota}</span>}
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-suave">
                          {partes.join(" + ")} · {soles(x.costo)} c/{unidad ? "unid." : caja}
                        </td>
                        <td className="text-right font-medium tabular-nums">{numero(c.unidades)}</td>
                        <td className="text-right tabular-nums">
                          <span className="font-medium">{soles(c.costo)}</span>
                          {difiere && <span className="block text-xs text-[#8a5a00]">boleta {soles(x.ia!.importe!)}</span>}
                        </td>
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
                              onClick={() => setLista((l) => l.filter((y) => y.clave !== x.clave))}
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
          {porCrear.some((x) => !x.nuevo!.productoId) && (
            <p className="mt-2 text-xs text-suave">
              Los marcados «Nuevo» se crean en el catálogo al registrar (solo para {colegioNombre}, con precio de venta S/ 0 hasta que administración lo ponga).
              Si en realidad ya existe, tócalo con el lápiz y elígelo de la lista.
            </p>
          )}
        </div>

        <div className={`mt-4 grid gap-3 ${usoIA || boleta != null ? "sm:grid-cols-[1fr_180px]" : ""}`}>
          <label className="block">
            <span className="label">Observación</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)} className="input" placeholder="Ej: Guía 0012, proveedor..." />
          </label>
          {(usoIA || boleta != null) && (
            <label className="block">
              <span className="label">Total de la boleta (S/)</span>
              <input
                inputMode="decimal"
                value={totalBoleta}
                onChange={(e) => setTotalBoleta(soloDecimal(e.target.value))}
                className="input tabular-nums"
                placeholder="Para cuadrar"
              />
            </label>
          )}
        </div>

        {/* ---------- Total acumulado y registrar ---------- */}
        <div className="mt-5 rounded-xl bg-panel p-4 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              {lista.length} producto{lista.length === 1 ? "" : "s"} · <b>{numero(total.unidades)}</b> unidades · total{" "}
              <b className="text-lg">{soles(total.costo)}</b>
            </p>
            <button onClick={guardar} disabled={pendiente || lista.length === 0} className="btn-primario">
              <Send className="h-4 w-4" />
              {pendiente ? "Registrando..." : "Registrar entrega"}
            </button>
          </div>
          {/* Cuadre con la boleta: solo avisa, no obliga */}
          {boleta != null && Number.isFinite(boleta) && lista.length > 0 && (
            <p
              className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                noCuadra(total.costo, boleta) ? "bg-ambar/20 text-[#ffd48a]" : "bg-verde/20 text-[#9be3a6]"
              }`}
            >
              {noCuadra(total.costo, boleta) ? (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No cuadra: la boleta dice {soles(boleta)} y la lista suma {soles(total.costo)} ({total.costo > boleta ? "sobran" : "faltan"}{" "}
                  {soles(Math.abs(total.costo - boleta))}). Revisa las líneas en ámbar.
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> Cuadra con la boleta: {soles(boleta)}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {editandoNuevo && (
        <HojaPorCrear
          linea={editandoNuevo}
          categorias={categorias}
          disponibles={disponibles.filter((s) => !lista.some((x) => x.productoColegioId === s.id))}
          colegioNombre={colegioNombre}
          onCerrar={() => setEditandoNuevo(null)}
          onGuardar={(nueva) => {
            setLista((l) => l.map((y) => (y.clave === nueva.clave ? nueva : y)));
            setEditandoNuevo(null);
          }}
        />
      )}
    </div>
  );
}

/** Corregir un producto que todavía no está en este colegio, o decir que en realidad es uno que ya existe */
function HojaPorCrear({
  linea,
  categorias,
  disponibles,
  colegioNombre,
  onCerrar,
  onGuardar,
}: {
  linea: Agregado;
  categorias: { id: number; nombre: string }[];
  disponibles: ItemStock[];
  colegioNombre: string;
  onCerrar: () => void;
  onGuardar: (a: Agregado) => void;
}) {
  const nv = linea.nuevo!;
  const [existente, setExistente] = useState<number | null>(null);
  const [nombre, setNombre] = useState(nv.nombre);
  const [categoriaId, setCategoriaId] = useState<number | null>(nv.categoriaId);
  const [presentacion, setPresentacion] = useState<Presentacion>(nv.presentacion);
  const [cajas, setCajas] = useState(linea.cajas ? String(linea.cajas) : "");
  const [porCaja, setPorCaja] = useState(String(linea.porCaja));
  const [sueltas, setSueltas] = useState(linea.sueltas ? String(linea.sueltas) : "");
  const [costo, setCosto] = useState(String(linea.costo));
  const yaExiste = !!nv.productoId;
  const unidad = presentacion === "UNIDAD";
  const elegido = disponibles.find((d) => d.id === existente);

  function guardar() {
    // Era uno que ya está en este colegio: pasa a ser una línea normal
    if (elegido) {
      const esU = elegido.presentacion === "UNIDAD";
      const pc = unidad ? 1 : n(porCaja) || 1;
      const totalU = (unidad ? 0 : n(cajas) * pc) + n(sueltas);
      const costoU = unidad ? n(costo) : n(costo) / pc;
      const base = { clave: linea.clave, productoColegioId: elegido.id, ia: linea.ia };
      // Por unidad en este colegio: todo a unidades sueltas
      if (esU) return onGuardar({ ...base, cajas: 0, porCaja: 1, sueltas: totalU, costo: Math.round(costoU * 10000) / 10000 });
      // Se compró por unidad pero aquí va en caja/paquete: sueltas, con el costo pasado a la caja de este colegio
      if (unidad) {
        const u = elegido.unidadesPorPresentacion;
        return onGuardar({ ...base, cajas: 0, porCaja: u, sueltas: totalU, costo: Math.round(costoU * u * 100) / 100 });
      }
      return onGuardar({ ...base, cajas: n(cajas), porCaja: pc, sueltas: n(sueltas), costo: n(costo) });
    }
    if (mayusculas(nombre).length < 2) return avisar("Escribe el nombre del producto.", "error");
    if (!yaExiste && !categoriaId) return avisar("Elige la categoría.", "error");
    if (!unidad && n(cajas) > 0 && n(porCaja) < 1) return avisar("Indica cuántas unidades trae cada una.", "error");
    if ((unidad ? 0 : n(cajas) * n(porCaja)) + n(sueltas) <= 0) return avisar("Escribe la cantidad.", "error");
    onGuardar({
      ...linea,
      cajas: unidad ? 0 : n(cajas),
      porCaja: unidad ? 1 : n(porCaja) || 1,
      sueltas: unidad ? n(cajas) * (n(porCaja) || 1) + n(sueltas) : n(sueltas),
      costo: n(costo),
      nuevo: { ...nv, nombre: mayusculas(nombre), categoriaId, presentacion },
    });
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={yaExiste ? "Producto de otro colegio" : "Producto nuevo"}
      subtitulo={linea.ia ? `En la boleta: ${linea.ia.texto}` : undefined}
    >
      <div className="grid gap-3">
        <div className="rounded-xl border border-borde p-3">
          <p className="label">¿Ya existe en {colegioNombre}? Elígelo</p>
          <BuscadorProducto
            opciones={disponibles.map((s) => ({
              id: s.id,
              nombre: s.producto,
              stock: s.total,
              minimo: s.minimo,
              detalle: descPresentacion(s.presentacion, s.unidadesPorPresentacion),
            }))}
            valor={existente}
            onElegir={setExistente}
          />
          <p className="mt-1.5 text-xs text-suave">
            {elegido ? `Se registra como ${elegido.producto} y la IA lo recordará.` : "Si no está, déjalo vacío y se crea con los datos de abajo."}
          </p>
        </div>

        {!elegido && (
          <>
            <label>
              <span className="label">Nombre</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value.toUpperCase())}
                disabled={yaExiste}
                className="input uppercase"
              />
              {yaExiste && <span className="mt-1 block text-xs text-suave">Ya existe en otro colegio: se agrega a {colegioNombre} con el mismo precio de venta.</span>}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {!yaExiste && (
                <label>
                  <span className="label">Categoría</span>
                  <select value={categoriaId ?? ""} onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)} className="input">
                    <option value="">Elegir…</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span className="label">Cómo se compra</span>
                <select value={presentacion} onChange={(e) => setPresentacion(e.target.value as Presentacion)} className="input">
                  {PRESENTACIONES_COMPRA.map((p) => (
                    <option key={p} value={p}>
                      {p === "UNIDAD" ? "Por unidad" : NOMBRE_PRESENTACION[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        <div className={`grid gap-3 ${unidad ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
          {!unidad && (
            <>
              <label>
                <span className="label">Cantidad</span>
                <input inputMode="numeric" value={cajas} onChange={(e) => setCajas(soloDigitos(e.target.value))} className="input text-base" />
              </label>
              <label>
                <span className="label">Unidades c/u</span>
                <input inputMode="numeric" value={porCaja} onChange={(e) => setPorCaja(soloDigitos(e.target.value))} className="input text-base" />
              </label>
            </>
          )}
          <label>
            <span className="label">{unidad ? "Unidades" : "Sueltas"}</span>
            <input inputMode="numeric" value={sueltas} onChange={(e) => setSueltas(soloDigitos(e.target.value))} className="input text-base" />
          </label>
          <label>
            <span className="label">Costo c/{unidad ? "unid." : (NOMBRE_PRESENTACION[presentacion] ?? "caja").toLowerCase()} (S/)</span>
            <input inputMode="decimal" value={costo} onChange={(e) => setCosto(soloDecimal(e.target.value))} className="input text-base" />
          </label>
        </div>
        {!elegido && !yaExiste && <p className="text-xs text-suave">Se crea solo para {colegioNombre}. El precio de venta lo pone administración en Catálogo.</p>}

        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
          <button onClick={guardar} className="btn-primario">
            Listo
          </button>
        </div>
      </div>
    </Modal>
  );
}
