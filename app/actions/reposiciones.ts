"use server";

import { refresh } from "next/cache";
import { sesionAccion } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import { enParalelo } from "@/lib/paralelo";
import { hoyISO, UNIDADES_REPOSICION } from "@/lib/format";
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
          nombre: it.nombre.trim(),
          cantidad: it.cantidad,
          unidad: it.unidad,
        })),
      }),
    ) as { codigo: string };
    refresh();
    return { ok: true, mensaje: `Reposición ${r.codigo} enviada para aprobación.` };
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
      mensaje: estado === "APROBADA" ? "Reposición aprobada. Ya puedes imprimirla e iniciar la compra." : "Reposición marcada como no aprobada.",
    };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Logística avisa que empieza la compra de una reposición aprobada */
export async function iniciarCompra(id: number): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["LOGISTICA"]);
    const res = check(
      await db()
        .from("reposiciones")
        .update({ estado: "EN_COMPRA", compra_por: sesion.uid, compra_at: new Date().toISOString() })
        .eq("id", id)
        .eq("estado", "APROBADA")
        .select("codigo"),
    ) as { codigo: string }[];
    if (res.length === 0) return { ok: false, error: "Esta reposición no está aprobada o ya está en compra." };
    refresh();
    return { ok: true, mensaje: `Compra de ${res[0].codigo} iniciada.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/**
 * Logística anota cuánto pagó por lo que no es del catálogo (descartables, utensilios…).
 * Ese gasto se descuenta de la ganancia del mes en que se anota.
 */
export async function registrarCostos(reposicionId: number, costos: { id: number; costo: number | null }[]): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["LOGISTICA"]);
    if (costos.some((c) => c.costo !== null && (!Number.isFinite(c.costo) || c.costo < 0 || c.costo > 100000))) {
      return { ok: false, error: "Revisa los montos (no pueden ser negativos)." };
    }
    const r = check(
      await db().from("reposiciones").select("estado, items:reposicion_items(id, producto_id, quitado, costo)").eq("id", reposicionId).single(),
    ) as { estado: string; items: { id: number; producto_id: number | null; quitado: boolean; costo: number | null }[] };
    if (r.estado !== "APROBADA" && r.estado !== "EN_COMPRA") {
      return { ok: false, error: "Solo se anotan costos de reposiciones aprobadas o en compra." };
    }
    const validos = new Set(r.items.filter((i) => i.producto_id == null && !i.quitado).map((i) => i.id));
    if (costos.some((c) => !validos.has(c.id))) return { ok: false, error: "Solo se anota el costo de lo que está fuera del catálogo." };

    const hoy = hoyISO();
    // Solo lo que cambió (re-guardar no mueve el gasto al mes de hoy)
    const antes = new Map(r.items.map((i) => [i.id, i.costo == null ? null : Number(i.costo)]));
    await enParalelo(
      costos.filter((x) => antes.get(x.id) !== x.costo),
      6,
      async (c) =>
        check(
          await db()
            .from("reposicion_items")
            .update(c.costo === null ? { costo: null, costo_fecha: null, costo_por: null } : { costo: c.costo, costo_fecha: hoy, costo_por: sesion.uid })
            .eq("id", c.id),
        ),
    );
    refresh();
    const total = costos.reduce((a, c) => a + (c.costo ?? 0), 0);
    return { ok: true, mensaje: `Costos guardados: S/ ${total.toFixed(2)}.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Logística termina la reposición: ya compró todo (y anotó el costo de lo que no es del catálogo) */
export async function marcarComprado(id: number): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(["LOGISTICA"]);
    const r = check(
      await db().from("reposiciones").select("codigo, estado, items:reposicion_items(nombre, producto_id, quitado, costo)").eq("id", id).single(),
    ) as { codigo: string; estado: string; items: { nombre: string; producto_id: number | null; quitado: boolean; costo: number | null }[] };
    if (r.estado !== "EN_COMPRA") return { ok: false, error: "Primero inicia la compra." };
    const sinCosto = r.items.filter((i) => i.producto_id == null && !i.quitado && i.costo == null).map((i) => i.nombre);
    if (sinCosto.length) return { ok: false, error: `Anota cuánto costó: ${sinCosto.join(", ")}.` };
    check(
      await db()
        .from("reposiciones")
        .update({ estado: "COMPRADA", comprado_por: sesion.uid, comprado_at: new Date().toISOString() })
        .eq("id", id)
        .eq("estado", "EN_COMPRA"),
    );
    refresh();
    return { ok: true, mensaje: `${r.codigo} comprada. Recuerda registrar la entrega al colegio.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
