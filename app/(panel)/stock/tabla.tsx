"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Truck, SlidersHorizontal, Pencil, Boxes } from "lucide-react";
import {
  actualizarProductoColegio,
  ajustarStock,
  registrarIngresos,
  type DatosProductoColegio,
} from "@/app/actions/inventario";
import { avisar, Inicial, Modal, Vacio } from "@/components/ui";
import { BarraPaginacion, usePaginacion } from "@/components/paginacion";
import { descPresentacion, fechaHoraLima, hoyISO, NOMBRE_PRESENTACION, normalizar, numero, pct, soles } from "@/lib/format";
import type { Categoria, Presentacion, StockRow } from "@/lib/types";

/** verGanancia: solo administración ve ganancia y margen */
export function TablaStock({
  filas,
  categorias,
  verGanancia = true,
}: {
  filas: StockRow[];
  categorias: Categoria[];
  verGanancia?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [cat, setCat] = useState<string>("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [soloBajos, setSoloBajos] = useState(false);
  const [orden, setOrden] = useState<"recientes" | "nombre" | "stock">("recientes");
  const [modal, setModal] = useState<{ tipo: "ingreso" | "ajuste" | "editar"; fila: StockRow } | null>(null);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    const lista = filas.filter(
      (f) =>
        (verInactivos || (f.activo && f.producto_activo)) &&
        (!cat || String(f.categoria_id) === cat) &&
        (!soloBajos || f.stock_bajo) &&
        (!q || normalizar(f.producto).includes(q)),
    );
    // Más recientes = último movimiento primero (venta contada, entrega, ajuste, cambio de precio)
    const comparar: Record<typeof orden, (a: StockRow, b: StockRow) => number> = {
      recientes: (a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0),
      nombre: (a, b) => a.producto.localeCompare(b.producto, "es"),
      stock: (a, b) => a.total_unidades - b.total_unidades || a.producto.localeCompare(b.producto, "es"),
    };
    return [...lista].sort(comparar[orden]);
  }, [filas, busqueda, cat, verInactivos, soloBajos, orden]);

  const tot = visibles.reduce(
    (a, f) => ({
      unidades: a.unidades + f.total_unidades,
      costo: a.costo + Number(f.valor_costo_stock),
      venta: a.venta + Number(f.valor_venta_stock),
    }),
    { unidades: 0, costo: 0, venta: 0 },
  );
  const cerrar = () => setModal(null);
  const pag = usePaginacion(visibles.length, `${busqueda}|${cat}|${verInactivos}|${soloBajos}|${orden}`);

  return (
    <>
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-borde p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto..."
              className="input pl-10"
            />
          </div>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as typeof orden)}
            className="input lg:w-44"
            aria-label="Ordenar"
          >
            <option value="recientes">Más recientes</option>
            <option value="nombre">Nombre (A–Z)</option>
            <option value="stock">Menos stock</option>
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="input lg:w-48">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-suave">
            <input type="checkbox" checked={soloBajos} onChange={(e) => setSoloBajos(e.target.checked)} className="accent-verde" />
            Solo por reponer
          </label>
          <label className="flex items-center gap-2 text-sm text-suave">
            <input
              type="checkbox"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
              className="accent-verde"
            />
            Ver inactivos
          </label>
        </div>

        {visibles.length === 0 ? (
          <Vacio icono={<Boxes className="h-6 w-6" />} titulo="No hay productos para mostrar" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Viene en</th>
                  <th className="text-right">Stock (unid.)</th>
                  <th className="text-right">Costo caja</th>
                  <th className="text-right">Costo und.</th>
                  <th className="text-right">Precio</th>
                  {verGanancia && <th className="text-right">Ganancia x unid.</th>}
                  {verGanancia && <th className="text-right">Margen</th>}
                  <th className="text-right">Valor stock</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pag.cortar(visibles).map((f) => (
                  <tr key={f.id} className={!f.activo || !f.producto_activo ? "opacity-50" : ""}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Inicial nombre={f.producto} />
                        <div className="min-w-0">
                          <p className="max-w-[190px] truncate font-medium" title={f.producto}>
                            {f.producto}
                          </p>
                          <p className="max-w-[190px] truncate text-xs text-suave" title={f.observacion ?? undefined}>
                            {f.categoria} · {fechaHoraLima(f.updated_at)}
                            {f.observacion ? ` · ${f.observacion}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-suave">{descPresentacion(f.presentacion, f.unidades_por_presentacion)}</td>
                    <td className="text-right">
                      <span
                        className={`chip ${
                          f.total_unidades === 0
                            ? "bg-rojo-50 text-rojo"
                            : f.stock_bajo
                              ? "bg-ambar-50 text-[#8a5a00]"
                              : "bg-verde-50 text-verde-700"
                        }`}
                      >
                        {numero(f.total_unidades)}
                      </span>
                    </td>
                    <td className="text-right text-suave">{Number(f.costo_presentacion) > 0 ? soles(f.costo_presentacion) : "—"}</td>
                    <td className="text-right text-suave">{Number(f.costo_unitario) > 0 ? soles(f.costo_unitario) : "—"}</td>
                    <td className="text-right font-medium">
                      {Number(f.precio_venta) > 0 ? soles(f.precio_venta) : <span className="text-rojo">Sin precio</span>}
                    </td>
                    {verGanancia && (
                    <td className="text-right">
                      {Number(f.costo_unitario) > 0 && Number(f.precio_venta) > 0 ? (
                        <span className={Number(f.ganancia_unitaria) < 0 ? "text-rojo" : "font-medium text-verde-700"}>
                          {soles(f.ganancia_unitaria)}
                        </span>
                      ) : (
                        <span className="text-suave">—</span>
                      )}
                    </td>
                    )}
                    {verGanancia && (
                    <td className="text-right">
                      {Number(f.costo_unitario) > 0 && f.margen_pct != null ? (
                        <span className={Number(f.margen_pct) < 0 ? "text-rojo" : "text-verde-600"}>{pct(f.margen_pct)}</span>
                      ) : (
                        <span className="text-suave">—</span>
                      )}
                    </td>
                    )}
                    <td className="text-right">{soles(f.valor_venta_stock)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setModal({ tipo: "ingreso", fila: f })} className="btn-fantasma" title="Registrar entrega">
                          <Truck className="h-4 w-4" />
                        </button>
                        <button onClick={() => setModal({ tipo: "ajuste", fila: f })} className="btn-fantasma" title="Ajustar stock / merma">
                          <SlidersHorizontal className="h-4 w-4" />
                        </button>
                        <button onClick={() => setModal({ tipo: "editar", fila: f })} className="btn-fantasma" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#fafbfa] font-semibold">
                  <td className="px-4 py-3" colSpan={2}>
                    Total ({visibles.length} productos)
                  </td>
                  <td className="px-4 py-3 text-right">{numero(tot.unidades)}</td>
                  <td className="px-4 py-3 text-right text-xs font-normal text-suave" colSpan={verGanancia ? 5 : 3}>
                    Costo del stock: <b className="text-tinta">{soles(tot.costo)}</b>
                    {verGanancia && (
                      <>
                        {" "}
                        · Ganancia posible: <b className="text-verde-600">{soles(tot.venta - tot.costo)}</b>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{soles(tot.venta)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <BarraPaginacion p={pag} etiqueta="productos" />
      </div>

      {modal?.tipo === "ingreso" && <ModalIngreso fila={modal.fila} onCerrar={cerrar} />}
      {modal?.tipo === "ajuste" && <ModalAjuste fila={modal.fila} onCerrar={cerrar} />}
      {modal?.tipo === "editar" && <ModalEditar fila={modal.fila} onCerrar={cerrar} verGanancia={verGanancia} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

const n = (v: string) => (v.trim() === "" ? 0 : Number(v));

function ModalIngreso({ fila, onCerrar }: { fila: StockRow; onCerrar: () => void }) {
  const [cajas, setCajas] = useState("");
  const [porCaja, setPorCaja] = useState(String(fila.unidades_por_presentacion));
  const [sueltas, setSueltas] = useState("");
  const [costo, setCosto] = useState(String(fila.costo_presentacion ?? ""));
  const [fecha, setFecha] = useState(hoyISO());
  const [obs, setObs] = useState("");
  const [pendiente, iniciar] = useTransition();
  const esUnidad = fila.presentacion === "UNIDAD";
  const total = n(cajas) * n(porCaja) + n(sueltas);
  const nombre = NOMBRE_PRESENTACION[fila.presentacion]?.toLowerCase();

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Registrar entrega" subtitulo={`${fila.producto} · ${fila.colegio}`}>
      <div className="grid grid-cols-2 gap-3">
        {!esUnidad && (
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <label>
              <span className="label">{NOMBRE_PRESENTACION[fila.presentacion]}s que se envían</span>
              <input type="number" min="0" inputMode="numeric" value={cajas} onChange={(e) => setCajas(e.target.value)} className="input" autoFocus />
            </label>
            <label>
              <span className="label">Unidades por {nombre}</span>
              <input type="number" min="1" inputMode="numeric" value={porCaja} onChange={(e) => setPorCaja(e.target.value)} className="input" />
            </label>
          </div>
        )}
        <label className={esUnidad ? "col-span-2" : ""}>
          <span className="label">{esUnidad ? "Unidades" : "Unidades sueltas"}</span>
          <input type="number" min="0" inputMode="numeric" value={sueltas} onChange={(e) => setSueltas(e.target.value)} className="input" autoFocus={esUnidad} />
        </label>
        <label>
          <span className="label">Costo por {esUnidad ? "unidad" : nombre} (S/)</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} className="input" />
        </label>
        <label>
          <span className="label">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input" />
        </label>
        <label className="col-span-2">
          <span className="label">Observación</span>
          <input value={obs} onChange={(e) => setObs(e.target.value)} className="input" placeholder="Opcional" />
        </label>
      </div>
      <p className="mt-4 rounded-xl bg-verde-50 px-3 py-2 text-sm text-verde-700">
        {!esUnidad && n(cajas) > 0 && (
          <>
            {n(cajas)} {nombre}
            {n(cajas) === 1 ? "" : "s"} × {n(porCaja)}
            {n(sueltas) > 0 ? ` + ${n(sueltas)} sueltas` : ""} ={" "}
          </>
        )}
        <b>{numero(total)}</b> unidades · stock nuevo: <b>{numero(fila.total_unidades + total)}</b>
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="btn-secundario">Cancelar</button>
        <button
          disabled={pendiente || !(total > 0) || (n(cajas) > 0 && !(n(porCaja) >= 1))}
          className="btn-primario"
          onClick={() =>
            iniciar(async () => {
              const r = await registrarIngresos(
                fecha,
                [
                  {
                    productoColegioId: fila.id,
                    cajas: esUnidad ? 0 : n(cajas),
                    unidadesPorCaja: n(porCaja),
                    sueltas: n(sueltas),
                    costo: costo === "" ? null : Number(costo),
                  },
                ],
                obs,
              );
              if (r.ok) {
                avisar(r.mensaje ?? "Guardado");
                onCerrar();
              } else avisar(r.error, "error");
            })
          }
        >
          {pendiente ? "Guardando..." : "Registrar entrega"}
        </button>
      </div>
    </Modal>
  );
}

function ModalAjuste({ fila, onCerrar }: { fila: StockRow; onCerrar: () => void }) {
  const [unidades, setUnidades] = useState(String(fila.total_unidades));
  const [tipo, setTipo] = useState<"AJUSTE" | "MERMA">("AJUSTE");
  const [motivo, setMotivo] = useState("");
  const [pendiente, iniciar] = useTransition();
  const nuevo = n(unidades);
  const dif = nuevo - fila.total_unidades;

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Ajustar stock" subtitulo={`${fila.producto} · ${fila.colegio}`}>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-fondo p-1">
        {(["AJUSTE", "MERMA"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`rounded-lg py-2 text-sm font-medium ${tipo === t ? "bg-white shadow-sm" : "text-suave"}`}
          >
            {t === "AJUSTE" ? "Corrección (conteo físico)" : "Merma (vencido / malogrado)"}
          </button>
        ))}
      </div>
      <p className="mb-3 text-sm text-suave">Escribe cuántas unidades hay realmente ahora (sueltas + las de cajas cerradas):</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2">
          <span className="label">Unidades en total</span>
          <input type="number" min="0" value={unidades} onChange={(e) => setUnidades(e.target.value)} className="input" />
        </label>
        <label className="col-span-2">
          <span className="label">Motivo *</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="input"
            placeholder={tipo === "MERMA" ? "Ej: 3 empanadas malogradas" : "Ej: conteo físico de fin de mes"}
          />
        </label>
      </div>
      <p
        className={`mt-4 rounded-xl px-3 py-2 text-sm ${dif === 0 ? "bg-fondo text-suave" : dif > 0 ? "bg-verde-50 text-verde-700" : "bg-rojo-50 text-rojo"}`}
      >
        Antes {numero(fila.total_unidades)} → ahora {numero(nuevo)} unidades ({dif > 0 ? "+" : ""}
        {numero(dif)})
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="btn-secundario">Cancelar</button>
        <button
          disabled={pendiente}
          className={tipo === "MERMA" ? "btn-peligro" : "btn-primario"}
          onClick={() =>
            iniciar(async () => {
              const r = await ajustarStock(fila.id, n(unidades), tipo, motivo);
              if (r.ok) {
                avisar(r.mensaje ?? "Guardado");
                onCerrar();
              } else avisar(r.error, "error");
            })
          }
        >
          {pendiente ? "Guardando..." : "Guardar ajuste"}
        </button>
      </div>
    </Modal>
  );
}

/* Campos de configuración compartidos por "Editar" y "Agregar" */
function CamposConfig({
  d,
  set,
  verGanancia = true,
}: {
  d: DatosProductoColegio;
  set: (cambio: Partial<DatosProductoColegio>) => void;
  verGanancia?: boolean;
}) {
  const costoUnit = d.presentacion === "UNIDAD" ? d.costoPresentacion : d.costoPresentacion / (d.unidadesPorPresentacion || 1);
  const margen = d.precioVenta > 0 && costoUnit > 0 ? ((d.precioVenta - costoUnit) / d.precioVenta) * 100 : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <label>
        <span className="label">Presentación de compra</span>
        <select value={d.presentacion} onChange={(e) => set({ presentacion: e.target.value as Presentacion })} className="input">
          {Object.entries(NOMBRE_PRESENTACION).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Unidades por caja/paquete</span>
        <input
          type="number"
          min="1"
          disabled={d.presentacion === "UNIDAD"}
          value={d.presentacion === "UNIDAD" ? 1 : d.unidadesPorPresentacion}
          onChange={(e) => set({ unidadesPorPresentacion: Number(e.target.value) })}
          className="input"
        />
      </label>
      <label>
        <span className="label">Costo por {d.presentacion === "UNIDAD" ? "unidad" : "caja/paquete"} (S/)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={d.costoPresentacion}
          onChange={(e) => set({ costoPresentacion: Number(e.target.value) })}
          className="input"
        />
      </label>
      <label>
        <span className="label">Precio de venta por unidad (S/)</span>
        <input
          type="number"
          min="0"
          step="0.05"
          value={d.precioVenta}
          onChange={(e) => set({ precioVenta: Number(e.target.value) })}
          className="input"
        />
      </label>
      <label>
        <span className="label">Stock mínimo (avisar al llegar a)</span>
        <input
          type="number"
          min="0"
          value={d.stockMinimo}
          onChange={(e) => set({ stockMinimo: Number(e.target.value) })}
          className="input"
        />
      </label>
      <div className="rounded-xl bg-fondo px-3 py-2 text-xs text-suave">
        Costo por unidad: <b className="text-tinta">{soles(costoUnit)}</b>
        {verGanancia && (
          <>
            <br />
            Ganancia por unidad: <b className="text-tinta">{soles(d.precioVenta - costoUnit)}</b> (
            {pct(margen == null ? null : Math.round(margen * 10) / 10)})
          </>
        )}
      </div>
      <label className="col-span-2">
        <span className="label">Observación</span>
        <input value={d.observacion} onChange={(e) => set({ observacion: e.target.value })} className="input" placeholder="Opcional" />
      </label>
    </div>
  );
}

function ModalEditar({ fila, onCerrar, verGanancia }: { fila: StockRow; onCerrar: () => void; verGanancia: boolean }) {
  const [d, setD] = useState<DatosProductoColegio>({
    presentacion: fila.presentacion,
    unidadesPorPresentacion: fila.unidades_por_presentacion,
    costoPresentacion: Number(fila.costo_presentacion),
    precioVenta: Number(fila.precio_venta),
    stockMinimo: fila.stock_minimo,
    activo: fila.activo,
    observacion: fila.observacion ?? "",
  });
  const [pendiente, iniciar] = useTransition();
  const set = (c: Partial<DatosProductoColegio>) => setD((x) => ({ ...x, ...c }));

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Editar producto en el colegio" subtitulo={`${fila.producto} · ${fila.colegio}`}>
      <CamposConfig d={d} set={set} verGanancia={verGanancia} />
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.activo} onChange={(e) => set({ activo: e.target.checked })} className="accent-verde" />
        Activo en este colegio (si lo desactivas, el personal ya no lo verá)
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="btn-secundario">Cancelar</button>
        <button
          disabled={pendiente}
          className="btn-primario"
          onClick={() =>
            iniciar(async () => {
              const r = await actualizarProductoColegio(fila.id, d);
              if (r.ok) {
                avisar(r.mensaje ?? "Guardado");
                onCerrar();
              } else avisar(r.error, "error");
            })
          }
        >
          {pendiente ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </Modal>
  );
}
