import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { check, db } from "./supabase";
import type { Categoria, Colegio, Movimiento, StockRow, VentaDiaria } from "./types";

export const COOKIE_COLEGIO = "lf_colegio";

export type Consulta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }> & {
  range: (desde: number, hasta: number) => Consulta<T>;
};

/** Supabase devuelve como máximo 1000 filas por consulta: esto trae todas en bloques */
export async function todas<T>(crear: () => Consulta<T>): Promise<T[]> {
  const BLOQUE = 1000;
  const salida: T[] = [];
  for (let desde = 0; ; desde += BLOQUE) {
    const res = await crear().range(desde, desde + BLOQUE - 1);
    if (res.error) throw new Error(res.error.message);
    const filas = res.data ?? [];
    salida.push(...filas);
    if (filas.length < BLOQUE) return salida;
  }
}

export const obtenerColegios = cache(async (soloActivos = true): Promise<Colegio[]> => {
  let q = db().from("colegios").select("*").order("id");
  if (soloActivos) q = q.eq("activo", true);
  return check(await q) as Colegio[];
});

export const obtenerCategorias = cache(async (): Promise<Categoria[]> => {
  return check(await db().from("categorias").select("*").order("orden").order("nombre")) as Categoria[];
});

/** Colegio elegido en el selector del panel (null = todos) */
export async function colegioSeleccionado(): Promise<number | null> {
  const v = (await cookies()).get(COOKIE_COLEGIO)?.value;
  const id = Number(v);
  if (!v || !Number.isFinite(id) || id <= 0) return null;
  const colegios = await obtenerColegios();
  return colegios.some((c) => c.id === id) ? id : null;
}

export async function obtenerStock(opts: { colegioId?: number | null; incluirInactivos?: boolean } = {}) {
  return todas<StockRow>(() => {
    let q = db().from("v_stock").select("*").order("categoria").order("producto").order("id");
    if (opts.colegioId) q = q.eq("colegio_id", opts.colegioId);
    if (!opts.incluirInactivos) q = q.eq("activo", true).eq("producto_activo", true);
    return q as unknown as Consulta<StockRow>;
  });
}

export async function obtenerVentas(desde: string, hasta: string, colegioId?: number | null) {
  return todas<VentaDiaria>(() => {
    let q = db()
      .from("v_ventas_diarias")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
      .order("colegio_id")
      .order("producto_id");
    if (colegioId) q = q.eq("colegio_id", colegioId);
    return q as unknown as Consulta<VentaDiaria>;
  });
}

/** Suma del efecto en stock de los movimientos desde una fecha (para calcular el stock inicial del mes) */
export async function obtenerEfectosDesde(desde: string, colegioId: number) {
  type Fila = { producto_id: number; efecto_stock: number; fecha: string };
  return todas<Fila>(
    () =>
      db()
        .from("movimientos")
        .select("producto_id, efecto_stock, fecha")
        .eq("colegio_id", colegioId)
        .gte("fecha", desde)
        .neq("efecto_stock", 0)
        .order("id") as unknown as Consulta<Fila>,
  );
}

export async function obtenerMovimientos(f: {
  colegioId?: number | null;
  tipo?: string | null;
  desde?: string | null;
  hasta?: string | null;
  limite?: number;
}) {
  let q = db()
    .from("movimientos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(f.limite ?? 300);
  if (f.colegioId) q = q.eq("colegio_id", f.colegioId);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.desde) q = q.gte("fecha", f.desde);
  if (f.hasta) q = q.lte("fecha", f.hasta);
  return check(await q) as Movimiento[];
}

export const obtenerProductosMapa = cache(async () => {
  const filas = check(await db().from("productos").select("id, nombre, categoria_id, activo")) as {
    id: number;
    nombre: string;
    categoria_id: number | null;
    activo: boolean;
  }[];
  return new Map(filas.map((p) => [p.id, p]));
});

export const obtenerUsuariosMapa = cache(async () => {
  const filas = check(await db().from("usuarios").select("id, nombre, usuario, rol")) as {
    id: number;
    nombre: string;
    usuario: string;
    rol: string;
  }[];
  return new Map(filas.map((u) => [u.id, u]));
});

