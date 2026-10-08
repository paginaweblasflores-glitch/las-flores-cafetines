import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios, obtenerStock } from "@/lib/data";
import { check, db } from "@/lib/supabase";
import { Encabezado } from "@/components/encabezado";
import { ListaColegios } from "./lista";

export const metadata: Metadata = { title: "Colegios" };

export default async function PaginaColegios() {
  await requerirSesion(["ADMIN"]);
  const [colegios, stock, usuarios] = await Promise.all([
    obtenerColegios(false),
    obtenerStock(),
    db().from("usuarios").select("id, nombre, usuario, colegio_id, activo").eq("rol", "PERSONAL").then(check),
  ]);
  const personal = usuarios as { id: number; nombre: string; usuario: string; colegio_id: number; activo: boolean }[];

  return (
    <div className="mx-auto max-w-[1200px]">
      <Encabezado
        titulo="Colegios"
        descripcion="Cada colegio tiene su cafetín, su stock y su usuario de personal. Agrega aquí los colegios nuevos."
      />
      <ListaColegios
        colegios={colegios.map((c) => {
          const s = stock.filter((x) => x.colegio_id === c.id);
          return {
            ...c,
            productos: s.length,
            unidades: s.reduce((a, x) => a + x.total_unidades, 0),
            valor: s.reduce((a, x) => a + Number(x.valor_venta_stock), 0),
            personal: personal.filter((u) => u.colegio_id === c.id && u.activo).map((u) => u.usuario),
          };
        })}
      />
    </div>
  );
}
