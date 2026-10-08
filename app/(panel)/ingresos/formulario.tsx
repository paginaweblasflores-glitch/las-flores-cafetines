"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Truck } from "lucide-react";
import { registrarIngresos } from "@/app/actions/inventario";
import { avisar } from "@/components/ui";
import { hoyISO, NOMBRE_PRESENTACION, numero, soles } from "@/lib/format";

type ItemStock = {
  id: number;
  colegioId: number;
  producto: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  costo: number;
  total: number;
};

type Linea = { key: number; productoColegioId: string; cajas: string; porCaja: string; sueltas: string; costo: string };

let contador = 1;
const nuevaLinea = (): Linea => ({ key: contador++, productoColegioId: "", cajas: "", porCaja: "", sueltas: "", costo: "" });
const n = (v: string) => (v.trim() === "" ? 0 : Number(v));

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
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea()]);
  const [pendiente, iniciar] = useTransition();

  const disponibles = stock.filter((s) => s.colegioId === colegioId);
  const item = (id: string) => disponibles.find((s) => String(s.id) === id);

  const actualizar = (key: number, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambio } : l)));

  const resumen = lineas.reduce(
    (a, l) => {
      const it = item(l.productoColegioId);
      if (!it) return a;
      const porCaja = n(l.porCaja) || it.unidadesPorPresentacion;
      const u = n(l.cajas) * porCaja + n(l.sueltas);
      const costo = l.costo === "" ? it.costo : Number(l.costo);
      return { unidades: a.unidades + u, costo: a.costo + (u * costo) / porCaja };
    },
    { unidades: 0, costo: 0 },
  );

  function guardar() {
    const validas = lineas.filter((l) => item(l.productoColegioId) && (n(l.cajas) > 0 || n(l.sueltas) > 0));
    if (validas.length === 0) {
      avisar("Agrega al menos un producto con cantidad.", "error");
      return;
    }
    iniciar(async () => {
      const r = await registrarIngresos(
        fecha,
        validas.map((l) => ({
          productoColegioId: Number(l.productoColegioId),
          cajas: n(l.cajas),
          unidadesPorCaja: n(l.porCaja) || (item(l.productoColegioId)?.unidadesPorPresentacion ?? 1),
          sueltas: n(l.sueltas),
          costo: l.costo === "" ? null : Number(l.costo),
        })),
        obs,
      );
      if (r.ok) {
        avisar(r.mensaje ?? "Guardado");
        setLineas([nuevaLinea()]);
        setObs("");
      } else avisar(r.error, "error");
    });
  }

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
            onChange={(e) => {
              setColegioId(Number(e.target.value));
              setLineas([nuevaLinea()]);
            }}
            className="input"
          >
            {colegios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input" />
        </label>
      </div>

      <div className="mt-5 space-y-3">
        {lineas.map((l, i) => {
          const it = item(l.productoColegioId);
          const esUnidad = !it || it.presentacion === "UNIDAD";
          const usados = new Set(lineas.filter((x) => x.key !== l.key).map((x) => x.productoColegioId));
          return (
            <div key={l.key} className="rounded-xl border border-borde p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-suave">{i + 1}.</span>
                <select
                  value={l.productoColegioId}
                  onChange={(e) => {
                    const nuevo = disponibles.find((s) => String(s.id) === e.target.value);
                    actualizar(l.key, {
                      productoColegioId: e.target.value,
                      costo: nuevo ? String(nuevo.costo) : "",
                      porCaja: nuevo ? String(nuevo.unidadesPorPresentacion) : "",
                    });
                  }}
                  className="input flex-1"
                >
                  <option value="">Elige producto...</option>
                  {disponibles
                    .filter((s) => !usados.has(String(s.id)))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.producto} (hay {s.total} unid.)
                      </option>
                    ))}
                </select>
                {lineas.length > 1 && (
                  <button
                    onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
                    className="rounded-lg p-2 text-suave hover:bg-rojo-50 hover:text-rojo"
                    aria-label="Quitar línea"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {it && (
                <>
                  <div className={`mt-3 grid gap-2 ${esUnidad ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                    {!esUnidad && (
                      <>
                        <label>
                          <span className="label">{NOMBRE_PRESENTACION[it.presentacion]}s</span>
                          <input
                            type="number"
                            min="0"
                            value={l.cajas}
                            onChange={(e) => actualizar(l.key, { cajas: e.target.value })}
                            className="input"
                          />
                        </label>
                        <label>
                          <span className="label">Unidades c/u</span>
                          <input
                            type="number"
                            min="1"
                            value={l.porCaja}
                            onChange={(e) => actualizar(l.key, { porCaja: e.target.value })}
                            className="input"
                          />
                        </label>
                      </>
                    )}
                    <label>
                      <span className="label">{esUnidad ? "Unidades" : "Sueltas"}</span>
                      <input
                        type="number"
                        min="0"
                        value={l.sueltas}
                        onChange={(e) => actualizar(l.key, { sueltas: e.target.value })}
                        className="input"
                      />
                    </label>
                    <label>
                      <span className="label">Costo x {esUnidad ? "unid." : NOMBRE_PRESENTACION[it.presentacion]?.toLowerCase()}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.costo}
                        onChange={(e) => actualizar(l.key, { costo: e.target.value })}
                        className="input"
                      />
                    </label>
                  </div>
                  {(n(l.cajas) > 0 || n(l.sueltas) > 0) && (
                    <p className="mt-2 text-xs text-suave">
                      {!esUnidad && n(l.cajas) > 0 && (
                        <>
                          {n(l.cajas)} {NOMBRE_PRESENTACION[it.presentacion]?.toLowerCase()}
                          {n(l.cajas) === 1 ? "" : "s"} × {n(l.porCaja) || it.unidadesPorPresentacion}
                          {n(l.sueltas) > 0 ? ` + ${n(l.sueltas)} sueltas` : ""} ={" "}
                        </>
                      )}
                      <b className="text-tinta">
                        {numero((esUnidad ? 0 : n(l.cajas)) * (n(l.porCaja) || it.unidadesPorPresentacion) + n(l.sueltas))}
                      </b>{" "}
                      unidades · quedará en {numero(it.total + (esUnidad ? 0 : n(l.cajas)) * (n(l.porCaja) || it.unidadesPorPresentacion) + n(l.sueltas))}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => setLineas((ls) => [...ls, nuevaLinea()])} className="btn-fantasma mt-3">
        <Plus className="h-4 w-4" /> Agregar otro producto
      </button>

      <label className="mt-4 block">
        <span className="label">Observación</span>
        <input value={obs} onChange={(e) => setObs(e.target.value)} className="input" placeholder="Ej: Guía 0012, proveedor..." />
      </label>

      <div className="mt-5 flex flex-col gap-3 rounded-xl bg-fondo p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          Total: <b>{numero(resumen.unidades)}</b> unidades · costo <b>{soles(resumen.costo)}</b>
        </p>
        <button onClick={guardar} disabled={pendiente || resumen.unidades <= 0} className="btn-primario">
          {pendiente ? "Guardando..." : "Registrar entrega"}
        </button>
      </div>
    </div>
  );
}
