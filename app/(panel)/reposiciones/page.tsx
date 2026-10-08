import type { Metadata } from "next";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { obtenerColegios, obtenerReposiciones, obtenerUsuariosMapa } from "@/lib/data";
import { Encabezado } from "@/components/encabezado";
import { ListaReposiciones } from "./lista";

export const metadata: Metadata = { title: "Reposiciones" };

export default async function PaginaReposiciones() {
  const sesion = await requerirSesion(ROLES_PANEL);
  const [reposiciones, colegios, usuarios] = await Promise.all([
    obtenerReposiciones({ limite: 1000 }),
    obtenerColegios(false),
    obtenerUsuariosMapa(),
  ]);
  const nombreColegio = new Map(colegios.map((c) => [c.id, c.nombre]));

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo="Reposiciones"
        descripcion={
          sesion.rol === "LOGISTICA"
            ? "Listas de pedido del personal. Revísalas, apruébalas, imprime y compra; al final anota los costos y marca \"Comprado\"."
            : "Listas de pedido que envía el personal. Logística las revisa, compra y cierra; aquí puedes seguirlas."
        }
      />
      <ListaReposiciones
        rol={sesion.rol}
        colegios={colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
        filas={reposiciones.map((r) => ({
          id: r.id,
          codigo: r.codigo,
          fecha: r.created_at,
          colegioId: r.colegio_id,
          colegio: nombreColegio.get(r.colegio_id) ?? "",
          pedidoPor: r.pedido_por ? (usuarios.get(r.pedido_por)?.nombre ?? "") : "",
          estado: r.estado,
          productos: r.items.length,
          aprobados: r.items.filter((i) => !i.quitado).length,
          fueraCatalogo: r.items.filter((i) => !i.producto_id).length,
        }))}
      />
    </div>
  );
}
