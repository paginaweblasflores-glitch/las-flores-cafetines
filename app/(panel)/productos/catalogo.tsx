"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Search, FolderPlus, Plus } from "lucide-react";
import { crearCategoria, crearProducto, editarProducto } from "@/app/actions/catalogo";
import { avisar, Inicial, Modal } from "@/components/ui";
import { BarraPaginacion, usePaginacion } from "@/components/paginacion";
import { NOMBRE_PRESENTACION, normalizar, pct, soles } from "@/lib/format";
import type { Categoria, Presentacion } from "@/lib/types";

type Producto = { id: number; nombre: string; categoria_id: number | null; activo: boolean; perecible: boolean };
/** En qué colegio se vende cada producto, si está activo allí y a qué precio (cada colegio tiene el suyo) */
type Presencia = { colegioId: number; productoId: number; activo: boolean; precio: number };

export function Catalogo({
  colegios,
  categorias,
  productos,
  presencias,
  verGanancia = true,
}: {
  colegios: { id: number; nombre: string }[];
  categorias: Categoria[];
  productos: Producto[];
  presencias: Presencia[];
  /** Solo administración ve la ganancia por unidad */
  verGanancia?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [cat, setCat] = useState("");
  const [estado, setEstado] = useState<"" | "activos" | "inactivos">("");
  const [editando, setEditando] = useState<Producto | null>(null);
  const [nuevaCat, setNuevaCat] = useState(false);
  const [nuevo, setNuevo] = useState(false);

  const nombreCat = (id: number | null) => categorias.find((c) => c.id === id)?.nombre ?? "Sin categoría";
  const corto = (n: string) => n.replace(/^Colegio\s+/i, "");
  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return productos.filter(
      (p) =>
        (!cat || String(p.categoria_id) === cat) &&
        (!estado || (estado === "activos" ? p.activo : !p.activo)) &&
        (!q || normalizar(p.nombre).includes(q)),
    );
  }, [productos, busqueda, cat, estado]);
  const pag = usePaginacion(visibles.length, `${busqueda}|${cat}|${estado}`);

  return (
    <>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-borde p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto..." className="input pl-10" />
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="input w-auto min-w-44 flex-none">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className="input w-auto min-w-32 flex-none">
            <option value="">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
          <button onClick={() => setNuevaCat(true)} className="btn-secundario">
            <FolderPlus className="h-4 w-4" /> Nueva categoría
          </button>
          <button onClick={() => setNuevo(true)} className="btn-primario">
            <Plus className="h-4 w-4" /> Nuevo producto
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Se vende en</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pag.cortar(visibles).map((p) => {
                const donde = colegios
                  .map((c) => ({ c, pr: presencias.find((x) => x.colegioId === c.id && x.productoId === p.id) }))
                  .filter((x) => x.pr);
                return (
                  <tr key={p.id} className={p.activo ? "" : "opacity-60"}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Inicial nombre={p.nombre} />
                        <p className="flex items-center gap-2 font-medium">
                          {p.nombre}
                          {p.perecible && <span className="chip bg-ambar-50 text-[#8a5a00]">Del día</span>}
                        </p>
                      </div>
                    </td>
                    <td className="text-suave">{nombreCat(p.categoria_id)}</td>
                    <td>
                      {donde.length === 0 ? (
                        <span className="text-xs text-suave">Ningún colegio</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {donde.map(({ c, pr }) => (
                            <span
                              key={c.id}
                              className={`chip ${pr!.activo ? "bg-fondo text-tinta" : "bg-fondo text-suave line-through"}`}
                              title={pr!.activo ? "Activo en este colegio" : "Desactivado en este colegio"}
                            >
                              {corto(c.nombre)} · {soles(pr!.precio)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`chip ${p.activo ? "bg-verde-50 text-verde-700" : "bg-fondo text-suave"}`}>
                        {p.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="text-right">
                      <button onClick={() => setEditando(p)} className="btn-fantasma" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <BarraPaginacion p={pag} etiqueta="productos" />
      </div>

      {editando && (
        <ModalProducto
          producto={editando}
          categorias={categorias}
          colegios={colegios}
          activosEn={presencias.filter((x) => x.productoId === editando.id && x.activo).map((x) => x.colegioId)}
          preciosActuales={Object.fromEntries(presencias.filter((x) => x.productoId === editando.id).map((x) => [x.colegioId, x.precio]))}
          onCerrar={() => setEditando(null)}
        />
      )}
      {nuevaCat && <ModalCategoria onCerrar={() => setNuevaCat(false)} />}
      {nuevo && <ModalNuevoProducto colegios={colegios} categorias={categorias} verGanancia={verGanancia} onCerrar={() => setNuevo(false)} />}
    </>
  );
}

function ModalProducto({
  producto,
  categorias,
  colegios,
  activosEn,
  preciosActuales,
  onCerrar,
}: {
  producto: Producto;
  categorias: Categoria[];
  colegios: { id: number; nombre: string }[];
  activosEn: number[];
  /** Precio de venta actual en cada colegio donde existe el producto */
  preciosActuales: Record<number, number>;
  onCerrar: () => void;
}) {
  const [elegidos, setElegidos] = useState<number[]>(activosEn);
  // Un colegio nuevo empieza con el precio de otro colegio (se puede cambiar)
  const precioBase = Object.values(preciosActuales)[0];
  const [precios, setPrecios] = useState<Record<number, string>>(() =>
    Object.fromEntries(colegios.map((c) => [c.id, String(preciosActuales[c.id] ?? precioBase ?? "")])),
  );
  const preciosValidos = elegidos.every((id) => (precios[id] ?? "").trim() !== "" && Number(precios[id]) >= 0);
  const alternar = (id: number) => setElegidos((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const nuevos = elegidos.filter((id) => !activosEn.includes(id));
  const quitados = activosEn.filter((id) => !elegidos.includes(id));
  const [nombre, setNombre] = useState(producto.nombre);
  const [categoriaId, setCategoriaId] = useState(String(producto.categoria_id ?? ""));
  const [activo, setActivo] = useState(producto.activo);
  const [perecible, setPerecible] = useState(producto.perecible);
  const [pendiente, iniciar] = useTransition();
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Editar producto" subtitulo="Nombre, categoría, en qué colegios se vende y a qué precio">
      <div className="space-y-3">
        <label className="block">
          <span className="label">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="label">Categoría</span>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input">
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="label">Se vende en</span>
          <div className="flex flex-wrap gap-2">
            {colegios.map((c) => {
              const marcado = elegidos.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm " +
                    (marcado ? "border-verde bg-verde-50" : "border-borde")
                  }
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={marcado} onChange={() => alternar(c.id)} className="accent-verde" />
                    {c.nombre}
                  </label>
                  {marcado && (
                    <label className="flex items-center gap-2 text-xs text-suave">
                      Precio S/
                      <input
                        type="number"
                        min="0"
                        step="0.05"
                        inputMode="decimal"
                        value={precios[c.id] ?? ""}
                        onChange={(e) => setPrecios((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="input h-9 w-24 py-1 text-center"
                        aria-label={`Precio de venta en ${c.nombre}`}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {nuevos.length > 0 && (
            <p className="mt-2 text-xs text-verde-700">
              Se agregará a {nuevos.map((id) => colegios.find((c) => c.id === id)?.nombre).join(", ")} con stock 0 y el precio
              que pongas. Luego registra su mercadería en Entregas.
            </p>
          )}
          {quitados.length > 0 && (
            <p className="mt-2 text-xs text-[#8a5a00]">
              Se dejará de vender en {quitados.map((id) => colegios.find((c) => c.id === id)?.nombre).join(", ")} (su historial se
              conserva).
            </p>
          )}
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-borde p-3 text-sm">
          <input type="checkbox" checked={perecible} onChange={(e) => setPerecible(e.target.checked)} className="mt-0.5 accent-verde" />
          <span>
            <span className="block font-medium">Se consume en el día</span>
            <span className="block text-xs text-suave">
              Empanadas, jugos, panes… Al final del día el personal puede registrar lo que sobró como merma.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="accent-verde" />
          Producto activo (si lo desactivas, desaparece de todos los colegios)
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="btn-secundario">Cancelar</button>
        <button
          disabled={pendiente || !preciosValidos}
          className="btn-primario"
          onClick={() =>
            iniciar(async () => {
              const r = await editarProducto(producto.id, {
                nombre,
                categoriaId: categoriaId ? Number(categoriaId) : null,
                activo,
                perecible,
                colegioIds: elegidos,
                precios: Object.fromEntries(elegidos.map((id) => [id, Number(precios[id])])),
              });
              if (r.ok) {
                avisar(r.mensaje ?? "Guardado");
                onCerrar();
              } else avisar(r.error, "error");
            })
          }
        >
          {pendiente ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

function ModalCategoria({ onCerrar }: { onCerrar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Nueva categoría">
      <label className="block">
        <span className="label">Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" placeholder="Ej: Helados" autoFocus />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="btn-secundario">Cancelar</button>
        <button
          disabled={pendiente}
          className="btn-primario"
          onClick={() =>
            iniciar(async () => {
              const r = await crearCategoria(nombre);
              if (r.ok) {
                avisar(r.mensaje ?? "Guardado");
                onCerrar();
              } else avisar(r.error, "error");
            })
          }
        >
          Crear
        </button>
      </div>
    </Modal>
  );
}

function ModalNuevoProducto({
  colegios,
  categorias,
  verGanancia,
  onCerrar,
}: {
  colegios: { id: number; nombre: string }[];
  categorias: Categoria[];
  verGanancia: boolean;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState(String(categorias[0]?.id ?? ""));
  const [elegidos, setElegidos] = useState<number[]>(colegios.map((c) => c.id));
  const [presentacion, setPresentacion] = useState<Presentacion>("UNIDAD");
  const [porCaja, setPorCaja] = useState("1");
  const [costo, setCosto] = useState("");
  // Precio por colegio. Lo que se escribe en uno se copia a los que aún no se tocaron.
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [tocados, setTocados] = useState<number[]>([]);
  const [minimo, setMinimo] = useState("5");
  const [perecible, setPerecible] = useState(false);
  const [stockInicial, setStockInicial] = useState<Record<number, string>>({});
  const [pendiente, iniciar] = useTransition();

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const esUnidad = presentacion === "UNIDAD";
  const unidades = esUnidad ? 1 : n(porCaja);
  const costoUnit = unidades > 0 ? n(costo) / unidades : 0;
  const precioDe = (id: number) => precios[id] ?? "";
  const preciosListos = elegidos.length > 0 && elegidos.every((id) => precioDe(id).trim() !== "" && n(precioDe(id)) >= 0);
  const cambiarPrecio = (id: number, v: string) => {
    setTocados((t) => (t.includes(id) ? t : [...t, id]));
    setPrecios((p) => {
      const nuevo = { ...p, [id]: v };
      for (const c of colegios) if (c.id !== id && !tocados.includes(c.id)) nuevo[c.id] = v;
      return nuevo;
    });
  };
  /** Ganancia por unidad con el precio de ese colegio */
  const gananciaEn = (id: number) => {
    const precio = n(precioDe(id));
    const g = precio - costoUnit;
    const margen = precio > 0 && costoUnit > 0 ? Math.round((g / precio) * 1000) / 10 : null;
    return { g, margen };
  };
  const alternar = (id: number) =>
    setElegidos((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const nombreCaja = esUnidad ? "unidad" : NOMBRE_PRESENTACION[presentacion].toLowerCase();

  function crear() {
    iniciar(async () => {
      const r = await crearProducto({
        nombre,
        categoriaId: categoriaId ? Number(categoriaId) : null,
        perecible,
        colegioIds: elegidos,
        presentacion,
        unidadesPorPresentacion: unidades,
        costoPresentacion: n(costo),
        precios: Object.fromEntries(elegidos.map((id) => [id, n(precioDe(id))])),
        stockMinimo: n(minimo),
        stockInicial: Object.fromEntries(elegidos.map((id) => [id, n(stockInicial[id] ?? "")])),
      });
      if (r.ok) {
        avisar(r.mensaje ?? "Producto creado");
        onCerrar();
      } else avisar(r.error, "error");
    });
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Nuevo producto"
      subtitulo="Se crea una sola vez y queda en los colegios que marques"
      ancho="max-w-xl"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 sm:col-span-1">
          <span className="label">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" placeholder="Ej: Galleta Oreo" autoFocus />
        </label>
        <label className="col-span-2 sm:col-span-1">
          <span className="label">Categoría</span>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input">
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3">
        <label className="flex items-start gap-2 rounded-xl border border-borde p-3 text-sm">
          <input type="checkbox" checked={perecible} onChange={(e) => setPerecible(e.target.checked)} className="mt-0.5 accent-verde" />
          <span>
            <span className="block font-medium">Se consume en el día</span>
            <span className="block text-xs text-suave">
              Empanadas, jugos, panes… Al final del día el personal puede registrar lo que sobró como merma.
            </span>
          </span>
        </label>
      </div>

      <p className="mt-4 mb-2 text-sm font-medium">¿En qué colegios se venderá?</p>
      <div className="space-y-2">
        {colegios.map((c) => {
          const marcado = elegidos.includes(c.id);
          return (
            <div
              key={c.id}
              className={
                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 " +
                (marcado ? "border-verde bg-verde-50" : "border-borde")
              }
            >
              <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={marcado} onChange={() => alternar(c.id)} className="accent-verde" />
                {c.nombre}
              </label>
              {marcado && (
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-suave">
                  <label className="flex items-center gap-2">
                    Precio S/
                    <input
                      type="number"
                      min="0"
                      step="0.05"
                      inputMode="decimal"
                      value={precioDe(c.id)}
                      onChange={(e) => cambiarPrecio(c.id, e.target.value)}
                      placeholder="0.00"
                      className="input h-9 w-20 py-1 text-center"
                      aria-label={`Precio de venta en ${c.nombre}`}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Stock inicial
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={stockInicial[c.id] ?? ""}
                      onChange={(e) => setStockInicial((s) => ({ ...s, [c.id]: e.target.value }))}
                      placeholder="0"
                      className="input h-9 w-20 py-1 text-center"
                      aria-label={`Stock inicial en ${c.nombre}`}
                    />
                  </label>
                  {verGanancia && precioDe(c.id).trim() !== "" && costoUnit > 0 && (
                    <span className={`w-full text-right ${gananciaEn(c.id).g < 0 ? "text-rojo" : ""}`}>
                      Ganancia por unidad {soles(gananciaEn(c.id).g)} ({pct(gananciaEn(c.id).margen)})
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 mb-2 text-sm font-medium">Compra y venta</p>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Cómo se compra</span>
          <select
            value={presentacion}
            onChange={(e) => {
              const v = e.target.value as Presentacion;
              setPresentacion(v);
              setPorCaja(v === "UNIDAD" ? "1" : "");
            }}
            className="input"
          >
            {Object.entries(NOMBRE_PRESENTACION).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {!esUnidad ? (
          <label>
            <span className="label">¿Cuántas unidades trae cada {nombreCaja}?</span>
            <input type="number" min="1" value={porCaja} onChange={(e) => setPorCaja(e.target.value)} className="input" />
          </label>
        ) : (
          <div className="hidden sm:block" />
        )}
        <label>
          <span className="label">Costo por {nombreCaja} (S/)</span>
          <input type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} className="input" />
        </label>
        <label>
          <span className="label">Stock mínimo (avisar al llegar a)</span>
          <input type="number" min="0" value={minimo} onChange={(e) => setMinimo(e.target.value)} className="input" />
        </label>
        <div className="rounded-xl bg-fondo px-3 py-2 text-xs text-suave">
          Costo por unidad: <b className="text-tinta">{soles(costoUnit)}</b>
          <br />
          El precio de venta va en cada colegio (arriba).
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-verde-50 px-3 py-2 text-xs text-verde-700">
        Cada colegio tiene su propio precio: lo que escribes en uno se copia a los demás hasta que lo cambies. Si no pones
        stock inicial, empieza en 0 y la mercadería se registra después en <b>Entregas</b>.
      </p>

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="btn-secundario">
          Cancelar
        </button>
        <button
          disabled={pendiente || nombre.trim().length < 2 || !preciosListos || !(Number.isInteger(unidades) && unidades >= 1)}
          className="btn-primario"
          onClick={crear}
        >
          {pendiente ? "Creando..." : "Crear producto"}
        </button>
      </div>
    </Modal>
  );
}
