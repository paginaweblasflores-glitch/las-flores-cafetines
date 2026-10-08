// Firma y lectura del token de sesión. Sin dependencias de Node para poder usarse en proxy.ts.
import { SignJWT, jwtVerify } from "jose";
import type { Sesion } from "./types";

export const COOKIE_SESION = "lf_sesion";
export const DURACION_SESION_SEG = 60 * 60 * 14; // 14 horas (una jornada)

function clave() {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || secreto.length < 16) {
    throw new Error("Falta SESSION_SECRET en el archivo .env");
  }
  return new TextEncoder().encode(secreto);
}

export async function firmarSesion(sesion: Sesion) {
  return new SignJWT({ ...sesion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SESION_SEG}s`)
    .sign(clave());
}

export async function leerToken(token: string | undefined): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave(), { algorithms: ["HS256"] });
    return {
      uid: Number(payload.uid),
      usuario: String(payload.usuario),
      nombre: String(payload.nombre),
      rol: payload.rol as Sesion["rol"],
      colegioId: payload.colegioId == null ? null : Number(payload.colegioId),
    };
  } catch {
    return null;
  }
}

/** Página de inicio según el rol */
export function inicioPorRol(rol: Sesion["rol"]) {
  if (rol === "PERSONAL") return "/personal";
  if (rol === "COCINA") return "/cocina";
  return "/dashboard";
}
