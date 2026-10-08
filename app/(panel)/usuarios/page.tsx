import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios } from "@/lib/data";
import { check, db } from "@/lib/supabase";
import { Encabezado } from "@/components/encabezado";
import { ListaUsuarios } from "./lista";
import type { Rol } from "@/lib/types";

export const metadata: Metadata = { title: "Usuarios" };

export default async function PaginaUsuarios() {
  const sesion = await requerirSesion(["ADMIN"]);
  const [colegios, usuarios] = await Promise.all([
    obtenerColegios(false),
    db().from("usuarios").select("id, usuario, nombre, rol, colegio_id, activo, ultimo_acceso").order("id").then(check),
  ]);
  return (
    <div className="mx-auto max-w-[1100px]">
      <Encabezado titulo="Usuarios" descripcion="Quién puede entrar al sistema y qué puede hacer." />
      <ListaUsuarios
        yo={sesion.uid}
        colegios={colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
        usuarios={
          usuarios as {
            id: number;
            usuario: string;
            nombre: string;
            rol: Rol;
            colegio_id: number | null;
            activo: boolean;
            ultimo_acceso: string | null;
          }[]
        }
      />
    </div>
  );
}
