// La sesión la maneja Supabase Auth (cookies sb-…). Aquí solo lo común a proxy.ts y al servidor.
import type { Sesion } from "./types";

/** Página de inicio según el rol */
export function inicioPorRol(rol: Sesion["rol"]) {
  if (rol === "PERSONAL") return "/personal";
  if (rol === "COCINA") return "/cocina";
  return "/dashboard";
}
