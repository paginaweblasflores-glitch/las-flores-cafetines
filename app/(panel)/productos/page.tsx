import type { Metadata } from "next";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { obtenerCategorias, obtenerColegios, obtenerStock } from "@/lib/data";
import { check, db } from "@/lib/supabase";
import { Encabezado } from "@/components/encabezado";
import { Catalogo } from "./catalogo";

export const metadata: Metadata = { title: "Catálogo" };

export default async function PaginaCatalogo() {
  const sesion = await requerirSesion(ROLES_PANEL);
  const [colegios, categorias, stock, productos] = await Promise.all([
    obtenerColegios(),
    obtenerCategorias(),
    obtenerStock({ incluirInactivos: true }),
    db().from("productos").select("id, nombre, categoria_id, activo, perecible").order("nombre").then(check),
  ]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo="Catálogo"
        descripcion="La lista general de productos: nombre, categoría y en qué colegios se vende."
      />
      <Catalogo
        colegios={colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
        categorias={categorias}
        productos={productos as { id: number; nombre: string; categoria_id: number | null; activo: boolean; perecible: boolean }[]}
        presencias={stock.map((s) => ({ colegioId: s.colegio_id, productoId: s.producto_id, activo: s.activo, precio: Number(s.precio_venta) }))}
        verGanancia={sesion.rol === "ADMIN"}
      />
    </div>
  );
}
