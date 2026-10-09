// =====================================================================
//  LAS FLORES · Crear las cuentas de Supabase Auth de los usuarios
//
//  Uso (después de ejecutar database/16_usuarios_supabase_auth.sql):
//      node scripts/usuarios-a-supabase-auth.mjs
//
//  Por cada usuario de la tabla `usuarios` que todavía no tiene cuenta:
//    · crea la cuenta en Supabase Auth con su correo interno
//      (Administradora → administradora@lasflores.co, Personal de Bosco → bosco@lasflores.co)
//    · conserva su contraseña actual: copia el cifrado (bcrypt), no hace falta saberla
//    · guarda el rol en la cuenta (app_metadata) y bloquea a los desactivados
//  A los que ya tienen cuenta solo les actualiza el rol. Se puede ejecutar más de una vez.
//  Lee las credenciales del archivo .env (NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY).
// =====================================================================
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DOMINIO = "lasflores.co";

// Igual que lib/correo.ts
function correoDeUsuario(usuario) {
  const base = usuario
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^personal de\s+/, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${base || "usuario"}@${DOMINIO}`;
}

// .env sin dependencias
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const llave = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !llave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");

const supa = createClient(url, llave, { auth: { autoRefreshToken: false, persistSession: false } });

/** Busca una cuenta existente por correo (por si el script se cortó a la mitad) */
async function buscarPorCorreo(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

const { data: usuarios, error } = await supa.from("usuarios").select("id, usuario, rol, colegio_id, activo, password_hash, auth_id, email").order("id");
if (error) throw new Error(`No se pudo leer la tabla usuarios (¿ejecutaste la migración 16?): ${error.message}`);

const usados = new Set(usuarios.map((u) => (u.email ?? "").toLowerCase()).filter(Boolean));
const resumen = [];

for (const u of usuarios) {
  const app_metadata = { rol: u.rol, colegio_id: u.rol === "PERSONAL" ? u.colegio_id : null };
  const ban_duration = u.activo ? "none" : "876000h";

  if (u.auth_id) {
    const { error: e } = await supa.auth.admin.updateUserById(u.auth_id, { app_metadata, ban_duration });
    resumen.push({ usuario: u.usuario, correo: u.email, estado: e ? `ERROR: ${e.message}` : "ya tenía cuenta (rol actualizado)" });
    continue;
  }

  let email = u.email ?? correoDeUsuario(u.usuario);
  if (!u.email) for (let n = 2; usados.has(email); n++) email = correoDeUsuario(u.usuario).replace("@", `.${n}@`);
  usados.add(email);

  if (!u.password_hash) {
    resumen.push({ usuario: u.usuario, correo: email, estado: "SIN CONTRASEÑA: créalo de nuevo desde el panel" });
    continue;
  }

  let cuenta;
  const { data: creado, error: e } = await supa.auth.admin.createUser({
    email,
    password_hash: u.password_hash,
    email_confirm: true,
    app_metadata,
  });
  if (e) {
    // Si ya existía (por una ejecución anterior), se reutiliza
    cuenta = await buscarPorCorreo(email);
    if (!cuenta) {
      resumen.push({ usuario: u.usuario, correo: email, estado: `ERROR: ${e.message}` });
      continue;
    }
    await supa.auth.admin.updateUserById(cuenta.id, { app_metadata });
  } else cuenta = creado.user;

  if (!u.activo) await supa.auth.admin.updateUserById(cuenta.id, { ban_duration });
  const { error: e2 } = await supa.from("usuarios").update({ auth_id: cuenta.id, email }).eq("id", u.id);
  resumen.push({ usuario: u.usuario, correo: email, estado: e2 ? `ERROR al ligar: ${e2.message}` : "cuenta creada" });
}

console.table(resumen);
