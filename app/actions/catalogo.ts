"use server";

import { refresh } from "next/cache";
import { sesionAccion, ROLES_PANEL } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import type { Presentacion, Resultado } from "@/lib/types";

const PRESENTACIONES: Presentacion[] = ["UNIDAD", "CAJA", "PAQUETE", "BOLSA", "OTRO"];

/**
 * Edita nombre/categoría/activo, en qué colegios se vende y el precio en cada uno.
 * - Colegio nuevo: se agrega con stock 0, el costo de otro colegio y su propio precio.
 * - Precio distinto en un colegio que ya lo vendía: se cambia y queda en el historial de precios.
 * - Colegio desmarcado: se desactiva ahí (no se borra su historial).
 */
export async function editarProducto(
  id: number,
  d: {
    nombre: string;
    categoriaId: number | null;
    activo: boolean;
    perecible: boolean;
    colegioIds: number[];
    /** Precio de venta por unidad en cada colegio marcado */
    precios?: Record<number, number>;
  },
): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    const nombre = d.nombre.trim().replace(/\s+/g, " ");
    if (nombre.length < 2) return { ok: false, error: "Escribe el nombre del producto." };
    const precios = d.precios ?? {};
    if (Object.values(precios).some((p) => !Number.isFinite(p) || p < 0)) {
      return { ok: false, error: "Los precios no pueden ser negativos." };
    }
    check(
      await db()
        .from("productos")
        .update({ nombre, categoria_id: d.categoriaId, activo: d.activo, perecible: d.perecible })
        .eq("id", id),
    );

    type Fila = {
      id: number;
      colegio_id: number;
      activo: boolean;
      presentacion: Presentacion;
      unidades_por_presentacion: number;
      costo_presentacion: number;
      precio_venta: number;
      stock_minimo: number;
    };
    const filas = check(
      await db()
        .from("producto_colegio")
        .select("id, colegio_id, activo, presentacion, unidades_por_presentacion, costo_presentacion, precio_venta, stock_minimo")
        .eq("producto_id", id),
    ) as Fila[];
    const modelo = filas.find((f) => f.activo) ?? filas[0];

    for (const colegioId of d.colegioIds) {
      const fila = filas.find((f) => f.colegio_id === colegioId);
      const precio = precios[colegioId];
      if (fila) {
        if (!fila.activo) check(await db().from("producto_colegio").update({ activo: true, updated_by: sesion.uid }).eq("id", fila.id));
        // El precio va por la función para que quede en el historial de precios
        if (precio !== undefined && precio !== Number(fila.precio_venta)) {
          check(await db().rpc("fn_cambiar_precio", { p_producto_colegio_id: fila.id, p_precio: precio, p_usuario_id: sesion.uid }));
        }
      } else {
        check(
          await db().from("producto_colegio").insert({
            colegio_id: colegioId,
            producto_id: id,
            presentacion: modelo?.presentacion ?? "UNIDAD",
            unidades_por_presentacion: modelo?.unidades_por_presentacion ?? 1,
            costo_presentacion: modelo?.costo_presentacion ?? 0,
            precio_venta: precio ?? modelo?.precio_venta ?? 0,
            stock_minimo: modelo?.stock_minimo ?? 5,
            stock_unidades: 0,
            activo: true,
            updated_by: sesion.uid,
          }),
        );
      }
    }
    for (const f of filas) {
      if (f.activo && !d.colegioIds.includes(f.colegio_id)) {
        check(await db().from("producto_colegio").update({ activo: false, updated_by: sesion.uid }).eq("id", f.id));
      }
    }
    refresh();
    return { ok: true, mensaje: "Producto actualizado." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

export async function crearCategoria(nombre: string): Promise<Resultado> {
  try {
    await sesionAccion(ROLES_PANEL);
    const limpio = nombre.trim().replace(/\s+/g, " ");
    if (limpio.length < 2) return { ok: false, error: "Escribe el nombre de la categoría." };
    const max = check(await db().from("categorias").select("orden").order("orden", { ascending: false }).limit(1)) as {
      orden: number;
    }[];
    check(await db().from("categorias").insert({ nombre: limpio, orden: (max[0]?.orden ?? 0) + 1 }));
    refresh();
    return { ok: true, mensaje: "Categoría creada." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

export type NuevoProducto = {
  nombre: string;
  categoriaId: number | null;
  perecible: boolean;
  colegioIds: number[];
  presentacion: Presentacion;
  unidadesPorPresentacion: number;
  costoPresentacion: number;
  /** Precio de venta por unidad en cada colegio (cada colegio puede vender a su precio) */
  precios: Record<number, number>;
  stockMinimo: number;
  /** Stock inicial en unidades por colegio (vacío = 0) */
  stockInicial: Record<number, number>;
};

/** Crea un producto en el catálogo y lo deja listo en los colegios elegidos */
export async function crearProducto(d: NuevoProducto): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    const nombre = d.nombre.trim().replace(/\s+/g, " ");
    if (nombre.length < 2) return { ok: false, error: "Escribe el nombre del producto." };
    if (d.colegioIds.length === 0) return { ok: false, error: "Marca al menos un colegio donde se venderá." };
    if (!PRESENTACIONES.includes(d.presentacion)) return { ok: false, error: "Presentación no válida." };
    const unidades = d.presentacion === "UNIDAD" ? 1 : d.unidadesPorPresentacion;
    if (!Number.isInteger(unidades) || unidades < 1) return { ok: false, error: "Las unidades por caja/paquete deben ser 1 o más." };
    const decimal = (n: number) => Number.isFinite(n) && n >= 0;
    if (!decimal(d.costoPresentacion) || d.colegioIds.some((id) => !decimal(d.precios[id]))) {
      return { ok: false, error: "Escribe el precio de venta de cada colegio (no puede ser negativo)." };
    }
    if (!Number.isInteger(d.stockMinimo) || d.stockMinimo < 0) return { ok: false, error: "El stock mínimo debe ser un número entero." };
    for (const id of d.colegioIds) {
      const st = d.stockInicial[id] ?? 0;
      if (!Number.isInteger(st) || st < 0) return { ok: false, error: "El stock inicial debe ser un número entero (0 o más)." };
    }

    const creado = check(
      await db().from("productos").insert({ nombre, categoria_id: d.categoriaId, perecible: d.perecible }).select("id").single(),
    ) as { id: number };

    const filas = d.colegioIds.map((colegioId) => ({
      colegio_id: colegioId,
      producto_id: creado.id,
      presentacion: d.presentacion,
      unidades_por_presentacion: unidades,
      costo_presentacion: d.costoPresentacion,
      precio_venta: d.precios[colegioId],
      stock_minimo: d.stockMinimo,
      stock_unidades: 0,
      activo: true,
      updated_by: sesion.uid,
    }));
    const res = await db().from("producto_colegio").insert(filas).select("id, colegio_id");
    if (res.error) {
      // Si falla, no dejar el producto suelto en el catálogo
      await db().from("productos").delete().eq("id", creado.id);
      throw new Error(res.error.message);
    }
    // El stock inicial se registra como entrega, para que quede en el historial y en los reportes
    for (const fila of res.data as { id: number; colegio_id: number }[]) {
      const st = d.stockInicial[fila.colegio_id] ?? 0;
      if (st > 0) {
        check(
          await db().rpc("fn_registrar_ingreso", {
            p_producto_colegio_id: fila.id,
            p_cajas: 0,
            p_unidades_por_caja: null,
            p_unidades_sueltas: st,
            p_costo_presentacion: null,
            p_usuario_id: sesion.uid,
            p_fecha: null,
            p_observacion: "Stock inicial al crear el producto",
          }),
        );
      }
    }
    refresh();
    return {
      ok: true,
      mensaje: `"${nombre}" creado en ${d.colegioIds.length} colegio${d.colegioIds.length === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    const msg = mensajeError(e);
    return { ok: false, error: msg.startsWith("Ya existe") ? "Ya existe un producto con ese nombre en el catálogo." : msg };
  }
}
