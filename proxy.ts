import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { inicioPorRol } from "@/lib/session";
import type { Rol } from "@/lib/types";

// Rutas que solo puede ver la administradora
const SOLO_ADMIN = ["/usuarios", "/colegios"];
// Lo que no es del trabajo de logística (ella compra y entrega): conteos, ventas y las pantallas del cafetín
const NO_LOGISTICA = ["/conteos", "/ventas", "/personal", "/cocina"];
// Rutas del panel (administración y logística)
const PANEL = ["/dashboard", "/stock", "/ventas", "/conteos", "/reporte-mensual", "/ingresos", "/reposiciones", "/productos", "/movimientos", ...SOLO_ADMIN];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Supabase Auth: verifica la sesión y, si está por vencer, la renueva (cookies sb-…)
  let respuesta = NextResponse.next({ request });
  const supa = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supa.auth.getClaims();
  const conectado = !!data?.claims?.sub;
  // El rol va en la cuenta de Supabase Auth (app_metadata, solo lo cambia el servidor)
  const rol = (data?.claims?.app_metadata as { rol?: Rol } | undefined)?.rol;

  // Al redirigir se conservan las cookies renovadas
  const ir = (ruta: string) => {
    const r = NextResponse.redirect(new URL(ruta, request.url));
    for (const c of respuesta.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (pathname === "/salir") return respuesta;

  if (pathname === "/login") {
    return conectado && rol ? ir(inicioPorRol(rol)) : respuesta;
  }

  if (!conectado) return ir("/login");
  // Sin rol en la cuenta: las páginas lo revisan contra la base (requerirSesion)
  if (!rol) return respuesta;

  const en = (rutas: string[]) => rutas.some((r) => pathname === r || pathname.startsWith(r + "/"));

  if (rol === "PERSONAL" && (en(PANEL) || en(["/cocina"]) || pathname.startsWith("/api/exportar"))) {
    return ir("/personal");
  }
  // La cocina solo ve su pantalla de envíos
  if (rol === "COCINA" && !en(["/cocina"])) {
    return ir("/cocina");
  }
  if (rol === "LOGISTICA" && (en(SOLO_ADMIN) || en(NO_LOGISTICA))) {
    return ir("/dashboard");
  }
  return respuesta;
}

export const config = {
  // Todo menos archivos estáticos
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|logo.png|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
