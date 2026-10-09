import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { inicioPorRol } from "./session";
import { db } from "./supabase";
import { supabaseSesion } from "./supabase-sesion";
import type { Rol, Sesion } from "./types";

export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  // Supabase Auth verifica la sesión (firma y vencimiento) y dice qué cuenta es
  const { data } = await (await supabaseSesion()).auth.getClaims();
  const authId = data?.claims?.sub;
  if (!authId) return null;
  // Se revisa contra la base: si la administradora desactiva o cambia a un usuario, aplica al instante
  const { data: u } = await db()
    .from("usuarios")
    .select("id, usuario, nombre, rol, colegio_id, activo")
    .eq("auth_id", authId)
    .maybeSingle();
  if (!u || !u.activo) return null;
  return { uid: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, colegioId: u.colegio_id };
});

/** Exige sesión (y opcionalmente un rol). Si no cumple, redirige. */
export async function requerirSesion(roles?: Rol[]): Promise<Sesion> {
  const sesion = await obtenerSesion();
  // /salir cierra la sesión vencida o de un usuario desactivado y lleva al login
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
