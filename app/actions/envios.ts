"use server";

import { refresh } from "next/cache";
import { sesionAccion } from "@/lib/auth";
import { check, db, mensajeError } from "@/lib/supabase";
import { enParalelo } from "@/lib/paralelo";
import type { Resultado } from "@/lib/types";
import { hoyISO } from "@/lib/format";

const QUIEN_ENVIA = ["COCINA", "ADMIN", "LOGISTICA"] as const;
const QUIEN_RECIBE = ["PERSONAL", "ADMIN", "LOGISTICA"] as const;

/** La cocina registra lo que manda a un colegio (solo productos del día). No suma stock hasta que se recibe. */
export async function crearEnvio(
  colegioId: number,
  lineas: { productoColegioId: number; cantidad: number }[],
): Promise<Resultado> {
  try {
    const sesion = await sesionAccion([...QUIEN_ENVIA]);
    if (lineas.some((l) => !Number.isFinite(l.cantidad) || l.cantidad < 0)) {
      return { ok: false, error: "Las cantidades no pueden ser negativas." };
    }
    const validas = lineas.filter((l) => l.cantidad > 0);
    if (validas.length === 0) return { ok: false, error: "Escribe la cantidad de al menos un producto." };
    if (validas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad > 10000)) {
      return { ok: false, error: "Las cantidades deben ser números enteros." };
    }
    // Cada producto se envía una vez al día a cada colegio (los que faltan se pueden enviar después)
    const yaEnviados = check(
      await db()
        .from("envios")
        .select("producto_colegio_id")
        .eq("origen", "COCINA")
        .eq("colegio_id", colegioId)
        .eq("fecha", hoyISO())
        .neq("estado", "ANULADO")
        .in("producto_colegio_id", validas.map((l) => l.productoColegioId)),
    ) as { producto_colegio_id: number }[];
    if (yaEnviados.length > 0) {
      return {
        ok: false,
        error: `${yaEnviados.length === 1 ? "Un producto ya fue enviado" : `${yaEnviados.length} productos ya fueron enviados`} hoy a este colegio. Actualiza la pantalla.`,
      };
    }
    const filas = check(
      await db()
        .from("v_stock")
        .select("id, colegio_id, producto_id, perecible, activo, producto_activo")
        .in("id", validas.map((l) => l.productoColegioId)),
    ) as { id: number; colegio_id: number; producto_id: number; perecible: boolean; activo: boolean; producto_activo: boolean }[];
    // Los del día que no manda la cocina no se pueden enviar desde su panel
    const noDeCocina = new Set(
      (
        check(
          await db()
            .from("productos")
            .select("id")
            .in("id", filas.map((f) => f.producto_id))
            .eq("de_cocina", false),
        ) as { id: number }[]
      ).map((x) => x.id),
    );
    if (
      filas.length !== validas.length ||
      filas.some((f) => f.colegio_id !== colegioId || !f.perecible || noDeCocina.has(f.producto_id) || !f.activo || !f.producto_activo)
    ) {
      return { ok: false, error: "Solo se pueden enviar productos del día activos de ese colegio." };
    }
    const lote = crypto.randomUUID();
    check(
      await db()
        .from("envios")
        .insert(
          validas.map((l) => {
            const f = filas.find((x) => x.id === l.productoColegioId)!;
            return {
              colegio_id: colegioId,
              producto_id: f.producto_id,
              producto_colegio_id: f.id,
              cantidad_enviada: l.cantidad,
              enviado_por: sesion.uid,
              origen: "COCINA",
              lote,
            };
          }),
        ),
    );
    refresh();
    const total = validas.reduce((a, l) => a + l.cantidad, 0);
    return { ok: true, mensaje: `Envío registrado: ${total} unidades. El colegio debe confirmar la recepción.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Anula un envío que todavía no fue recibido (por ejemplo, si se registró por error) */
export async function anularEnvio(envioId: number): Promise<Resultado> {
  try {
    // La cocina no anula: una vez enviado, queda registrado (administración o logística sí pueden, desde el panel)
    await sesionAccion(["ADMIN", "LOGISTICA"]);
    const q = db().from("envios").update({ estado: "ANULADO" }).eq("id", envioId).eq("estado", "PENDIENTE");
    const res = check(await q.select("id")) as { id: number }[];
    if (res.length === 0) return { ok: false, error: "Ese envío ya fue recibido y no se puede anular." };
    refresh();
    return { ok: true, mensaje: "Envío anulado." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** La cocina corrige la cantidad de algo que envió hoy, mientras el colegio todavía no lo recibe */
export async function editarEnvio(envioId: number, cantidad: number): Promise<Resultado> {
  try {
    const sesion = await sesionAccion([...QUIEN_ENVIA]);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10000) {
      return { ok: false, error: "Escribe una cantidad de 1 o más." };
    }
    let q = db()
      .from("envios")
      .update({ cantidad_enviada: cantidad })
      .eq("id", envioId)
      .eq("origen", "COCINA")
      .eq("estado", "PENDIENTE"); // si ya lo recibieron, no se toca
    if (sesion.rol === "COCINA") q = q.eq("fecha", hoyISO());
    const res = check(await q.select("id")) as { id: number }[];
    if (res.length === 0) return { ok: false, error: "Ya lo recibieron en el colegio: no se puede cambiar." };
    refresh();
    return { ok: true, mensaje: `Cantidad corregida a ${cantidad}.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** El personal confirma lo que llegó: todo (conforme) o menos, con el motivo */
export async function recibirEnvio(envioId: number, cantidadRecibida: number, motivo: string) {
  try {
    const sesion = await sesionAccion([...QUIEN_RECIBE]);
    const envio = check(await db().from("envios").select("colegio_id").eq("id", envioId).single()) as { colegio_id: number };
    if (sesion.rol === "PERSONAL" && envio.colegio_id !== sesion.colegioId) {
      throw new Error("Solo puedes recibir envíos de tu colegio.");
    }
    const r = check(
      await db().rpc("fn_recibir_envio", {
        p_envio_id: envioId,
        p_cantidad_recibida: cantidadRecibida,
        p_motivo: motivo,
        p_usuario_id: sesion.uid,
      }),
    ) as { estado: string; recibido: number; faltante: number };
    refresh();
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: mensajeError(e) };
  }
}

/** El personal confirma de una vez que todo un envío/entrega llegó conforme */
export async function recibirConforme(envioIds: number[]): Promise<Resultado> {
  try {
    const sesion = await sesionAccion([...QUIEN_RECIBE]);
    if (envioIds.length === 0) return { ok: false, error: "No hay nada por recibir." };
    const envios = check(
      await db().from("envios").select("id, colegio_id, cantidad_enviada, estado").in("id", envioIds),
    ) as { id: number; colegio_id: number; cantidad_enviada: number; estado: string }[];
    if (sesion.rol === "PERSONAL" && envios.some((e) => e.colegio_id !== sesion.colegioId)) {
      return { ok: false, error: "Solo puedes recibir envíos de tu colegio." };
    }
    // Varios productos a la vez (antes era uno por uno)
    const pendientes = envios.filter((x) => x.estado === "PENDIENTE");
    await enParalelo(pendientes, 6, async (e) =>
      check(
        await db().rpc("fn_recibir_envio", {
          p_envio_id: e.id,
          p_cantidad_recibida: e.cantidad_enviada,
          p_motivo: "",
          p_usuario_id: sesion.uid,
        }),
      ),
    );
    const n = pendientes.length;
    refresh();
    return { ok: true, mensaje: `${n} producto${n === 1 ? "" : "s"} recibido${n === 1 ? "" : "s"} conforme.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
