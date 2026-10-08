import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { obtenerColegios, obtenerReposiciones, obtenerStock, obtenerUsuariosMapa } from "@/lib/data";
import { DetalleReposicion } from "./detalle";

export async function generateMetadata({ params }: PageProps<"/reposiciones/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `REP-${String(id).padStart(4, "0")}` };
}

export default async function PaginaReposicion({ params }: PageProps<"/reposiciones/[id]">) {
  const sesion = await requerirSesion(ROLES_PANEL);
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
          stock: i.producto_id != null ? (stockPorProducto.get(i.producto_id) ?? null) : null,
        })),
      }}
    />
  );
}
