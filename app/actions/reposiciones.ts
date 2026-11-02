"use server";

import { refresh } from "next/cache";
import { sesionAccion } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import { mayusculas, UNIDADES_REPOSICION } from "@/lib/format";
import type { Resultado } from "@/lib/types";

export type ItemNuevo = {
  /** Producto del catálogo, o null si se escribió a mano */
  productoId: number | null;
  nombre: string;
  cantidad: number;
  unidad: string;
};

/** El personal envía su lista de reposición para que administración la apruebe */
export async function crearReposicion(colegioId: number, items: ItemNuevo[], nota: string): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["PERSONAL", "ADMIN", "LOGISTICA"]);
    if (sesion.rol === "PERSONAL" && colegioId !== sesion.colegioId) {
      return { ok: false, error: "Solo puedes pedir para tu colegio." };
    }
    if (items.length === 0) return { ok: false, error: "Agrega al menos un producto a la lista." };
    for (const it of items) {
      if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) {
        return { ok: false, error: `La cantidad de "${it.nombre}" debe ser un número entero mayor a 0.` };
      }
      if (!UNIDADES_REPOSICION[it.unidad]) return { ok: false, error: `Unidad no válida en "${it.nombre}".` };
      if (!it.productoId && !it.nombre.trim()) return { ok: false, error: "Falta el nombre de un producto." };
    }

    const r = check(
      await db().rpc("fn_crear_reposicion", {
        p_colegio_id: colegioId,
        p_usuario_id: sesion.uid,
        p_nota: nota,
        p_items: items.map((it) => ({
          producto_id: it.productoId,
          nombre: mayusculas(it.nombre),
          cantidad: it.cantidad,
          unidad: it.unidad,
        })),
      }),
    ) as { codigo: string };
    refresh();
    return { ok: true, mensaje: `Reposición ${r.codigo} solicitada.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** El personal anula su lista mientras nadie la revisó */
export async function anularReposicion(id: number): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["PERSONAL", "ADMIN", "LOGISTICA"]);
    let q = db().from("reposiciones").update({ estado: "ANULADA" }).eq("id", id).eq("estado", "POR_APROBAR");
    if (sesion.rol === "PERSONAL") q = q.eq("colegio_id", sesion.colegioId ?? -1);
    const res = check(await q.select("codigo")) as { codigo: string }[];
    if (res.length === 0) return { ok: false, error: "Esa reposición ya fue revisada." };
    refresh();
    return { ok: true, mensaje: `Reposición ${res[0].codigo} anulada.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Logística aprueba (con lo que deja en la lista) o no aprueba */
export async function revisarReposicion(
  id: number,
  aprobar: boolean,
  items: { id: number; cantidad: number }[],
  motivo: string,
): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["LOGISTICA"]);
    if (aprobar && items.some((it) => !Number.isInteger(it.cantidad) || it.cantidad <= 0)) {
      return { ok: false, error: "Las cantidades deben ser números enteros mayores a 0." };
    }
    const estado = check(
      await db().rpc("fn_revisar_reposicion", {
        p_reposicion_id: id,
        p_usuario_id: sesion.uid,
        p_aprobar: aprobar,
        p_items: aprobar ? items : null,
        p_motivo: motivo,
      }),
    ) as string;
    refresh();
    return {
      ok: true,
      mensaje: estado === "APROBADA" ? "Reposición aprobada. Imprímela y, hecha la compra, jálala en Entregas." : "Reposición marcada como no aprobada.",
    };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Lo que faltaba de una reposición entregada por partes ya no se compra: queda cerrada */
export async function cerrarPendientes(id: number): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["LOGISTICA"]);
    const r = check(
      await db().from("reposiciones").select("codigo, estado, items:reposicion_items(id, quitado, entregado_at)").eq("id", id).single(),
    ) as { codigo: string; estado: string; items: { id: number; quitado: boolean; entregado_at: string | null }[] };
    if (r.estado !== "APROBADA" && r.estado !== "EN_COMPRA") return { ok: false, error: "Esa reposición ya está cerrada." };
    if (!r.items.some((i) => i.entregado_at)) return { ok: false, error: "Todavía no se entregó nada de esta reposición." };
    const faltan = r.items.filter((i) => !i.quitado && !i.entregado_at).map((i) => i.id);
    if (faltan.length) check(await db().from("reposicion_items").update({ quitado: true }).in("id", faltan));
    check(await db().from("reposiciones").update({ estado: "COMPRADA", comprado_por: sesion.uid, comprado_at: new Date().toISOString() }).eq("id", id));
    refresh();
    return { ok: true, mensaje: `${r.codigo} cerrada.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
