"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { check, db, mensajeError } from "@/lib/supabase";
import { COOKIE_SESION, DURACION_SESION_SEG, firmarSesion, inicioPorRol } from "@/lib/session";
import { normalizar } from "@/lib/format";
import type { Rol } from "@/lib/types";

export type EstadoLogin = { error?: string; usuario?: string };

export async function iniciarSesion(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const usuario = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!usuario || !password) {
    return { error: "Escribe tu usuario y contraseña.", usuario };
  }

  let destino: string;
  try {
    const usuarios = check(
      await db().from("usuarios").select("id, usuario, nombre, password_hash, rol, colegio_id").eq("activo", true),
    ) as { id: number; usuario: string; nombre: string; password_hash: string; rol: Rol; colegio_id: number | null }[];

    const buscado = normalizar(usuario);
    const u = usuarios.find((x) => normalizar(x.usuario) === buscado);
    const valido = u ? await bcrypt.compare(password, u.password_hash) : false;

    if (!u || !valido) {
      await new Promise((r) => setTimeout(r, 400));
      return { error: "Usuario o contraseña incorrectos.", usuario };
    }

    const token = await firmarSesion({
      uid: u.id,
      usuario: u.usuario,
      nombre: u.nombre,
      rol: u.rol,
      colegioId: u.colegio_id,
    });

    (await cookies()).set(COOKIE_SESION, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DURACION_SESION_SEG,
    });

    await db().from("usuarios").update({ ultimo_acceso: new Date().toISOString() }).eq("id", u.id);
    destino = inicioPorRol(u.rol);
  } catch (e) {
    return { error: mensajeError(e), usuario };
  }
  redirect(destino);
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE_SESION);
  redirect("/login");
}
