"use server";

import { refresh, revalidatePath } from "next/cache";
import { sesionAccion } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import { normalizar } from "@/lib/format";
import { correoDeUsuario } from "@/lib/correo";
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

    const colegioId = d.rol === "PERSONAL" ? d.colegioId : null;
    const datos = { usuario, nombre, rol: d.rol, colegio_id: colegioId, activo: d.activo };
    // El rol va también en la cuenta de Supabase Auth (lo usa proxy.ts para los permisos)
    const appMetadata = { rol: d.rol, colegio_id: colegioId };
    // Desactivado = cuenta bloqueada en Supabase Auth (no puede iniciar sesión)
    const bloqueo = d.activo ? "none" : "876000h";
    const auth = db().auth.admin;

    if (id) {
      const actual = check(await db().from("usuarios").select("auth_id").eq("id", id).single()) as { auth_id: string | null };
      if (!actual.auth_id) return { ok: false, error: "Este usuario todavía no tiene cuenta en Supabase Auth." };
      const { error } = await auth.updateUserById(actual.auth_id, {
        app_metadata: appMetadata,
        ban_duration: bloqueo,
        ...(d.password ? { password: d.password } : {}),
      });
      if (error) return { ok: false, error: `Supabase Auth: ${error.message}` };
      check(await db().from("usuarios").update(datos).eq("id", id));
    } else {
      // Correo interno sin repetir (administradora@lasflores.co, administradora.2@lasflores.co…)
      const usados = new Set(
        (check(await db().from("usuarios").select("email")) as { email: string | null }[]).map((u) => (u.email ?? "").toLowerCase()),
      );
      let email = correoDeUsuario(usuario);
      for (let n = 2; usados.has(email); n++) email = correoDeUsuario(usuario).replace("@", `.${n}@`);

      const { data, error } = await auth.createUser({ email, password: d.password, email_confirm: true, app_metadata: appMetadata });
      if (error || !data.user) return { ok: false, error: `Supabase Auth: ${error?.message ?? "no se pudo crear la cuenta"}` };
      if (!d.activo) await auth.updateUserById(data.user.id, { ban_duration: bloqueo });
      const { error: errorInsert } = await db().from("usuarios").insert({ ...datos, auth_id: data.user.id, email });
      if (errorInsert) {
        await auth.deleteUser(data.user.id); // no dejar una cuenta suelta
        return { ok: false, error: mensajeError(errorInsert) };
      }
    }
    revalidatePath("/login"); // la lista de usuarios del login
    refresh();
    return { ok: true, mensaje: id ? "Usuario actualizado." : "Usuario creado." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
