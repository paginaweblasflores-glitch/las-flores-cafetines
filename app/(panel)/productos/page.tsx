import type { Metadata } from "next";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { obtenerCategorias, obtenerColegios, obtenerStock } from "@/lib/data";
import { check, db } from "@/lib/supabase";
import { Catalogo } from "./catalogo";

export const metadata: Metadata = { title: "Catálogo" };

export default async function PaginaCatalogo() {
  const sesion = await requerirSesion(ROLES_PANEL);
  const [colegios, categorias, stock, productos] = await Promise.all([
    obtenerColegios(),
    obtenerCategorias(),
    obtenerStock({ incluirInactivos: true }),
    db().from("productos").select("id, nombre, categoria_id, activo, perecible, de_cocina, acompanante, por_revisar, prepara_personal").order("nombre").then(check),
  ]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <Catalogo
        colegios={colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
        categorias={categorias}
        productos={
          productos as { id: number; nombre: string; categoria_id: number | null; activo: boolean; perecible: boolean; de_cocina: boolean; acompanante: boolean; por_revisar: boolean; prepara_personal: boolean }[]
        }
        presencias={stock.map((s) => ({
          colegioId: s.colegio_id,
          productoId: s.producto_id,
          activo: s.activo,
          precio: Number(s.precio_venta),
          presentacion: s.presentacion,
          unidades: s.unidades_por_presentacion,
        }))}
        verGanancia={sesion.rol === "ADMIN"}
        puedeEliminar={sesion.rol === "ADMIN"}
      />
    </div>
  );
}
