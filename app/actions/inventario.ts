"use server";

import { refresh } from "next/cache";
import { sesionAccion, ROLES_PANEL } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import type { Presentacion, Resultado } from "@/lib/types";

const PRESENTACIONES: Presentacion[] = ["UNIDAD", "CAJA", "PAQUETE", "BOLSA", "OTRO"];

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

/** Logística registra una entrega de mercadería a un colegio (varias líneas) */
export async function registrarIngresos(
  fecha: string,
  lineas: LineaIngreso[],
  observacion: string,
): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha no válida." };
    const validas = lineas.filter((l) => l.cajas > 0 || l.sueltas > 0);
    if (validas.length === 0) return { ok: false, error: "Agrega al menos un producto con cantidad." };
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
    // Queda por recibir: el stock sube cuando el personal del colegio la confirma
    const lotes = new Map<number, string>();
    check(
      await db()
        .from("envios")
        .insert(
          validas.map((l) => {
            const f = filas.find((x) => x.id === l.productoColegioId)!;
            if (!lotes.has(f.colegio_id)) lotes.set(f.colegio_id, crypto.randomUUID());
            return {
              fecha,
              colegio_id: f.colegio_id,
              producto_id: f.producto_id,
              producto_colegio_id: f.id,
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
          }),
        ),
    );
    refresh();
    return {
      ok: true,
      mensaje: `Entrega registrada (${validas.length} producto${validas.length === 1 ? "" : "s"}). El stock sube cuando el colegio la recibe.`,
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
