import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios, obtenerUsuarios } from "@/lib/data";
import { Encabezado } from "@/components/encabezado";
import { ListaUsuarios } from "./lista";
import { DescargarAplicativo } from "@/components/aplicativo";

export const metadata: Metadata = { title: "Usuarios" };

export default async function PaginaUsuarios() {
  const sesion = await requerirSesion(["ADMIN"]);
  const [colegios, usuarios] = await Promise.all([
    obtenerColegios(false),
    obtenerUsuarios(),
  ]);
  return (
    <div className="mx-auto max-w-[1100px]">
      <Encabezado
        titulo="Usuarios"
        descripcion="Quién puede entrar al sistema y qué puede hacer."
        acciones={<DescargarAplicativo />}
      />
      <ListaUsuarios
        yo={sesion.uid}
        colegios={colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
        // Sin auth_id: el navegador no lo necesita
        usuarios={usuarios.map((u) => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, colegio_id: u.colegio_id, activo: u.activo, ultimo_acceso: u.ultimo_acceso }))}
      />
    </div>
  );
}
