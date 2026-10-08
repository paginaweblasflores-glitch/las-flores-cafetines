import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth";
import { inicioPorRol } from "@/lib/session";

export default async function Inicio() {
  const sesion = await obtenerSesion();
  redirect(sesion ? inicioPorRol(sesion.rol) : "/login");
}