/** Último registro (venta o conteo) de cada colegio en una fecha */
export async function obtenerActividadDia(fecha: string) {
  const filas = check(
    await db()
      .from("movimientos")
      .select("colegio_id, created_at")
      .eq("fecha", fecha)
      .in("tipo", ["VENTA", "AJUSTE"])
      .order("created_at", { ascending: false }),
  ) as { colegio_id: number; created_at: string }[];
  const mapa = new Map<number, string>();
  for (const f of filas) if (!mapa.has(f.colegio_id)) mapa.set(f.colegio_id, f.created_at);
  return mapa;
}

export type CambioPrecio = {
  id: number;
  precio_anterior: number;
  precio_nuevo: number;
  usuario_id: number | null;
  created_at: string;
  colegio_id: number;
  producto_id: number;
};

/** Cambios de precio de venta entre dos fechas (hora de Perú) */
export async function obtenerCambiosPrecio(f: { colegioId?: number | null; desde: string; hasta: string; limite?: number }) {
  let q = db()
    .from("historial_precios")
    .select("id, precio_anterior, precio_nuevo, usuario_id, created_at, producto_colegio!inner(colegio_id, producto_id)")
    .gte("created_at", `${f.desde}T00:00:00-05:00`)
    .lte("created_at", `${f.hasta}T23:59:59.999-05:00`)
    .order("created_at", { ascending: false })
    .limit(f.limite ?? 1000);
  if (f.colegioId) q = q.eq("producto_colegio.colegio_id", f.colegioId);
  const filas = check(await q) as unknown as (Omit<CambioPrecio, "colegio_id" | "producto_id"> & {
    producto_colegio: { colegio_id: number; producto_id: number };
  })[];
  return filas.map(({ producto_colegio, ...c }) => ({ ...c, ...producto_colegio })) as CambioPrecio[];
}

export type Envio = {
  id: number;
  fecha: string;
  colegio_id: number;
  producto_id: number;
  producto_colegio_id: number;
  cantidad_enviada: number;
  cantidad_recibida: number | null;
  estado: "PENDIENTE" | "CONFORME" | "OBSERVADO" | "ANULADO";
  motivo: string | null;
  enviado_por: number | null;
  created_at: string;
  recibido_por: number | null;
  recibido_at: string | null;
  /** COCINA = productos del día · LOGISTICA = entrega semanal */
  origen: "COCINA" | "LOGISTICA";
  lote: string | null;
  cajas: number;
  unidades_por_caja: number | null;
  unidades_sueltas: number;
  costo_presentacion: number | null;
  observacion: string | null;
};

/** Envíos de cocina y entregas de logística (se suman al stock cuando el colegio los recibe) */
export async function obtenerEnvios(f: {
  colegioId?: number | null;
  origen?: Envio["origen"];
  lote?: string;
  id?: number;
  desde?: string;
  hasta?: string;
  estado?: Envio["estado"];
  limite?: number;
}) {
  let q = db()
    .from("envios")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(f.limite ?? 1000);
  if (f.colegioId) q = q.eq("colegio_id", f.colegioId);
  if (f.origen) q = q.eq("origen", f.origen);
  if (f.lote) q = q.eq("lote", f.lote);
  if (f.id) q = q.eq("id", f.id);
  if (f.desde) q = q.gte("fecha", f.desde);
  if (f.hasta) q = q.lte("fecha", f.hasta);
  if (f.estado) q = q.eq("estado", f.estado);
  return check(await q) as Envio[];
}

export type EstadoReposicion = "POR_APROBAR" | "APROBADA" | "RECHAZADA" | "EN_COMPRA" | "COMPRADA" | "ANULADA";

export type ItemReposicion = {
  id: number;
  reposicion_id: number;
  producto_id: number | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  quitado: boolean;
  cantidad_aprobada: number | null;
  orden: number;
  /** Fuera de catálogo: lo que pagó logística */
  costo: number | null;
  costo_fecha: string | null;
  costo_por: number | null;
};

export type Reposicion = {
  id: number;
  codigo: string;
  colegio_id: number;
  estado: EstadoReposicion;
  nota: string | null;
  pedido_por: number | null;
  created_at: string;
  revisado_por: number | null;
  revisado_at: string | null;
  motivo_rechazo: string | null;
  compra_por: number | null;
  compra_at: string | null;
  comprado_por: number | null;
  comprado_at: string | null;
  items: ItemReposicion[];
};

