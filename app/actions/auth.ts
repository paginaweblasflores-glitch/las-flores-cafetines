"use server";

import { redirect } from "next/navigation";
import { check, db, mensajeError } from "@/lib/supabase";
import { supabaseSesion } from "@/lib/supabase-sesion";
import { inicioPorRol } from "@/lib/session";
import { normalizar } from "@/lib/format";
import type { Rol } from "@/lib/types";

export type EstadoLogin = { error?: string; usuario?: string };

/**
 * En el login se elige el usuario (no el correo): aquí se busca su correo interno
 * y Supabase Auth verifica la contraseña y abre la sesión (cookies sb-…).
 */
export async function iniciarSesion(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const usuario = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!usuario || !password) {
    return { error: "Escribe tu usuario y contraseña.", usuario };
  }

  let destino: string;
  try {
    const usuarios = check(
      await db().from("usuarios").select("id, usuario, email, auth_id, rol").eq("activo", true),
    ) as { id: number; usuario: string; email: string | null; auth_id: string | null; rol: Rol }[];

    const buscado = normalizar(usuario);
    const u = usuarios.find((x) => normalizar(x.usuario) === buscado);
    if (u && (!u.email || !u.auth_id)) {
      return { error: "Este usuario todavía no tiene cuenta en Supabase Auth. Avisa a la administración.", usuario };
    }

    const supa = await supabaseSesion();
    const { error } = u ? await supa.auth.signInWithPassword({ email: u.email!, password }) : { error: true };
    if (!u || error) {
      await new Promise((r) => setTimeout(r, 400));
      return { error: "Usuario o contraseña incorrectos.", usuario };
    }

    await db().from("usuarios").update({ ultimo_acceso: new Date().toISOString() }).eq("id", u.id);
    destino = inicioPorRol(u.rol);
  } catch (e) {
    return { error: mensajeError(e), usuario };
  }
  redirect(destino);
}

export async function cerrarSesion() {
  await (await supabaseSesion()).auth.signOut();
  redirect("/login");
}
