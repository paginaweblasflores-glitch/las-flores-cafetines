import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESION, inicioPorRol, leerToken } from "./session";
import { db } from "./supabase";
import type { Rol, Sesion } from "./types";

export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  const sesion = await leerToken(token);
  if (!sesion) return null;
  // Se revisa contra la base: si la administradora desactiva o cambia a un usuario, aplica al instante
  const { data } = await db()
    .from("usuarios")
    .select("usuario, nombre, rol, colegio_id, activo")
    .eq("id", sesion.uid)
    .maybeSingle();
  if (!data || !data.activo) return null;
  return { uid: sesion.uid, usuario: data.usuario, nombre: data.nombre, rol: data.rol, colegioId: data.colegio_id };
});

/** Exige sesión (y opcionalmente un rol). Si no cumple, redirige. */
export async function requerirSesion(roles?: Rol[]): Promise<Sesion> {
  const sesion = await obtenerSesion();
  // /salir borra la cookie vencida o de un usuario desactivado y lleva al login
  if (!sesion) redirect("/salir");
  if (roles && !roles.includes(sesion.rol)) redirect(inicioPorRol(sesion.rol));
  return sesion;
}

/** Para Server Actions: devuelve la sesión o lanza error (no redirige) */
export async function sesionAccion(roles?: Rol[]): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("Tu sesión expiró. Vuelve a ingresar.");
  if (roles && !roles.includes(sesion.rol)) throw new Error("No tienes permiso para esta acción.");
  return sesion;
}

export const ROLES_PANEL: Rol[] = ["ADMIN", "LOGISTICA"];

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: "Administración",
  LOGISTICA: "Logística",
  PERSONAL: "Personal de cafetín",
  COCINA: "Cocina",
};
