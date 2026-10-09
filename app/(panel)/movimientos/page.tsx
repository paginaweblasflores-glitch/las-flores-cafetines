import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import {
  obtenerCambiosPrecio,
  obtenerColegios,
  obtenerMovimientos,
  obtenerProductosMapa,
  obtenerUsuariosMapa,
} from "@/lib/data";
import { fechaCorta, horaLima, mesActual, rangoMes, soles } from "@/lib/format";
import { Encabezado } from "@/components/encabezado";
import { Vacio } from "@/components/ui";
import { TablaPaginada } from "@/components/paginacion";
import { agrupar, armarFilas, TIPOS, totales, type Tipo } from "./registros";
import { Cantidad, Precio } from "./celdas";
import { FilaEnlace } from "./grupo";

export const metadata: Metadata = { title: "Historial" };

export default async function PaginaMovimientos({ searchParams }: PageProps<"/movimientos">) {
  await requerirSesion(ROLES_PANEL);
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const { desde: d0, hasta: h0 } = rangoMes(mesActual());
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(str("desde")) ? str("desde") : d0;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(str("hasta")) ? str("hasta") : h0;
  const tipo = (str("tipo") in TIPOS ? str("tipo") : "") as Tipo | "";
  const colegios = await obtenerColegios(false);
  const pedido = Number(str("colegio"));
  const colegioId = colegios.some((c) => c.id === pedido) ? pedido : null;

  const verMovimientos = tipo !== "PRECIO";
  const verPrecios = tipo === "" || tipo === "PRECIO";

  const [movs, precios, productos, usuarios] = await Promise.all([
    verMovimientos ? obtenerMovimientos({ colegioId, tipo: tipo || null, desde, hasta, todos: true }) : [],
    verPrecios ? obtenerCambiosPrecio({ colegioId, desde, hasta, limite: 1000 }) : [],
    obtenerProductosMapa(),
    obtenerUsuariosMapa(),
  ]);
  const nombreColegio = new Map(colegios.map((c) => [c.id, c.nombre]));
  const grupos = agrupar(armarFilas(movs, precios, (id) => productos.get(id)?.nombre ?? "—"));

  // Para volver del detalle al Historial con los mismos filtros
  const filtros = new URLSearchParams({ desde, hasta, ...(tipo ? { tipo } : {}), ...(colegioId ? { colegio: String(colegioId) } : {}) });
  const volver = encodeURIComponent(filtros.toString());

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo="Historial"
        descripcion="Todo lo que pasó, quién y cuándo. Lo que se registró junto (un envío, un conteo, una entrega) va en una sola fila: tócala para ver sus productos."
      />

      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label>
          <span className="label">Colegio</span>
          <select name="colegio" defaultValue={colegioId ?? "todos"} className="input">
            <option value="todos">Todos</option>
            {colegios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Tipo</span>
          <select name="tipo" defaultValue={tipo} className="input">
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className="input" />
        </label>
        <label>
          <span className="label">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className="input" />
        </label>
        <button className="btn-primario">Filtrar</button>
      </form>

      <div className="card overflow-hidden">
        {grupos.length === 0 ? (
          <Vacio icono={<History className="h-6 w-6" />} titulo="No hay registros con esos filtros" />
        ) : (
          <TablaPaginada
            etiqueta="registros"
            cabecera={
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Colegio</th>
                  <th className="text-right">Cantidad</th>
                  <th className="text-right">Monto / precio</th>
                  <th className="text-right">Stock después</th>
                  <th>Usuario</th>
                  <th>Detalle</th>
                  <th />
                </tr>
              </thead>
            }
            filas={grupos.map((g) => {
              const varios = g.items.length > 1;
              const uno = g.items[0];
              const t = totales(g);
              const href = varios ? `/movimientos/${g.clave}?volver=${volver}` : null;
              const detalle = varios ? t.detalle : uno.detalle;
              return (
                <FilaEnlace key={g.clave} href={href}>
                  <td className="whitespace-nowrap">
                    {fechaCorta(g.fecha)}
                    <span className="block text-xs text-suave">{horaLima(g.hora)}</span>
                  </td>
                  <td>
                    <span className={`chip whitespace-nowrap ${TIPOS[g.tipo].clase}`}>{g.etiqueta}</span>
                  </td>
                  <td className="font-medium">
                    {href ? (
                      <Link href={href} className="whitespace-nowrap text-verde-700 hover:underline">
                        {g.items.length} productos
                      </Link>
                    ) : (
                      uno.producto
                    )}
                  </td>
                  <td className="whitespace-nowrap text-suave">{nombreColegio.get(g.colegioId)}</td>
                  <td className="text-right font-medium">
                    <Cantidad n={t.cantidad} />
                  </td>
                  <td className="text-right">
                    {!varios && uno.precio ? <Precio p={uno.precio} /> : t.monto ? soles(t.monto) : "—"}
                  </td>
                  <td className="text-right text-suave">{!varios && uno.stock !== null ? uno.stock : "—"}</td>
                  <td className="whitespace-nowrap text-suave">{g.usuarioId ? (usuarios.get(g.usuarioId)?.nombre ?? "—") : "—"}</td>
                  <td className="max-w-64 truncate text-xs text-suave" title={detalle ?? undefined}>
                    {detalle}
                  </td>
                  <td className="w-8 text-suave">{href && <ChevronRight className="h-4 w-4" />}</td>
                </FilaEnlace>
              );
            })}
          />
        )}
      </div>
    </div>
  );
}