/** Listas de reposición del personal, con sus productos */
export async function obtenerReposiciones(
  f: { colegioId?: number | null; estado?: EstadoReposicion; id?: number; limite?: number } = {},
) {
  let q = db()
    .from("reposiciones")
    .select("*, items:reposicion_items(*)")
    .order("created_at", { ascending: false })
    .limit(f.limite ?? 500);
  if (f.colegioId) q = q.eq("colegio_id", f.colegioId);
  if (f.estado) q = q.eq("estado", f.estado);
  if (f.id) q = q.eq("id", f.id);
  const filas = check(await q) as Reposicion[];
  for (const r of filas) r.items.sort((a, b) => a.orden - b.orden);
  return filas;
}

/** Cuántas reposiciones esperan a logística (aviso en el menú); administración solo las ve */
export async function contarReposicionesPendientes(rol: string) {
  if (rol !== "LOGISTICA") return 0;
  const { count } = await db()
    .from("reposiciones")
    .select("id", { count: "exact", head: true })
    .in("estado", ["POR_APROBAR", "APROBADA", "EN_COMPRA"]);
  return count ?? 0;
}

export type ConteoItem = {
  id: number;
  conteo_id: number;
  producto_colegio_id: number;
  producto_id: number;
  habia: number;
  quedan: number;
  vendido: number;
  ajuste: number;
  precio: number;
  monto: number;
  sobrante: number;
  motivo: string | null;
  usuario_id: number | null;
  updated_at: string;
};

export type Conteo = {
  id: number;
  colegio_id: number;
  /** DIA = productos del día · SEMANA = conteo semanal (fecha = lunes) */
  tipo: "DIA" | "SEMANA";
  fecha: string;
  usuario_id: number | null;
  created_at: string;
  updated_at: string;
  items: ConteoItem[];
};

/** Conteos con fecha (del día o semanales), con lo contado de cada producto */
export async function obtenerConteos(
  f: { tipo?: Conteo["tipo"]; colegioId?: number | null; desde?: string; hasta?: string; id?: number; limite?: number } = {},
) {
  let q = db()
    .from("conteos")
    .select("*, items:conteo_items(*)")
    .order("fecha", { ascending: false })
    .order("colegio_id")
    .limit(f.limite ?? 400);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.colegioId) q = q.eq("colegio_id", f.colegioId);
  if (f.desde) q = q.gte("fecha", f.desde);
  if (f.hasta) q = q.lte("fecha", f.hasta);
  if (f.id) q = q.eq("id", f.id);
  return check(await q) as Conteo[];
}

export type OtroGasto = {
  nombre: string;
  cantidad: number;
  unidad: string;
  costo: number;
  fecha: string;
  codigo: string;
  colegio_id: number;
};

/** Gastos fuera del catálogo anotados por logística (descartables, utensilios…), por fecha en que se anotaron */
export async function obtenerOtrosGastos(desde: string, hasta: string, colegioId?: number | null) {
  const { data, error } = await db()
    .from("reposicion_items")
    .select("nombre, cantidad, cantidad_aprobada, unidad, costo, costo_fecha, reposiciones!inner(codigo, colegio_id)")
    .not("costo", "is", null)
    .gte("costo_fecha", desde)
    .lte("costo_fecha", hasta);
  if (error) return [] as OtroGasto[]; // sin la migración 14 todavía no hay gastos anotados
  type Fila = {
    nombre: string;
    cantidad: number;
    cantidad_aprobada: number | null;
    unidad: string;
    costo: number;
    costo_fecha: string;
    reposiciones: { codigo: string; colegio_id: number };
  };
  return ((data ?? []) as unknown as Fila[])
    .map((f) => ({
      nombre: f.nombre,
      cantidad: f.cantidad_aprobada ?? f.cantidad,
      unidad: f.unidad,
      costo: Number(f.costo),
      fecha: f.costo_fecha,
      codigo: f.reposiciones.codigo,
      colegio_id: f.reposiciones.colegio_id,
    }))
    .filter((g) => !colegioId || g.colegio_id === colegioId);
}
