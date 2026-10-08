"use server";

import { refresh } from "next/cache";
import { sesionAccion } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import type { Sesion } from "@/lib/types";

/** El personal solo puede tocar productos de su propio colegio */
async function validarColegio(sesion: Sesion, productoColegioIds: number[]) {
  if (sesion.rol !== "PERSONAL") return;
  if (productoColegioIds.length === 0) return;
  const filas = check(
    await db().from("producto_colegio").select("id, colegio_id").in("id", productoColegioIds),
  ) as { id: number; colegio_id: number }[];
  if (filas.length !== new Set(productoColegioIds).size || filas.some((f) => f.colegio_id !== sesion.colegioId)) {
    throw new Error("Solo puedes registrar productos de tu colegio.");
  }
}

/**
 * unidades = conteo TOTAL de unidades que quedan en el cafetín.
 * merma    = (solo productos del día) cuántas de las que quedan se retiran y por qué.
 */
export type CambioRegistro = {
  id: number;
  unidades?: number;
  precio?: number;
  merma?: { cantidad: number; motivo: string };
};

export type RespuestaRegistro =
  | {
      ok: true;
      vendido: number;
      ajustes: number;
      merma: number;
      /** Productos guardados (producto_colegio id) */
      guardados: number[];
      /** Productos que no se pudieron guardar y por qué (los demás sí se guardan) */
      errores: { id: number; error: string }[];
    }
  | { ok: false; error: string };

/** Guarda de una sola vez todo lo que el personal cambió en su pantalla (cada producto por separado) */
export async function guardarRegistro(cambios: CambioRegistro[]): Promise<RespuestaRegistro> {
  try {
    const sesion = await sesionAccion(["PERSONAL", "ADMIN", "LOGISTICA"]);
    const validos = cambios.filter(
      (c) =>
        Number.isInteger(c.id) &&
        (c.unidades === undefined || (Number.isInteger(c.unidades) && c.unidades >= 0 && c.unidades < 100000)) &&
        (c.precio === undefined || (Number.isFinite(c.precio) && c.precio >= 0 && c.precio < 10000)) &&
        (c.merma === undefined ||
          (Number.isInteger(c.merma.cantidad) && c.merma.cantidad > 0 && c.merma.motivo.trim().length > 0)),
    );
    if (validos.length !== cambios.length) return { ok: false, error: "Hay cantidades o precios no válidos." };
    await validarColegio(sesion, validos.map((c) => c.id));

    let vendido = 0;
    let ajustes = 0;
    let merma = 0;
    const guardados: number[] = [];
    const errores: { id: number; error: string }[] = [];
    // Cuánto había y a qué precio antes de contar (para el registro del conteo con fecha)
    const antes = new Map(
      (
        check(
          await db().from("producto_colegio").select("id, stock_unidades, precio_venta").in("id", validos.map((c) => c.id)),
        ) as { id: number; stock_unidades: number; precio_venta: number }[]
      ).map((f) => [f.id, f]),
    );
    for (const c of validos) {
      try {
        let conteo = { vendido: 0, ajuste: 0 };
        // Primero el precio, para que la venta se registre con el precio nuevo
        if (c.precio !== undefined) {
          check(
            await db().rpc("fn_cambiar_precio", {
            p_producto_colegio_id: c.id,
            p_precio: c.precio,
              p_usuario_id: sesion.uid,
            }),
          );
        }
        if (c.unidades !== undefined) {
          const r = check(
            await db().rpc("fn_registrar_conteo", {
            p_producto_colegio_id: c.id,
              p_unidades: c.unidades,
              p_usuario_id: sesion.uid,
              p_observacion: null,
            }),
          ) as { vendido: number; ajuste: number };
          conteo = r;
          vendido += r.vendido;
          ajustes += r.ajuste;
        }
        // Productos del día: lo que sobra se retira como merma (no cuenta como venta)
        if (c.merma) {
          const fila = check(
            await db().from("producto_colegio").select("stock_unidades").eq("id", c.id).single(),
          ) as { stock_unidades: number };
          if (c.merma.cantidad > fila.stock_unidades) {
            throw new Error(`La merma (${c.merma.cantidad}) no puede ser mayor a lo que queda (${fila.stock_unidades}).`);
          }
          check(
            await db().rpc("fn_ajustar_stock", {
            p_producto_colegio_id: c.id,
              p_unidades: fila.stock_unidades - c.merma.cantidad,
              p_tipo: "MERMA",
              p_usuario_id: sesion.uid,
              p_observacion: c.merma.motivo.trim(),
            }),
          );
          merma += c.merma.cantidad;
        }
        // Queda anotado en el conteo de hoy (o de la semana) con lo que había, quedó y se vendió
        // (si falla no se marca error: el conteo ya se guardó y repetirlo duplicaría la venta)
        if (c.unidades !== undefined || c.merma) {
          const a = antes.get(c.id);
          const { error } = await db().rpc("fn_anotar_conteo", {
            p_producto_colegio_id: c.id,
            p_habia: a?.stock_unidades ?? 0,
            p_quedan: c.unidades ?? a?.stock_unidades ?? 0,
            p_vendido: conteo.vendido,
            p_ajuste: conteo.ajuste,
            p_precio: c.precio ?? Number(a?.precio_venta ?? 0),
            p_sobrante: c.merma?.cantidad ?? 0,
            p_motivo: c.merma?.motivo ?? null,
            p_usuario_id: sesion.uid,
          });
          if (error) console.error("No se pudo anotar el conteo con fecha:", error.message);
        }
        guardados.push(c.id);
      } catch (e) {
        errores.push({ id: c.id, error: mensajeError(e) });
      }
    }
    refresh();
    return { ok: true, vendido, ajustes, merma, guardados, errores };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** El personal ajusta el stock mínimo de un producto de su colegio (cuándo avisar que se está acabando) */
export async function cambiarMinimo(productoColegioId: number, minimo: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sesion = await sesionAccion(["PERSONAL", "ADMIN", "LOGISTICA"]);
    if (!Number.isInteger(minimo) || minimo < 0 || minimo > 100000) return { ok: false, error: "Escribe un número entero (0 o más)." };
    await validarColegio(sesion, [productoColegioId]);
    check(
      await db()
        .from("producto_colegio")
        .update({ stock_minimo: minimo, updated_at: new Date().toISOString(), updated_by: sesion.uid })
        .eq("id", productoColegioId),
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
