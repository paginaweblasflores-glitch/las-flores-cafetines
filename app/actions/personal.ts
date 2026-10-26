"use server";

import { refresh } from "next/cache";
import { mayusculas } from "@/lib/format";
import { sesionAccion } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import { enParalelo } from "@/lib/paralelo";
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
  /** Del día que prepara el mismo personal: cuántos preparó hoy (entra al stock antes de contar) */
  preparado?: number;
  unidades?: number;
  precio?: number;
  /** El precio nuevo es un descuento (se guarda el precio normal para volver) */
  descuento?: boolean;
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
    const sesion = await sesionAccion(["PERSONAL"]);
    const validos = cambios.filter(
      (c) =>
        Number.isInteger(c.id) &&
        (c.unidades === undefined || (Number.isInteger(c.unidades) && c.unidades >= 0 && c.unidades < 100000)) &&
        (c.preparado === undefined || (Number.isInteger(c.preparado) && c.preparado > 0 && c.preparado < 100000)) &&
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
    // Cada producto es independiente: se guardan varios a la vez (antes era uno por uno)
    await enParalelo(validos, 6, async (c) => {
      try {
        let conteo = { vendido: 0, ajuste: 0 };
        // Primero el precio, para que la venta se registre con el precio nuevo
        if (c.precio !== undefined) {
          check(
            await db().rpc("fn_cambiar_precio", {
            p_producto_colegio_id: c.id,
            p_precio: c.precio,
              p_usuario_id: sesion.uid,
              // Solo se manda si es descuento (un cambio normal quita el descuento: es el valor por defecto)
              ...(c.descuento ? { p_descuento: true } : {}),
            }),
          );
        }
        // Lo que preparó hoy el personal entra al stock antes de contar (así la venta sale bien)
        if (c.preparado) {
          check(
            await db().rpc("fn_registrar_ingreso", {
              p_producto_colegio_id: c.id,
              p_cajas: 0,
              p_unidades_por_caja: null,
              p_unidades_sueltas: c.preparado,
              p_costo_presentacion: null,
              p_usuario_id: sesion.uid,
              p_fecha: null,
              p_observacion: "Preparado en el cafetín",
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
          // Si se acaba de contar, lo que queda es lo contado (no hace falta volver a leerlo)
          const fila =
            c.unidades !== undefined
              ? { stock_unidades: c.unidades }
              : (check(await db().from("producto_colegio").select("stock_unidades").eq("id", c.id).single()) as {
                  stock_unidades: number;
                });
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
        if (c.unidades !== undefined || c.merma || c.preparado) {
          const a = antes.get(c.id);
          const { error } = await db().rpc("fn_anotar_conteo", {
            p_producto_colegio_id: c.id,
            p_habia: (a?.stock_unidades ?? 0) + (c.preparado ?? 0),
            p_quedan: c.unidades ?? (a?.stock_unidades ?? 0) + (c.preparado ?? 0),
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
    });
    refresh();
    return { ok: true, vendido, ajustes, merma, guardados, errores };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** El personal ajusta el stock mínimo de un producto de su colegio (cuándo avisar que se está acabando) */
export async function cambiarMinimo(productoColegioId: number, minimo: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sesion = await sesionAccion(["PERSONAL"]);
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

/**
 * Corrige en un paso lo que se contó hoy de un producto: se deshace lo de hoy y se guarda con
 * los números nuevos (cuántos quedan, sobrante y lo preparado), como si se hubiera contado bien.
 */
export async function corregirConteoHoy(
  productoColegioId: number,
  d: { quedan: number; sobrante: number; motivo: string | null; preparado: number },
): Promise<RespuestaRegistro> {
  try {
    const sesion = await sesionAccion(["PERSONAL"]);
    const entero = (n: number) => Number.isInteger(n) && n >= 0 && n < 100000;
    if (!Number.isInteger(productoColegioId) || !entero(d.quedan) || !entero(d.sobrante) || !entero(d.preparado)) {
      return { ok: false, error: "Revisa los números (enteros, 0 o más)." };
    }
    if (d.sobrante > d.quedan) return { ok: false, error: "El sobrante no puede ser mayor a lo que queda." };
    await validarColegio(sesion, [productoColegioId]);
    check(await db().rpc("fn_deshacer_conteo_hoy", { p_producto_colegio_id: productoColegioId, p_usuario_id: sesion.uid }));
    return await guardarRegistro([
      {
        id: productoColegioId,
        unidades: d.quedan,
        ...(d.preparado > 0 ? { preparado: d.preparado } : {}),
        ...(d.sobrante > 0 ? { merma: { cantidad: d.sobrante, motivo: d.motivo?.trim() || "No se vendió" } } : {}),
      },
    ]);
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/**
 * El personal retira un producto de SU cafetín (ya no lo vende): se desactiva solo en su colegio,
 * igual que desmarcar el colegio en el Catálogo. No se borra nada: administración lo vuelve a activar
 * marcando el colegio en el Catálogo.
 */
export async function retirarProducto(productoColegioId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sesion = await sesionAccion(["PERSONAL"]);
    if (!Number.isInteger(productoColegioId)) return { ok: false, error: "Producto no válido." };
    await validarColegio(sesion, [productoColegioId]);
    check(
      await db()
        .from("producto_colegio")
        .update({ activo: false, updated_at: new Date().toISOString(), updated_by: sesion.uid })
        .eq("id", productoColegioId),
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Lo que se anota en el historial: así administración distingue los ajustes del personal */
const PREFIJO_AJUSTE = "Ajuste del personal: ";

/**
 * El personal corrige la cantidad que hay (no es venta): el sistema dice 5 y hay 4 o 7.
 * El motivo es obligatorio. "Se dañó o venció" queda como merma; lo demás, como ajuste.
 * No toca las ventas ni "Vendido hoy".
 */
export async function ajustarCantidad(
  productoColegioId: number,
  unidades: number,
  motivo: string,
  esMerma: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sesion = await sesionAccion(["PERSONAL"]);
    if (!Number.isInteger(productoColegioId)) return { ok: false, error: "Producto no válido." };
    if (!Number.isInteger(unidades) || unidades < 0 || unidades >= 100000) return { ok: false, error: "Escribe cuántas hay (0 o más)." };
    const m = motivo.trim();
    if (m.length < 3) return { ok: false, error: "Elige o escribe el motivo." };
    await validarColegio(sesion, [productoColegioId]);
    const fila = check(await db().from("producto_colegio").select("stock_unidades").eq("id", productoColegioId).single()) as {
      stock_unidades: number;
    };
    if (fila.stock_unidades === unidades) return { ok: false, error: "Es la misma cantidad que dice el sistema." };
    // Merma solo si hay menos (lo dañado sale); si hay más, siempre es ajuste
    const tipo = esMerma && unidades < fila.stock_unidades ? "MERMA" : "AJUSTE";
    check(
      await db().rpc("fn_ajustar_stock", {
        p_producto_colegio_id: productoColegioId,
        p_unidades: unidades,
        p_tipo: tipo,
        p_usuario_id: sesion.uid,
        p_observacion: PREFIJO_AJUSTE + m.slice(0, 200),
      }),
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

const NOTA_ARRANQUE = "Inventario de arranque";

/**
 * Inventario de arranque: el personal registra cuántas hay de verdad de cada producto (los que se guardan).
 * Se puede hacer por partes: lo registrado queda marcado y sale de la lista. No es venta.
 */
export async function registrarArranque(items: { id: number; unidades: number }[]): Promise<{ ok: true; guardados: number } | { ok: false; error: string }> {
  try {
    const sesion = await sesionAccion(["PERSONAL"]);
    const validos = items.filter((i) => Number.isInteger(i.id) && Number.isInteger(i.unidades) && i.unidades >= 0 && i.unidades < 100000);
    if (validos.length === 0 || validos.length !== items.length) return { ok: false, error: "Revisa las cantidades (números enteros, 0 o más)." };
    await validarColegio(sesion, validos.map((i) => i.id));
    const ahora = new Date().toISOString();
    await enParalelo(validos, 6, async (i) => {
      check(
        await db().rpc("fn_ajustar_stock", {
          p_producto_colegio_id: i.id,
          p_unidades: i.unidades,
          p_tipo: "AJUSTE",
          p_usuario_id: sesion.uid,
          p_observacion: NOTA_ARRANQUE,
        }),
      );
      check(await db().from("producto_colegio").update({ arranque_at: ahora, ultimo_conteo: ahora }).eq("id", i.id));
    });
    refresh();
    return { ok: true, guardados: validos.length };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/**
 * Producto que el cafetín tiene y no está en el sistema: se crea solo para este colegio con su precio
 * y lo que hay. Queda "por revisar" para que administración complete el costo y cómo se compra.
 * Si ya existe en otro colegio, se agrega a este (no se duplica).
 */
export async function crearProductoArranque(d: {
  nombre: string;
  categoriaId: number | null;
  unidades: number;
  precio: number;
}): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  try {
    const sesion = await sesionAccion(["PERSONAL"]);
    const colegioId = sesion.colegioId;
    if (!colegioId) return { ok: false, error: "Tu usuario no tiene colegio asignado." };
    const nombre = mayusculas(d.nombre);
    if (nombre.length < 2) return { ok: false, error: "Escribe el nombre del producto." };
    if (!Number.isInteger(d.unidades) || d.unidades < 0 || d.unidades >= 100000) return { ok: false, error: "Escribe cuántas hay (0 o más)." };
    if (!Number.isFinite(d.precio) || d.precio <= 0 || d.precio >= 10000) return { ok: false, error: "Escribe el precio de venta." };

    // ¿Ya existe? (mismo nombre, sin importar mayúsculas)
    const ya = check(
      await db().from("productos").select("id, nombre").ilike("nombre", nombre.replace(/[%_\\]/g, "\\$&")).limit(1),
    ) as { id: number; nombre: string }[];
    let productoId = ya[0]?.id ?? null;
    if (productoId) {
      const aqui = check(
        await db().from("producto_colegio").select("id, activo").eq("producto_id", productoId).eq("colegio_id", colegioId),
      ) as { id: number; activo: boolean }[];
      if (aqui.length && aqui[0].activo) return { ok: false, error: `"${ya[0].nombre}" ya está en tu lista: búscalo y escribe cuántas hay.` };
      if (aqui.length) {
        // Estaba retirado de este cafetín: se vuelve a poner
        check(await db().from("producto_colegio").update({ activo: true, updated_by: sesion.uid }).eq("id", aqui[0].id));
        await registrarArranque([{ id: aqui[0].id, unidades: d.unidades }]);
        return { ok: true, mensaje: `"${ya[0].nombre}" vuelve a tu lista con ${d.unidades}.` };
      }
    } else {
      const p = check(
        await db()
          .from("productos")
          .insert({ nombre, categoria_id: d.categoriaId, perecible: false, de_cocina: false, por_revisar: true })
          .select("id")
          .single(),
      ) as { id: number };
      productoId = p.id;
    }
    const pc = check(
      await db()
        .from("producto_colegio")
        .insert({
          colegio_id: colegioId,
          producto_id: productoId,
          presentacion: "UNIDAD",
          unidades_por_presentacion: 1,
          costo_presentacion: 0,
          precio_venta: Math.round(d.precio * 100) / 100,
          stock_minimo: 0,
          stock_unidades: 0,
          activo: true,
          updated_by: sesion.uid,
        })
        .select("id")
        .single(),
    ) as { id: number };
    // Que administración lo revise (costo, cómo se compra, mínimo)
    check(await db().from("productos").update({ por_revisar: true }).eq("id", productoId));
    if (d.unidades > 0) {
      check(
        await db().rpc("fn_ajustar_stock", {
          p_producto_colegio_id: pc.id,
          p_unidades: d.unidades,
          p_tipo: "AJUSTE",
          p_usuario_id: sesion.uid,
          p_observacion: `${NOTA_ARRANQUE} (producto nuevo)`,
        }),
      );
    }
    const ahora = new Date().toISOString();
    check(await db().from("producto_colegio").update({ arranque_at: ahora, ultimo_conteo: ahora }).eq("id", pc.id));
    refresh();
    return { ok: true, mensaje: `"${nombre}" creado con ${d.unidades}. Administración completará el costo.` };
  } catch (e) {
    const msg = mensajeError(e);
    return { ok: false, error: msg.startsWith("Ya existe") ? "Ya existe un producto con ese nombre." : msg };
  }
}
