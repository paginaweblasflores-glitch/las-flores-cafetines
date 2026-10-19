import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios, obtenerEnvios, obtenerProductosMapa, obtenerStock, obtenerUsuariosMapa } from "@/lib/data";
import { hoyISO } from "@/lib/format";
import { Avisos } from "@/components/ui";
import { PanelCocina } from "./panel";

export const metadata: Metadata = { title: "Envíos de cocina" };

export default async function PaginaCocina() {
  const sesion = await requerirSesion(["COCINA", "ADMIN"]);
  const hoy = hoyISO();
  const [colegios, stock, envios, productos, usuarios] = await Promise.all([
    obtenerColegios(),
    obtenerStock(),
    obtenerEnvios({ desde: hoy, hasta: hoy, origen: "COCINA" }),
    obtenerProductosMapa(),
    obtenerUsuariosMapa(),
  ]);

  return (
    <>
      <Avisos />
      <PanelCocina
        hoy={hoy}
        esCocina={sesion.rol === "COCINA"}
        colegios={colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
        productos={stock
          // Del día y que los envía la cocina (los que solo se cuentan en el cafetín no salen aquí)
          .filter((s) => s.perecible && productos.get(s.producto_id)?.de_cocina !== false)
          .map((s) => ({
            id: s.id,
            colegioId: s.colegio_id,
            nombre: s.producto,
            categoria: s.categoria ?? "Otros",
            // Balde: la cocina escribe baldes y se guardan como vasos
            vasosPorBalde: s.presentacion === "BALDE" ? s.unidades_por_presentacion : null,
          }))}
        envios={envios
          .filter((e) => e.estado !== "ANULADO")
          .map((e) => ({
            id: e.id,
            colegioId: e.colegio_id,
            productoColegioId: e.producto_colegio_id,
            producto: productos.get(e.producto_id)?.nombre ?? "Producto",
            enviada: e.cantidad_enviada,
            recibida: e.cantidad_recibida,
            estado: e.estado,
            motivo: e.motivo,
            hora: e.created_at,
            recibidoPor: e.recibido_por ? (usuarios.get(e.recibido_por)?.nombre ?? null) : null,
          }))}
      />
    </>
  );
}
