"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { sesionAccion, ROLES_PANEL } from "@/lib/auth";
import { COOKIE_COLEGIO } from "@/lib/data";

/** Cambia el colegio que se está viendo en el panel (null = todos) */
export async function elegirColegio(colegioId: number | null) {
  await sesionAccion(ROLES_PANEL);
  const c = await cookies();
  if (colegioId) {
    c.set(COOKIE_COLEGIO, String(colegioId), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  } else {
    c.delete(COOKIE_COLEGIO);
  }
  refresh();
}
