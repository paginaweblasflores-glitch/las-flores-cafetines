"use client";

import { useState } from "react";
import { CheckCircle2, PackagePlus, Save, Search } from "lucide-react";
import { crearProductoArranque, registrarArranque } from "@/app/actions/personal";
import { avisar, Inicial, Modal } from "@/components/ui";
import { bajoDeBarra, useTecladoAbierto } from "@/components/navegacion-inferior";
import { buscarPorNombre, litrosTexto, mayusculas, numero, partesPorEnvase } from "@/lib/format";
import type { ProductoConteo } from "./conteo";

/**
 * Inventario de arranque: el personal escribe cuántas hay de verdad de cada producto que se guarda.
 * Se puede hacer por partes (en varios días): lo guardado sale de la lista y lo demás sigue.
 * Si tiene algo que no está en el sistema, lo crea aquí mismo.
 */
export function InventarioArranque({
  productos,
  total,
  categorias,
}: {
  /** Los que faltan registrar */
  productos: ProductoConteo[];
  /** Cuántos productos entran en el inventario (registrados + faltan) */
  total: number;
  categorias: { id: number; nombre: string }[];
}) {
  const teclado = useTecladoAbierto();
  const [busqueda, setBusqueda] = useState("");
  // Lo escrito: producto → vasos/unidades (texto)
  const [hay, setHay] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [creando, setCreando] = useState(false);

  const lista = buscarPorNombre(productos, busqueda, (p) => p.nombre);
  const escritos = productos.filter((p) => (hay[p.id] ?? "").trim() !== "");
  const hechos = total - productos.length;

  async function guardar() {
    if (!escritos.length || guardando) return;
    setGuardando(true);
    const r = await registrarArranque(escritos.map((p) => ({ id: p.id, unidades: Number(hay[p.id]) })));
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(`${r.guardados} producto${r.guardados === 1 ? "" : "s"} registrado${r.guardados === 1 ? "" : "s"} en el inventario`);
    setHay({});
  }

  return (
    <div className="pt-1" style={{ paddingBottom: escritos.length ? "6rem" : undefined }}>
      <div className="rounded-2xl bg-verde-50 px-4 py-3 text-sm text-verde-700">
        <p className="font-semibold">
          {productos.length ? `Faltan ${productos.length} de ${total}` : "¡Inventario completo!"}
          {hechos > 0 && productos.length > 0 && <span className="font-normal"> · ya registraste {hechos}</span>}
        </p>
        <p className="mt-0.5 text-xs">
          Escribe cuántas hay de verdad en tu almacén. Puedes hacerlo por partes, en varios días: lo que guardas sale de la lista. No es venta.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setCreando(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-campo bg-white px-4 py-3 text-sm font-medium text-tinta active:bg-fondo"
      >
        <PackagePlus className="h-4 w-4" /> Tengo un producto que no está en la lista
      </button>

      {productos.length > 0 && (
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto..." className="input py-3 pl-10 text-base" />
        </div>
      )}

      {productos.length === 0 ? (
        <div className="card mt-3 flex flex-col items-center px-6 py-10 text-center">
          <CheckCircle2 className="mb-2 h-10 w-10 text-verde-700" />
          <p className="font-medium">Registraste los {total} productos</p>
          <p className="mt-1 text-sm text-suave">El sistema ya tiene lo mismo que tu almacén. Desde ahora cuenta como siempre.</p>
        </div>
      ) : (
        <ul className="card mt-3 divide-y divide-borde overflow-hidden">
          {lista.map((p) => (
            <FilaArranque key={p.id} p={p} valor={hay[p.id] ?? ""} cambiar={(v) => setHay((h) => ({ ...h, [p.id]: v }))} />
          ))}
          {lista.length === 0 && <li className="px-4 py-8 text-center text-sm text-suave">No hay productos con &quot;{busqueda}&quot;.</li>}
        </ul>
      )}

      {escritos.length > 0 && (
        <div className="fixed inset-x-0 z-20 border-t border-borde bg-white/95 backdrop-blur" style={{ bottom: bajoDeBarra(teclado) }}>
          <div className="mx-auto max-w-3xl px-4 py-3">
            <button onClick={guardar} disabled={guardando} className="btn-primario h-12 w-full text-base">
              <Save className="h-4 w-4" />
              {guardando ? "Guardando..." : `Guardar ${escritos.length} producto${escritos.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {creando && <HojaProductoNuevo categorias={categorias} cerrar={() => setCreando(false)} />}
    </div>
  );
}

/** Una fila: nombre, lo que dice el sistema y la casilla "¿cuántas hay?" (en litros si es bebida en litros) */
function FilaArranque({ p, valor, cambiar }: { p: ProductoConteo; valor: string; cambiar: (v: string) => void }) {
  const enLitros = p.presentacion === "LITRO" && p.unidadesPorPresentacion > 0;
  const porLitro = enLitros ? partesPorEnvase("LITRO", p.unidadesPorPresentacion) : 1;
  const [litros, setLitros] = useState(valor === "" ? "" : litrosTexto(Number(valor) / porLitro));
  return (
    <li className={`flex items-center gap-3 px-3.5 py-2.5 ${valor !== "" ? "bg-verde-50/60" : ""}`}>
      <Inicial nombre={p.nombre} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{p.nombre}</p>
        <p className="text-xs text-suave">
          El sistema dice {enLitros ? `${litrosTexto(p.stock / porLitro)} L` : numero(p.stock)}
          {p.unidadesPorPresentacion > 1 && !enLitros ? " · en unidades" : ""}
        </p>
      </div>
      <div className="flex w-24 shrink-0 items-center gap-1">
        <input
          inputMode={enLitros ? "decimal" : "numeric"}
          value={enLitros ? litros : valor}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            if (!enLitros) return cambiar(e.target.value.replace(/\D/g, ""));
            const limpio = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
            const [ent, ...dec] = limpio.split(".");
            const v = dec.length ? `${ent}.${dec.join("").slice(0, 2)}` : ent;
            setLitros(v);
            cambiar(v === "" ? "" : String(Math.round(Number(v) * porLitro)));
          }}
          placeholder="¿Hay?"
          className="input h-11 px-2 text-center text-lg font-semibold placeholder:text-sm placeholder:font-normal"
          aria-label={`Cuántas hay de ${p.nombre}`}
        />
        {enLitros && <span className="text-xs text-suave">L</span>}
      </div>
    </li>
  );
}

/** Producto que el cafetín tiene y no está en el sistema: nombre, categoría, cuántas hay y precio */
function HojaProductoNuevo({ categorias, cerrar }: { categorias: { id: number; nombre: string }[]; cerrar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [hay, setHay] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const n = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const listo =
    mayusculas(nombre).length >= 2 && categoriaId !== "" && Number.isInteger(n(hay)) && n(hay) >= 0 && Number.isFinite(n(precio)) && n(precio) > 0;

  async function guardar() {
    if (!listo || guardando) return;
    setGuardando(true);
    const r = await crearProductoArranque({ nombre, categoriaId: Number(categoriaId), unidades: n(hay), precio: n(precio) });
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(r.mensaje);
    cerrar();
  }

  return (
    <Modal abierto onCerrar={() => !guardando && cerrar()} titulo="Producto que no está en la lista" subtitulo="Se crea solo para tu cafetín">
      <div className="grid gap-3">
        <label className="block">
          <span className="label">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} className="input uppercase" placeholder="Ej: GALLETA OREO" autoFocus />
        </label>
        <label className="block">
          <span className="label">Categoría</span>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input">
            <option value="">Elegir…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">¿Cuántas hay?</span>
            <input inputMode="numeric" value={hay} onChange={(e) => setHay(e.target.value.replace(/\D/g, ""))} className="input h-12 text-center text-lg font-semibold" placeholder="0" />
          </label>
          <label className="block">
            <span className="label">Precio de venta (S/)</span>
            <input
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
              className="input h-12 text-center text-lg font-semibold"
              placeholder="0.00"
            />
          </label>
        </div>
        <p className="text-xs text-suave">Por unidad. El costo y cómo se compra los completa administración.</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={guardar} disabled={!listo || guardando} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
