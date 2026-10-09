import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import {
  obtenerCambiosPrecio,
  obtenerColegios,
  obtenerMovimientos,
  obtenerProductosMapa,
  obtenerUsuariosMapa,
} from "@/lib/data";
import { check, db } from "@/lib/supabase";
import { fechaISOLima, fechaLarga, horaLima, numero, soles } from "@/lib/format";
import { BotonImprimir } from "@/components/imprimir";
import { agrupar, armarFilas, TIPOS, totales } from "../registros";
import { Cantidad, Precio } from "../celdas";

export const metadata: Metadata = { title: "Detalle del historial" };

/** Día y colegio del registro que se abrió (m = movimiento de stock, p = cambio de precio) */
async function ubicar(clave: string): Promise<{ fecha: string; colegioId: number } | null> {
  const id = Number(clave.slice(1));
  if (!Number.isInteger(id) || id <= 0) return null;
  if (clave.startsWith("m")) {
    const [m] = check(await db().from("movimientos").select("fecha, colegio_id").eq("id", id)) as {
      fecha: string;
      colegio_id: number;
    }[];
    return m ? { fecha: m.fecha, colegioId: m.colegio_id } : null;
  }
  if (clave.startsWith("p")) {
    const [p] = check(
      await db().from("historial_precios").select("created_at, producto_colegio!inner(colegio_id)").eq("id", id),
    ) as unknown as { created_at: string; producto_colegio: { colegio_id: number } }[];
    return p ? { fecha: fechaISOLima(p.created_at), colegioId: p.producto_colegio.colegio_id } : null;
  }
  return null;
}

export default async function PaginaDetalleHistorial({ params, searchParams }: PageProps<"/movimientos/[clave]">) {
  await requerirSesion(ROLES_PANEL);
  const { clave } = await params;
  const sp = await searchParams;
  const donde = await ubicar(clave);
  if (!donde) notFound();

  // Se rearma el mismo día y colegio con la misma agrupación de la lista, y se busca el grupo de este registro
  const [movs, precios, productos, usuarios, colegios] = await Promise.all([
    obtenerMovimientos({ colegioId: donde.colegioId, desde: donde.fecha, hasta: donde.fecha, todos: true }),
    obtenerCambiosPrecio({ colegioId: donde.colegioId, desde: donde.fecha, hasta: donde.fecha }),
    obtenerProductosMapa(),
    obtenerUsuariosMapa(),
    obtenerColegios(false),
  ]);
  const grupos = agrupar(armarFilas(movs, precios, (id) => productos.get(id)?.nombre ?? "—"));
  const g = grupos.find((x) => x.items.some((i) => i.clave === clave));
  if (!g) notFound();

  const t = totales(g);
  const colegio = colegios.find((c) => c.id === g.colegioId)?.nombre ?? "";
  const usuario = g.usuarioId ? (usuarios.get(g.usuarioId)?.nombre ?? "—") : "—";
  const esPrecio = g.tipo === "PRECIO";
  const horas = g.items.map((i) => i.hora).sort();
  const desdeHora = horaLima(horas[0]);
  const hastaHora = horaLima(horas[horas.length - 1]);

  // Volver al Historial con los mismos filtros
  const recibido = new URLSearchParams(typeof sp.volver === "string" ? sp.volver : "");
  const filtros = new URLSearchParams();
  for (const k of ["colegio", "tipo", "desde", "hasta"]) {
    const v = recibido.get(k);
    if (v) filtros.set(k, v);
  }
  const volver = `/movimientos${filtros.size ? `?${filtros}` : ""}`;

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link href={volver} className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-tinta print:hidden">
        <ArrowLeft className="h-4 w-4" /> Historial
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-suave">
            <span className={`chip ${TIPOS[g.tipo].clase}`}>{g.etiqueta}</span>
            {colegio}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight first-letter:uppercase">{fechaLarga(g.fecha)}</h1>
        </div>
        <BotonImprimir />
      </div>

      {/* Resumen */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: "Productos", v: numero(g.items.length) },
          esPrecio
            ? { t: "Cambios de precio", v: numero(g.items.length) }
            : { t: "Unidades", v: <Cantidad n={t.cantidad} /> },
          { t: "Monto", v: t.monto ? soles(t.monto) : "—" },
          { t: "Registró", v: usuario, s: desdeHora === hastaHora ? desdeHora : `${desdeHora} a ${hastaHora}` },
        ].map((x) => (
          <div key={x.t} className="card px-5 py-4">
            <p className="text-xs text-suave">{x.t}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{x.v}</p>
            {"s" in x && <p className="text-xs text-suave">{x.s}</p>}
          </div>
        ))}
      </div>

      {t.detalle && <p className="mb-4 text-sm text-suave">{t.detalle}</p>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                {!esPrecio && <th className="text-right">Cantidad</th>}
                <th className="text-right">{esPrecio ? "Precio" : "Monto"}</th>
                {!esPrecio && <th className="text-right">Stock después</th>}
                <th>Hora</th>
                {!t.detalle && <th>Detalle</th>}
              </tr>
            </thead>
            <tbody>
              {g.items.map((i) => (
                <tr key={i.clave}>
                  <td className="font-medium">{i.producto}</td>
                  {!esPrecio && (
                    <td className="text-right font-medium tabular-nums">
                      <Cantidad n={i.cantidad} />
                    </td>
                  )}
                  <td className="text-right tabular-nums">{i.precio ? <Precio p={i.precio} /> : i.monto ? soles(i.monto) : "—"}</td>
                  {!esPrecio && <td className="text-right text-suave tabular-nums">{i.stock ?? "—"}</td>}
                  <td className="whitespace-nowrap text-xs text-suave">{horaLima(i.hora)}</td>
                  {!t.detalle && <td className="text-xs text-suave">{i.detalle}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
