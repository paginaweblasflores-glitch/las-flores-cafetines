import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, inicioPorRol, leerToken } from "@/lib/session";

// Rutas que solo puede ver la administradora
const SOLO_ADMIN = ["/usuarios", "/colegios"];
// Lo que no es del trabajo de logística (ella compra y entrega): conteos, ventas y las pantallas del cafetín
const NO_LOGISTICA = ["/conteos", "/ventas", "/personal", "/cocina"];
// Rutas del panel (administración y logística)
const PANEL = ["/dashboard", "/stock", "/ventas", "/conteos", "/reporte-mensual", "/ingresos", "/reposiciones", "/productos", "/movimientos", ...SOLO_ADMIN];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sesion = await leerToken(request.cookies.get(COOKIE_SESION)?.value);
  const ir = (ruta: string) => NextResponse.redirect(new URL(ruta, request.url));

  if (pathname === "/salir") return NextResponse.next();

  if (pathname === "/login") {
    return sesion ? ir(inicioPorRol(sesion.rol)) : NextResponse.next();
  }

  if (!sesion) return ir("/login");

  const en = (rutas: string[]) => rutas.some((r) => pathname === r || pathname.startsWith(r + "/"));

  if (sesion.rol === "PERSONAL" && (en(PANEL) || en(["/cocina"]) || pathname.startsWith("/api/exportar"))) {
    return ir("/personal");
  }
  // La cocina solo ve su pantalla de envíos
  if (sesion.rol === "COCINA" && !en(["/cocina"])) {
    return ir("/cocina");
  }
  if (sesion.rol === "LOGISTICA" && (en(SOLO_ADMIN) || en(NO_LOGISTICA))) {
    return ir("/dashboard");
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos archivos estáticos
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|logo.png|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
