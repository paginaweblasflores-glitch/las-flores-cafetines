"use server";

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { sesionAccion } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import { normalizar } from "@/lib/format";
import type { Resultado, Rol } from "@/lib/types";

/* ------------------------------ Colegios ------------------------------ */

export async function guardarColegio(
  id: number | null,
  d: { codigo: string; nombre: string; direccion: string; responsable: string; activo: boolean; copiarDe: number | null },
): Promise<Resultado> {
  try {
    await sesionAccion(["ADMIN"]);
    const codigo = d.codigo.trim().toUpperCase().replace(/\s+/g, "_");
    const nombre = d.nombre.trim();
    if (!codigo || !nombre) return { ok: false, error: "El código y el nombre son obligatorios." };
    const datos = {
      codigo,
      nombre,
      direccion: d.direccion.trim() || null,
      responsable: d.responsable.trim() || null,
      activo: d.activo,
    };
    if (id) {
      check(await db().from("colegios").update(datos).eq("id", id));
      refresh();
      return { ok: true, mensaje: "Colegio actualizado." };
    }
    const nuevo = check(await db().from("colegios").insert(datos).select("id").single()) as { id: number };
    let extra = "";
    if (d.copiarDe) {
      const n = check(
        await db().rpc("fn_copiar_catalogo", { p_colegio_origen: d.copiarDe, p_colegio_destino: nuevo.id }),
      ) as number;
      extra = ` Se copiaron ${n} productos con sus precios (stock en cero).`;
    }
    refresh();
    return { ok: true, mensaje: `Colegio creado.${extra} Ahora crea su usuario de personal.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/* ------------------------------ Usuarios ------------------------------ */

const ROLES: Rol[] = ["ADMIN", "LOGISTICA", "PERSONAL", "COCINA"];

export async function guardarUsuario(
  id: number | null,
  d: { usuario: string; nombre: string; rol: Rol; colegioId: number | null; activo: boolean; password: string },
): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["ADMIN"]);
    const usuario = d.usuario.trim().replace(/\s+/g, " ");
    const nombre = d.nombre.trim();
    if (usuario.length < 3) return { ok: false, error: "El usuario debe tener al menos 3 letras." };
    if (!nombre) return { ok: false, error: "Escribe el nombre de la persona." };
    if (!ROLES.includes(d.rol)) return { ok: false, error: "Rol no válido." };
    if (d.rol === "PERSONAL" && !d.colegioId) return { ok: false, error: "El personal debe tener un colegio asignado." };
    if (!id && d.password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
    if (id && d.password && d.password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
    if (id === sesion.uid && (!d.activo || d.rol !== "ADMIN")) {
      return { ok: false, error: "No puedes desactivarte ni quitarte el rol de administradora." };
    }

    // Usuario único sin importar tildes ni mayúsculas
    const todos = check(await db().from("usuarios").select("id, usuario")) as { id: number; usuario: string }[];
    if (todos.some((u) => u.id !== id && normalizar(u.usuario) === normalizar(usuario))) {
      return { ok: false, error: "Ya existe un usuario con ese nombre." };
    }

    const datos: Record<string, unknown> = {
      usuario,
      nombre,
      rol: d.rol,
      colegio_id: d.rol === "PERSONAL" ? d.colegioId : null,
      activo: d.activo,
    };
    if (d.password) datos.password_hash = await bcrypt.hash(d.password, 10);

    if (id) check(await db().from("usuarios").update(datos).eq("id", id));
    else check(await db().from("usuarios").insert(datos));
    refresh();
    return { ok: true, mensaje: id ? "Usuario actualizado." : "Usuario creado." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
