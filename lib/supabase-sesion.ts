import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** URL y llave pública del proyecto (la sesión de Supabase Auth se maneja con la llave pública) */
export function credencialesPublicas() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !llave || url.startsWith("PEGA_AQUI") || llave.startsWith("PEGA_AQUI")) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en el archivo .env");
  }
  return { url, llave };
}

/**
 * Cliente de Supabase Auth ligado a las cookies de esta petición: inicia y cierra sesión
 * y dice quién está conectado. Los datos se siguen leyendo con db() (llave de servicio).
 */
export async function supabaseSesion() {
  const almacen = await cookies();
  const { url, llave } = credencialesPublicas();
  return createServerClient(url, llave, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options);
        } catch {
          // Desde una página (no acción) no se pueden escribir cookies: proxy.ts las renueva
        }
      },
    },
  });
}
