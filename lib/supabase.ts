import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

/**
 * Cliente de Supabase con la service_role key.
 * Solo se usa en el servidor; el navegador nunca habla directo con la base.
 */
export function db() {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.startsWith("PEGA_AQUI") || key.startsWith("PEGA_AQUI")) {
    throw new Error(
      "Faltan las credenciales de Supabase. Completa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el archivo .env",
    );
  }
  cliente = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}

/** Lanza un error legible si Supabase devolvió error */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Traduce los mensajes técnicos de Postgres a algo entendible */
export function mensajeError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("duplicate key")) return "Ya existe un registro con ese nombre.";
  if (msg.includes("violates foreign key")) return "No se puede eliminar porque tiene registros relacionados.";
  if (msg.includes("check constraint")) return "Hay un valor no permitido (revisa que no sea negativo).";
  if (msg.includes("fetch failed")) return "No hay conexión con la base de datos. Revisa tu internet o el archivo .env.";
  return msg;
}
