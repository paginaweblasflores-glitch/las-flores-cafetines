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
          .filter((s) => s.perecible)
          .map((s) => ({ id: s.id, colegioId: s.colegio_id, nombre: s.producto, categoria: s.categoria ?? "Otros" }))}
        envios={envios
          .filter((e) => e.estado !== "ANULADO")
          .map((e) => ({
            id: e.id,
            colegioId: e.colegio_id,
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
