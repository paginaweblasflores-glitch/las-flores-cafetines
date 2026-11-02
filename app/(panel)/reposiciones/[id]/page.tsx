import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios, obtenerReposiciones, obtenerStock, obtenerUsuariosMapa } from "@/lib/data";
import { NOMBRE_PRESENTACION, soles } from "@/lib/format";
import { DetalleReposicion } from "./detalle";

export async function generateMetadata({ params }: PageProps<"/reposiciones/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `REP-${String(id).padStart(4, "0")}` };
}

/** Cómo se compró lo de fuera del catálogo: "20 paquetes × 1 · S/ 12.00 c/paquete" */
function detalleCompra(i: { presentacion: string | null; cajas: number | null; unidades_por_caja: number | null; sueltas: number | null; costo_presentacion: number | null }) {
  if (i.presentacion == null || i.costo_presentacion == null) return null;
  const caja = (NOMBRE_PRESENTACION[i.presentacion] ?? "Caja").toLowerCase();
  const esUnidad = i.presentacion === "UNIDAD";
  const partes = [
    i.cajas ? `${i.cajas} ${caja}${i.cajas === 1 ? "" : "s"} × ${i.unidades_por_caja}` : "",
    i.sueltas ? `${i.sueltas} ${esUnidad ? "unidades" : "sueltas"}` : "",
  ].filter(Boolean);
  return `${partes.join(" + ")} · ${soles(Number(i.costo_presentacion))} c/${esUnidad ? "unid." : caja}`;
}

export default async function PaginaReposicion({ params }: PageProps<"/reposiciones/[id]">) {
  const sesion = await requerirSesion(["LOGISTICA"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [r] = await obtenerReposiciones({ id });
  if (!r) notFound();

  const [colegios, usuarios, stock] = await Promise.all([
    obtenerColegios(false),
    obtenerUsuariosMapa(),
    obtenerStock({ colegioId: r.colegio_id }),
  ]);
  const nombreUsuario = (uid: number | null) => (uid ? (usuarios.get(uid)?.nombre ?? "") : "");
  const stockPorProducto = new Map(stock.map((s) => [s.producto_id, s.total_unidades]));

  return (
    <DetalleReposicion
      rol={sesion.rol}
      r={{
        id: r.id,
        codigo: r.codigo,
        estado: r.estado,
        colegio: colegios.find((c) => c.id === r.colegio_id)?.nombre ?? "",
        nota: r.nota,
        fecha: r.created_at,
        pedidoPor: nombreUsuario(r.pedido_por),
        revisadoPor: nombreUsuario(r.revisado_por),
        revisadoAt: r.revisado_at,
        motivoRechazo: r.motivo_rechazo,
        compraPor: nombreUsuario(r.compra_por),
        compraAt: r.compra_at,
        compradoPor: nombreUsuario(r.comprado_por),
        compradoAt: r.comprado_at,
        items: r.items.map((i) => ({
          id: i.id,
          nombre: i.nombre,
          enCatalogo: i.producto_id != null,
          cantidad: i.cantidad,
          unidad: i.unidad,
          quitado: i.quitado,
          cantidadAprobada: i.cantidad_aprobada,
          costo: i.costo == null ? null : Number(i.costo),
          costoFecha: i.costo_fecha,
          detalleCompra: detalleCompra(i),
          entregado: i.entregado_at != null,
          stock: i.producto_id != null ? (stockPorProducto.get(i.producto_id) ?? null) : null,
        })),
      }}
    />
  );
}
