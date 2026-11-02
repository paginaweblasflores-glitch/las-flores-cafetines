"use server";

import { refresh } from "next/cache";
import { sesionAccion, ROLES_PANEL } from "@/lib/auth";
import { enParalelo } from "@/lib/paralelo";
import { check, db, mensajeError } from "@/lib/supabase";
import type { Presentacion, Resultado } from "@/lib/types";

const PRESENTACIONES: Presentacion[] = ["UNIDAD", "CAJA", "PAQUETE", "BOLSA", "OTRO", "BALDE", "TAPER", "LITRO"];

const entero = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
const decimal = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Una línea de entrega: N cajas/paquetes de X unidades + Y sueltas (el stock sube en unidades) */
export type LineaIngreso = {
  productoColegioId: number;
  cajas: number;
  unidadesPorCaja: number;
  sueltas: number;
  costo: number | null;
};

/** Lo de una reposición que está fuera del catálogo: se llena igual, pero no se vende ni entra al stock */
export type LineaFueraCatalogo = {
  itemId: number;
  presentacion: Presentacion;
  cajas: number;
  unidadesPorCaja: number;
  sueltas: number;
  costo: number;
};

/** Logística registra una entrega de mercadería a un colegio (varias líneas); si la jaló de una reposición, esta queda comprada */
export async function registrarIngresos(
  fecha: string,
  lineas: LineaIngreso[],
  observacion: string,
  reposicion?: { id: number; fuera: LineaFueraCatalogo[] },
): Promise<Resultado> {
  try {
    // Las entregas las registra logística; administración las ve en el historial
    const sesion = await sesionAccion(["LOGISTICA"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha no válida." };
    const validas = lineas.filter((l) => l.cajas > 0 || l.sueltas > 0);
    const fuera = reposicion?.fuera ?? [];
    if (validas.length === 0 && fuera.length === 0) return { ok: false, error: "Agrega al menos un producto con cantidad." };
    for (const f of fuera) {
      if (!entero(f.cajas) || !entero(f.sueltas) || !decimal(f.costo) || f.costo <= 0 || f.costo > 100000 || !PRESENTACIONES.includes(f.presentacion)) {
        return { ok: false, error: "Revisa las cantidades y costos de lo que está fuera del catálogo." };
      }
      if (f.cajas + f.sueltas <= 0 || (f.cajas > 0 && (!Number.isInteger(f.unidadesPorCaja) || f.unidadesPorCaja < 1))) {
        return { ok: false, error: "Revisa las cantidades de lo que está fuera del catálogo." };
      }
    }
    for (const l of validas) {
      if (!entero(l.cajas) || !entero(l.sueltas) || (l.costo !== null && !decimal(l.costo))) {
        return { ok: false, error: "Revisa las cantidades y costos (no pueden ser negativos)." };
      }
      if (l.cajas > 0 && (!Number.isInteger(l.unidadesPorCaja) || l.unidadesPorCaja < 1)) {
        return { ok: false, error: "Indica cuántas unidades trae cada caja o paquete." };
      }
    }
    const filas = check(
      await db()
        .from("producto_colegio")
        .select("id, colegio_id, producto_id")
        .in("id", validas.map((l) => l.productoColegioId)),
    ) as { id: number; colegio_id: number; producto_id: number }[];
    if (filas.length !== new Set(validas.map((l) => l.productoColegioId)).size) {
      return { ok: false, error: "Hay un producto que ya no existe. Recarga la página." };
    }
    // De una reposición: se marca lo que sale en esta entrega; lo demás sigue pendiente
    const ahora = new Date().toISOString();
    let marcados: number[] = [];
    let pendientes: string[] = [];
    let colegioReposicion = 0;
    const nombreFuera = new Map<number, string>();
    const deshacer = async () => {
      if (!reposicion) return;
      await db()
        .from("reposicion_items")
        .update({ entregado_at: null, presentacion: null, cajas: null, unidades_por_caja: null, sueltas: null, costo_presentacion: null, costo: null, costo_fecha: null, costo_por: null })
        .in("id", fuera.map((f) => f.itemId));
      await db().from("reposicion_items").update({ entregado_at: null }).in("id", marcados);
      await db().from("reposiciones").update({ estado: estadoAntes, comprado_por: null, comprado_at: null }).eq("id", reposicion.id);
    };
    let estadoAntes = "APROBADA";
    if (reposicion) {
      const r = check(
        await db().from("reposiciones").select("colegio_id, estado, items:reposicion_items(id, nombre, producto_id, quitado, entregado_at)").eq("id", reposicion.id).single(),
      ) as { colegio_id: number; estado: string; items: { id: number; nombre: string; producto_id: number | null; quitado: boolean; entregado_at: string | null }[] };
      if (r.estado !== "APROBADA" && r.estado !== "EN_COMPRA") return { ok: false, error: "Esa reposición ya se registró." };
      estadoAntes = r.estado;
      colegioReposicion = r.colegio_id;
      for (const i of r.items) nombreFuera.set(i.id, i.nombre);
      if (filas.some((f) => f.colegio_id !== r.colegio_id)) return { ok: false, error: "Hay productos de otro colegio en esta reposición." };
      const porEntregar = r.items.filter((i) => !i.quitado && !i.entregado_at);
      if (fuera.some((f) => !porEntregar.some((i) => i.id === f.itemId && i.producto_id == null))) {
        return { ok: false, error: "Esa reposición cambió. Recarga la página." };
      }
      // Lo del catálogo se reconoce por el producto (aunque se haya corregido en el formulario)
      const productos = new Set(filas.map((f) => f.producto_id));
      const salen = porEntregar.filter((i) => (i.producto_id != null ? productos.has(i.producto_id) : fuera.some((f) => f.itemId === i.id)));
      pendientes = porEntregar.filter((i) => !salen.includes(i)).map((i) => i.nombre);
      try {
        await enParalelo(fuera, 6, async (f) => {
          const unidades = f.cajas * (f.cajas > 0 ? f.unidadesPorCaja : 0) + f.sueltas;
          // El costo es por caja (también si solo hay sueltas), o por unidad si se compra suelto
          const porCaja = f.presentacion === "UNIDAD" ? 1 : f.unidadesPorCaja || 1;
          check(
            await db()
              .from("reposicion_items")
              .update({
                presentacion: f.presentacion,
                cajas: f.cajas,
                unidades_por_caja: f.cajas > 0 ? f.unidadesPorCaja : null,
                sueltas: f.sueltas,
                costo_presentacion: f.costo,
                // El total es el gasto que se descuenta de la ganancia del mes de la entrega
                costo: Math.round(((unidades * f.costo) / porCaja) * 100) / 100,
                costo_fecha: fecha,
                costo_por: sesion.uid,
              })
              .eq("id", f.itemId),
          );
        });
        marcados = salen.map((i) => i.id);
        if (marcados.length) check(await db().from("reposicion_items").update({ entregado_at: ahora }).in("id", marcados));
        // Ya salió todo: queda comprada
        if (pendientes.length === 0) {
          check(await db().from("reposiciones").update({ estado: "COMPRADA", comprado_por: sesion.uid, comprado_at: ahora }).eq("id", reposicion.id));
        }
      } catch (e) {
        await deshacer();
        throw e;
      }
    }
    // Queda por recibir: el stock sube cuando el personal del colegio la confirma
    const lotes = new Map<number, string>();
    try {
      // Lo de fuera del catálogo va en la misma entrega: el personal lo recibe, pero no entra al stock
      if (fuera.length) lotes.set(colegioReposicion, crypto.randomUUID());
      const deFuera = fuera.map((f) => ({
        fecha,
        colegio_id: colegioReposicion,
        producto_id: null,
        producto_colegio_id: null,
        nombre: nombreFuera.get(f.itemId) ?? "Producto",
        reposicion_item_id: f.itemId,
        cantidad_enviada: f.cajas * (f.cajas > 0 ? f.unidadesPorCaja : 0) + f.sueltas,
        cajas: f.cajas,
        unidades_por_caja: f.presentacion === "UNIDAD" ? 1 : f.unidadesPorCaja || 1,
        unidades_sueltas: f.sueltas,
        costo_presentacion: f.costo,
        observacion: observacion.trim() || null,
        enviado_por: sesion.uid,
        origen: "LOGISTICA",
        lote: lotes.get(colegioReposicion),
      }));
      const delCatalogo = validas.map((l) => {
        const f = filas.find((x) => x.id === l.productoColegioId)!;
        if (!lotes.has(f.colegio_id)) lotes.set(f.colegio_id, crypto.randomUUID());
        return {
          fecha,
          colegio_id: f.colegio_id,
          producto_id: f.producto_id as number | null,
          producto_colegio_id: f.id as number | null,
          nombre: null as string | null,
          reposicion_item_id: null as number | null,
          cantidad_enviada: l.cajas * (l.cajas > 0 ? l.unidadesPorCaja : 0) + l.sueltas,
          cajas: l.cajas,
          unidades_por_caja: l.cajas > 0 ? l.unidadesPorCaja : null,
          unidades_sueltas: l.sueltas,
          costo_presentacion: l.costo,
          observacion: observacion.trim() || null,
          enviado_por: sesion.uid,
          origen: "LOGISTICA",
          lote: lotes.get(f.colegio_id),
        };
      });
      // Todo junto: si falla, no queda nada a medias
      check(await db().from("envios").insert([...delCatalogo, ...deFuera]));
    } catch (e) {
      await deshacer();
      throw e;
    }
    refresh();
    const extra =
      (fuera.length ? ` ${fuera.length} fuera del catálogo: el personal lo recibe, pero no entra al stock.` : "") +
      (pendientes.length ? ` Queda pendiente: ${pendientes.join(", ")}.` : "");
    return {
      ok: true,
      mensaje: validas.length
        ? `Entrega registrada (${validas.length} producto${validas.length === 1 ? "" : "s"}). El stock sube cuando el colegio la recibe.${extra}`
        : `Entrega registrada.${extra}`,
    };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Corrige el stock (conteo físico) o registra una merma. `unidades` = stock total que queda */
export async function ajustarStock(
  productoColegioId: number,
  unidades: number,
  tipo: "AJUSTE" | "MERMA",
  motivo: string,
): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    if (!entero(unidades)) return { ok: false, error: "La cantidad debe ser un número entero (0 o más)." };
    if (!motivo.trim()) return { ok: false, error: "Escribe el motivo del ajuste." };
    check(
      await db().rpc("fn_ajustar_stock", {
        p_producto_colegio_id: productoColegioId,
        p_unidades: unidades,
        p_tipo: tipo,
        p_usuario_id: sesion.uid,
        p_observacion: motivo.trim(),
      }),
    );
    refresh();
    return { ok: true, mensaje: "Stock actualizado." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

export type DatosProductoColegio = {
  presentacion: Presentacion;
  unidadesPorPresentacion: number;
  costoPresentacion: number;
  precioVenta: number;
  stockMinimo: number;
  activo: boolean;
  observacion: string;
};

function validarDatos(d: DatosProductoColegio): string | null {
  if (!PRESENTACIONES.includes(d.presentacion)) return "Presentación no válida.";
  if (!Number.isInteger(d.unidadesPorPresentacion) || d.unidadesPorPresentacion < 1)
    return "Las unidades por caja/paquete deben ser 1 o más.";
  if (!decimal(d.costoPresentacion) || !decimal(d.precioVenta)) return "Los precios no pueden ser negativos.";
  if (!entero(d.stockMinimo)) return "El stock mínimo debe ser un número entero.";
  return null;
}

/** Edita la configuración de un producto en un colegio (la fila de la hoja CONTROL) */
export async function actualizarProductoColegio(id: number, d: DatosProductoColegio): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    const error = validarDatos(d);
    if (error) return { ok: false, error };
    const unidades = d.presentacion === "UNIDAD" ? 1 : d.unidadesPorPresentacion;
    check(
      await db()
        .from("producto_colegio")
        .update({
          presentacion: d.presentacion,
          unidades_por_presentacion: unidades,
          costo_presentacion: d.costoPresentacion,
          stock_minimo: d.stockMinimo,
          activo: d.activo,
          observacion: d.observacion.trim() || null,
          updated_at: new Date().toISOString(),
          updated_by: sesion.uid,
        })
        .eq("id", id),
    );
    // El precio va por la función para que quede en el historial
    check(
      await db().rpc("fn_cambiar_precio", {
        p_producto_colegio_id: id,
        p_precio: d.precioVenta,
        p_usuario_id: sesion.uid,
      }),
    );
    refresh();
    return { ok: true, mensaje: "Producto actualizado." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
