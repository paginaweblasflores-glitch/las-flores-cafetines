"use server";

import { refresh } from "next/cache";
import { sesionAccion } from "@/lib/auth";
import { mensajeError } from "@/lib/supabase";
import { mesActual, nombreMes } from "@/lib/format";
import { guardarReporte } from "@/lib/reporte-mensual";
import type { Resultado } from "@/lib/types";

/** Administración vuelve a generar un reporte (por ejemplo, si se corrigió algo de ese mes) */
export async function regenerarReporte(mes: string): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["ADMIN"]);
    if (!/^\d{4}-\d{2}$/.test(mes) || mes >= mesActual()) return { ok: false, error: "Solo se generan meses que ya terminaron." };
    await guardarReporte(mes, sesion.uid);
    refresh();
    return { ok: true, mensaje: `Reporte de ${nombreMes(mes)} generado de nuevo.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
