import "server-only";
import {
  obtenerCambiosPrecio,
  obtenerCategorias,
  obtenerColegios,
  obtenerEfectosDesde,
  obtenerOtrosGastos,
  obtenerProductosMapa,
  obtenerStock,
  obtenerVentas,
  todas,
  type Consulta,
} from "./data";
import { check, db } from "./supabase";
import { hoyISO, mesActual, mesAnterior, mesSiguiente, rangoMes } from "./format";

/** Cifras de un mes, tal como se presentan en el reporte (se guardan como foto al cerrar el mes) */
export type DatosReporte = {
  mes: string;
  colegios: { id: number; nombre: string }[];
  ventas: {
    total: number;
    costo: number;
    ganancia: number;
    unidades: number;
    dias: number;
    promedioDia: number;
    porDia: number[];
    porDiaColegio: Record<string, number[]>;
    mejorDia: { fecha: string; total: number } | null;
  };
  /** hastaDia: en el mes en curso se compara contra los mismos días del mes anterior */
  mesAnterior: { mes: string; total: number; gananciaNeta: number; hastaDia: number | null } | null;
  sobrante: {
    unidades: number;
    costo: number;
    porMotivo: { motivo: string; unidades: number; costo: number }[];
    productos: { producto: string; colegio: string; unidades: number; costo: number }[];
  };
  /** Descartables, utensilios… comprados fuera del catálogo (anotados en el mes). Los reportes antiguos no lo tienen. */
  otrosGastos?: number;
  gananciaNeta: number;
  margenNeto: number | null;
  porColegio: { id: number; nombre: string; ventas: number; ganancia: number; sobrante: number; unidades: number }[];
  porCategoria: { nombre: string; ventas: number }[];
  masVendidos: { producto: string; unidades: number; ventas: number; ganancia: number }[];
  menosVendidos: { producto: string; unidades: number; ventas: number }[];
  sinVenta: string[];
  cocina: { envios: number; enviadas: number; llegaron: number; conObservacion: number; sinRecibir: number };
  logistica: { entregas: number; enviadas: number; llegaron: number; conObservacion: number; sinRecibir: number; costo: number };
  conteos: { colegio: string; diasVenta: number; diasConteo: number; completos: number; semanas: number }[];
  reposiciones: { total: number; porEstado: Record<string, number>; productos: number; fueraCatalogo: number };
  ajustes: { movimientos: number; unidades: number; valor: number };
  precios: { producto: string; colegio: string; antes: number; despues: number; fecha: string }[];
  cierre: {
    valorVenta: number;
    valorCosto: number;
    bajoMinimo: { producto: string; colegio: string; quedan: number; minimo: number }[];
  };
  /** Reporte de compras y entregas (logística). Los reportes antiguos pueden no tenerlo. */
  compras?: DatosCompras;
};

/** Lo que logística compró y entregó en el mes, para rendir cuentas */
export type DatosCompras = {
  costo: number;
  unidades: number;
  porColegio: { nombre: string; costo: number; entregas: number }[];
  entregas: { fecha: string; colegio: string; nota: string | null; productos: number; unidades: number; costo: number; estado: string }[];
  productos: { producto: string; unidades: number; costo: number }[];
  observaciones: { fecha: string; colegio: string; producto: string; enviadas: number; llegaron: number; motivo: string }[];
  reposiciones: {
    codigo: string;
    colegio: string;
    fecha: string;
    estado: string;
    productos: number;
    quitados: number;
  }[];
  fueraCatalogo: { nombre: string; cantidad: number; unidad: string; codigo: string; estado: string; costo: number | null }[];
  /** Lo anotado como pagado en el mes (puede ser de reposiciones de meses anteriores) */
  otrosGastos?: { total: number; items: { nombre: string; cantidad: number; unidad: string; codigo: string; colegio: string; costo: number; fecha: string }[] };
  pendientes: {
    porComprar: { codigo: string; colegio: string; desde: string }[];
    enCompra: { codigo: string; colegio: string; desde: string }[];
    sinRecibir: number;
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const diaSiguiente = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

type Mov = { tipo: string; fecha: string; colegio_id: number; producto_id: number; cantidad: number; efecto_stock: number; costo_unitario: number; observacion: string | null };
type Env = {
  id: number;
  lote: string | null;
  origen: string;
  estado: string;
  colegio_id: number;
  producto_colegio_id: number;
  cantidad_enviada: number;
  cantidad_recibida: number | null;
  unidades_por_caja: number | null;
  costo_presentacion: number | null;
};

/** Calcula el reporte de un mes con lo que hay hoy en la base */
export async function calcularReporte(mes: string): Promise<DatosReporte> {
  const compras = calcularCompras(mes);
  const { desde, hasta, dias } = rangoMes(mes);
  const prev = rangoMes(mesAnterior(mes));
  const [colegios, productos, categorias, stock, ventas, ventasPrev, movs, movsPrev, envios, conteos, reposiciones, precios] =
    await Promise.all([
      obtenerColegios(false),
      obtenerProductosMapa(),
      obtenerCategorias(),
      obtenerStock({ incluirInactivos: true }),
      obtenerVentas(desde, hasta),
      obtenerVentas(prev.desde, prev.hasta),
      todas<Mov>(
        () =>
          db()
            .from("movimientos")
            .select("tipo, fecha, colegio_id, producto_id, cantidad, efecto_stock, costo_unitario, observacion")
            .in("tipo", ["MERMA", "AJUSTE"])
            .gte("fecha", desde)
            .lte("fecha", hasta)
            .order("id") as unknown as Consulta<Mov>,
      ),
      todas<Mov>(
        () =>
          db()
            .from("movimientos")
            .select("tipo, fecha, colegio_id, producto_id, cantidad, efecto_stock, costo_unitario, observacion")
            .eq("tipo", "MERMA")
            .gte("fecha", prev.desde)
            .lte("fecha", prev.hasta)
            .order("id") as unknown as Consulta<Mov>,
      ),
      todas<Env>(
        () =>
          db()
            .from("envios")
            .select("id, lote, origen, estado, colegio_id, producto_colegio_id, cantidad_enviada, cantidad_recibida, unidades_por_caja, costo_presentacion")
            .gte("fecha", desde)
            .lte("fecha", hasta)
            .order("id") as unknown as Consulta<Env>,
      ),
      // Semanas que tocan el mes (la fecha del conteo semanal es el lunes)
      check(
        await db()
          .from("conteos")
          .select("colegio_id, tipo, fecha, items:conteo_items(id)")
          .gte("fecha", (() => {
            const d = new Date(`${desde}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() - 6);
            return d.toISOString().slice(0, 10);
          })())
          .lte("fecha", hasta),
      ) as { colegio_id: number; tipo: string; fecha: string; items: { id: number }[] }[],
      check(
        await db()
          .from("reposiciones")
          .select("estado, created_at, items:reposicion_items(producto_id)")
          .gte("created_at", `${desde}T05:00:00Z`)
          .lt("created_at", `${diaSiguiente(hasta)}T05:00:00Z`),
      ) as { estado: string; created_at: string; items: { producto_id: number | null }[] }[],
      obtenerCambiosPrecio({ desde, hasta, limite: 500 }),
    ]);
  const [gastosMes, gastosPrev] = await Promise.all([obtenerOtrosGastos(desde, hasta), obtenerOtrosGastos(prev.desde, prev.hasta)]);
  const otrosGastos = gastosMes.reduce((a, g) => a + g.costo, 0);

  const nombreColegio = new Map(colegios.map((c) => [c.id, c.nombre]));
  const nombreProducto = (id: number) => productos.get(id)?.nombre ?? "Producto";
  const filaStock = new Map(stock.map((s) => [s.id, s]));
  const suma = <T>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + Number(f(x) || 0), 0);

  // ----- Ventas -----
  const total = suma(ventas, (v) => v.monto);
  const costo = suma(ventas, (v) => v.costo);
  const porDia = new Array(dias).fill(0);
  const porDiaColegio: Record<string, number[]> = {};
  for (const c of colegios) porDiaColegio[c.id] = new Array(dias).fill(0);
  for (const v of ventas) {
    const i = Number(v.fecha.slice(8, 10)) - 1;
    porDia[i] += Number(v.monto);
    if (porDiaColegio[v.colegio_id]) porDiaColegio[v.colegio_id][i] += Number(v.monto);
  }
  const diasVenta = porDia.filter((x) => x > 0).length;
  const iMejor = porDia.reduce((m, x, i) => (x > porDia[m] ? i : m), 0);

  // ----- Sobrante (merma) -----
  const mermas = movs.filter((m) => m.tipo === "MERMA");
  const costoMerma = (m: Mov) => Number(m.cantidad) * Number(m.costo_unitario);
  const sobranteCosto = suma(mermas, costoMerma);
  const porMotivo = new Map<string, { unidades: number; costo: number }>();
  const porProdMerma = new Map<string, { producto: string; colegio: string; unidades: number; costo: number }>();
  for (const m of mermas) {
    const k = (m.observacion ?? "Sin motivo").trim() || "Sin motivo";
    const a = porMotivo.get(k) ?? { unidades: 0, costo: 0 };
    a.unidades += Number(m.cantidad);
    a.costo += costoMerma(m);
    porMotivo.set(k, a);
    const kp = `${m.colegio_id}-${m.producto_id}`;
    const b = porProdMerma.get(kp) ?? { producto: nombreProducto(m.producto_id), colegio: nombreColegio.get(m.colegio_id) ?? "", unidades: 0, costo: 0 };
    b.unidades += Number(m.cantidad);
    b.costo += costoMerma(m);
    porProdMerma.set(kp, b);
  }
  const gananciaNeta = total - costo - sobranteCosto - otrosGastos;

  // ----- Por colegio y categoría -----
  const porColegio = colegios
    .map((c) => {
      const v = ventas.filter((x) => x.colegio_id === c.id);
      return {
        id: c.id,
        nombre: c.nombre,
        ventas: r2(suma(v, (x) => x.monto)),
        ganancia: r2(
          suma(v, (x) => x.ganancia) -
            suma(mermas.filter((m) => m.colegio_id === c.id), costoMerma) -
            suma(gastosMes.filter((g) => g.colegio_id === c.id), (g) => g.costo),
        ),
        sobrante: r2(suma(mermas.filter((m) => m.colegio_id === c.id), costoMerma)),
        unidades: suma(v, (x) => x.unidades),
      };
    })
    .filter((c) => c.ventas > 0 || c.sobrante > 0);
  const catDe = (pid: number) => categorias.find((c) => c.id === productos.get(pid)?.categoria_id)?.nombre ?? "Otros";
  const porCat = new Map<string, number>();
  for (const v of ventas) porCat.set(catDe(v.producto_id), (porCat.get(catDe(v.producto_id)) ?? 0) + Number(v.monto));

  // ----- Productos (sumando los colegios) -----
  const porProd = new Map<number, { producto: string; unidades: number; ventas: number; ganancia: number }>();
  for (const v of ventas) {
    const a = porProd.get(v.producto_id) ?? { producto: nombreProducto(v.producto_id), unidades: 0, ventas: 0, ganancia: 0 };
    a.unidades += Number(v.unidades);
    a.ventas += Number(v.monto);
    a.ganancia += Number(v.ganancia);
    porProd.set(v.producto_id, a);
  }
  const vendidos = [...porProd.values()].filter((p) => p.ventas > 0).sort((a, b) => b.ventas - a.ventas);
  const activos = new Set(stock.filter((s) => s.activo && s.producto_activo).map((s) => s.producto_id));
  const sinVenta = [...activos].filter((pid) => !porProd.has(pid)).map(nombreProducto).sort();

  // ----- Envíos de cocina y entregas de logística -----
  const resumenEnvios = (origen: string) => {
    const e = envios.filter((x) => x.origen === origen && x.estado !== "ANULADO");
    const lotes = new Set(e.map((x) => x.lote ?? `e${x.id}`));
    return {
      envios: lotes.size,
      enviadas: suma(e, (x) => x.cantidad_enviada),
      llegaron: suma(e, (x) => x.cantidad_recibida ?? 0),
      conObservacion: e.filter((x) => x.estado === "OBSERVADO").length,
      sinRecibir: e.filter((x) => x.estado === "PENDIENTE").length,
      filas: e,
    };
  };
  const cocina = resumenEnvios("COCINA");
  const logis = resumenEnvios("LOGISTICA");
  const costoLogistica = suma(logis.filas, (x) => {
    const s = filaStock.get(x.producto_colegio_id);
    const porCaja = x.unidades_por_caja ?? s?.unidades_por_presentacion ?? 1;
    const c = x.costo_presentacion ?? s?.costo_presentacion ?? 0;
    return ((x.cantidad_recibida ?? 0) * Number(c)) / porCaja;
  });

  // ----- Conteos -----
  const conteosPorColegio = colegios
    .map((c) => {
      const delDia = stock.filter((s) => s.colegio_id === c.id && s.perecible && s.activo && s.producto_activo).length;
      const dia = conteos.filter((x) => x.colegio_id === c.id && x.tipo === "DIA" && x.fecha >= desde);
      const fechasVenta = new Set(ventas.filter((v) => v.colegio_id === c.id).map((v) => v.fecha));
      return {
        colegio: c.nombre,
        diasVenta: fechasVenta.size,
        diasConteo: dia.length,
        completos: dia.filter((x) => x.items.length >= delDia).length,
        semanas: conteos.filter((x) => x.colegio_id === c.id && x.tipo === "SEMANA").length,
      };
    })
    .filter((c) => c.diasVenta > 0 || c.diasConteo > 0);

  // ----- Reposiciones -----
  const porEstado: Record<string, number> = {};
  for (const r of reposiciones) porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1;

  // ----- Ajustes (conteo distinto al sistema) -----
  const ajustes = movs.filter((m) => m.tipo === "AJUSTE");

  // ----- Stock al cierre del mes: lo de hoy menos lo que pasó después del último día -----
  const despues = new Map<string, number>();
  if (hasta < hoyISO()) {
    const efectos = await Promise.all(colegios.map((c) => obtenerEfectosDesde(diaSiguiente(hasta), c.id).then((f) => ({ c: c.id, f }))));
    for (const { c, f } of efectos) for (const e of f) despues.set(`${c}-${e.producto_id}`, (despues.get(`${c}-${e.producto_id}`) ?? 0) + e.efecto_stock);
  }
  const cierre = stock
    .filter((s) => s.activo && s.producto_activo)
    .map((s) => ({ s, quedan: s.total_unidades - (despues.get(`${s.colegio_id}-${s.producto_id}`) ?? 0) }));

  // ----- Mes anterior (en el mes en curso, solo los mismos días) -----
  const hastaDia = mes === mesActual() ? Number(hoyISO().slice(8, 10)) : null;
  const delPeriodo = (fecha: string) => hastaDia == null || Number(fecha.slice(8, 10)) <= hastaDia;
  const ventasPrevP = ventasPrev.filter((v) => delPeriodo(v.fecha));
  const totalPrev = suma(ventasPrevP, (v) => v.monto);

  return {
    mes,
    colegios: colegios.map((c) => ({ id: c.id, nombre: c.nombre })),
    ventas: {
      total: r2(total),
      costo: r2(costo),
      ganancia: r2(total - costo),
      unidades: suma(ventas, (v) => v.unidades),
      dias: diasVenta,
      promedioDia: diasVenta ? r2(total / diasVenta) : 0,
      porDia: porDia.map(r2),
      porDiaColegio: Object.fromEntries(Object.entries(porDiaColegio).map(([k, v]) => [k, v.map(r2)])),
      mejorDia: total > 0 ? { fecha: `${mes}-${String(iMejor + 1).padStart(2, "0")}`, total: r2(porDia[iMejor]) } : null,
    },
    mesAnterior:
      ventasPrev.length > 0
        ? {
            mes: mesAnterior(mes),
            total: r2(totalPrev),
            gananciaNeta: r2(
              totalPrev -
                suma(ventasPrevP, (v) => v.costo) -
                suma(movsPrev.filter((m) => delPeriodo(m.fecha)), costoMerma) -
                suma(gastosPrev.filter((g) => delPeriodo(g.fecha)), (g) => g.costo),
            ),
            hastaDia,
          }
        : null,
    sobrante: {
      unidades: suma(mermas, (m) => m.cantidad),
      costo: r2(sobranteCosto),
      porMotivo: [...porMotivo.entries()]
        .map(([motivo, a]) => ({ motivo, unidades: a.unidades, costo: r2(a.costo) }))
        .sort((a, b) => b.costo - a.costo),
      productos: [...porProdMerma.values()]
        .sort((a, b) => b.costo - a.costo)
        .slice(0, 5)
        .map((p) => ({ ...p, costo: r2(p.costo) })),
    },
    otrosGastos: r2(otrosGastos),
    gananciaNeta: r2(gananciaNeta),
    margenNeto: total > 0 ? Math.round((gananciaNeta / total) * 1000) / 10 : null,
    porColegio: porColegio.sort((a, b) => b.ventas - a.ventas),
    porCategoria: [...porCat.entries()]
      .map(([nombre, v]) => ({ nombre, ventas: r2(v) }))
      .filter((c) => c.ventas > 0)
      .sort((a, b) => b.ventas - a.ventas),
    masVendidos: vendidos.slice(0, 5).map((p) => ({ ...p, ventas: r2(p.ventas), ganancia: r2(p.ganancia) })),
    menosVendidos: vendidos
      .slice(-3)
      .reverse()
      .filter((p) => !vendidos.slice(0, 5).includes(p))
      .map((p) => ({ producto: p.producto, unidades: p.unidades, ventas: r2(p.ventas) })),
    sinVenta,
    cocina: { envios: cocina.envios, enviadas: cocina.enviadas, llegaron: cocina.llegaron, conObservacion: cocina.conObservacion, sinRecibir: cocina.sinRecibir },
    logistica: {
      entregas: logis.envios,
      enviadas: logis.enviadas,
      llegaron: logis.llegaron,
      conObservacion: logis.conObservacion,
      sinRecibir: logis.sinRecibir,
      costo: r2(costoLogistica),
    },
    conteos: conteosPorColegio,
    reposiciones: {
      total: reposiciones.length,
      porEstado,
      productos: suma(reposiciones, (r) => r.items.length),
      fueraCatalogo: suma(reposiciones, (r) => r.items.filter((i) => i.producto_id == null).length),
    },
    ajustes: {
      movimientos: ajustes.length,
      unidades: suma(ajustes, (m) => Math.abs(m.efecto_stock)),
      valor: r2(suma(ajustes, (m) => m.efecto_stock * Number(m.costo_unitario))),
    },
    precios: precios.map((p) => ({
      producto: nombreProducto(p.producto_id),
      colegio: nombreColegio.get(p.colegio_id) ?? "",
      antes: Number(p.precio_anterior),
      despues: Number(p.precio_nuevo),
      fecha: p.created_at,
    })),
    cierre: {
      valorVenta: r2(suma(cierre, (x) => Math.max(x.quedan, 0) * Number(x.s.precio_venta))),
      valorCosto: r2(suma(cierre, (x) => Math.max(x.quedan, 0) * Number(x.s.costo_unitario))),
      bajoMinimo: cierre
        .filter((x) => !x.s.perecible && x.quedan <= x.s.stock_minimo)
        .sort((a, b) => a.quedan - b.quedan)
        .map((x) => ({ producto: x.s.producto, colegio: x.s.colegio, quedan: x.quedan, minimo: x.s.stock_minimo })),
    },
    compras: await compras,
  };
}

/** Compras y entregas de logística del mes (y lo que quedó pendiente al cierre) */
export async function calcularCompras(mes: string): Promise<DatosCompras> {
  const { desde, hasta } = rangoMes(mes);
  type EnvL = {
    id: number;
    lote: string | null;
    fecha: string;
    estado: string;
    colegio_id: number;
    producto_id: number;
    producto_colegio_id: number;
    cantidad_enviada: number;
    cantidad_recibida: number | null;
    unidades_por_caja: number | null;
    costo_presentacion: number | null;
    motivo: string | null;
    observacion: string | null;
  };
  type Rep = {
    codigo: string;
    colegio_id: number;
    estado: string;
    created_at: string;
    revisado_at: string | null;
    compra_at: string | null;
    items: {
      nombre: string;
      producto_id: number | null;
      cantidad: number;
      unidad: string;
      quitado: boolean;
      cantidad_aprobada: number | null;
      costo?: number | null;
    }[];
  };
  const [colegios, productos, stock, envios, repsMes, repsAbiertas, gastos] = await Promise.all([
    obtenerColegios(false),
    obtenerProductosMapa(),
    obtenerStock({ incluirInactivos: true }),
    todas<EnvL>(
      () =>
        db()
          .from("envios")
          .select(
            "id, lote, fecha, estado, colegio_id, producto_id, producto_colegio_id, cantidad_enviada, cantidad_recibida, unidades_por_caja, costo_presentacion, motivo, observacion",
          )
          .eq("origen", "LOGISTICA")
          .neq("estado", "ANULADO")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id") as unknown as Consulta<EnvL>,
    ),
    check(
      await db()
        .from("reposiciones")
        .select("codigo, colegio_id, estado, created_at, revisado_at, compra_at, items:reposicion_items(*)")
        .gte("created_at", `${desde}T05:00:00Z`)
        .lt("created_at", `${diaSiguiente(hasta)}T05:00:00Z`)
        .order("created_at"),
    ) as Rep[],
    check(
      await db()
        .from("reposiciones")
        .select("codigo, colegio_id, estado, created_at, revisado_at, compra_at, items:reposicion_items(nombre, producto_id, cantidad, unidad, quitado, cantidad_aprobada)")
        .in("estado", ["APROBADA", "EN_COMPRA"])
        .lt("created_at", `${diaSiguiente(hasta)}T05:00:00Z`)
        .order("created_at"),
    ) as Rep[],
    obtenerOtrosGastos(desde, hasta),
  ]);
  const colegio = (id: number) => colegios.find((c) => c.id === id)?.nombre ?? "";
  const filaStock = new Map(stock.map((x) => [x.id, x]));
  const costoDe = (e: EnvL) => {
    const st = filaStock.get(e.producto_colegio_id);
    const porCaja = e.unidades_por_caja ?? st?.unidades_por_presentacion ?? 1;
    const c = e.costo_presentacion ?? st?.costo_presentacion ?? 0;
    // Se paga lo que se entregó (lo que llegó si ya se recibió)
    return ((e.cantidad_recibida ?? e.cantidad_enviada) * Number(c)) / porCaja;
  };

  // Entregas (agrupadas por lote)
  const lotes = new Map<string, EnvL[]>();
  for (const e of envios) {
    const k = e.lote ?? `e${e.id}`;
    lotes.set(k, [...(lotes.get(k) ?? []), e]);
  }
  const entregas = [...lotes.values()]
    .map((items) => {
      const pend = items.filter((x) => x.estado === "PENDIENTE").length;
      const obs = items.filter((x) => x.estado === "OBSERVADO").length;
      return {
        fecha: items[0].fecha,
        colegio: colegio(items[0].colegio_id),
        nota: items[0].observacion,
        productos: items.length,
        unidades: items.reduce((a, x) => a + x.cantidad_enviada, 0),
        costo: r2(items.reduce((a, x) => a + costoDe(x), 0)),
        estado: pend ? (pend === items.length ? "Por recibir" : `Faltan ${pend} por recibir`) : obs ? "Con observación" : "Conforme",
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porColegio = colegios
    .map((c) => {
      const deC = entregas.filter((e) => e.colegio === c.nombre);
      return { nombre: c.nombre, costo: r2(deC.reduce((a, e) => a + e.costo, 0)), entregas: deC.length };
    })
    .filter((c) => c.entregas > 0);

  const porProd = new Map<number, { producto: string; unidades: number; costo: number }>();
  for (const e of envios) {
    const a = porProd.get(e.producto_id) ?? { producto: productos.get(e.producto_id)?.nombre ?? "Producto", unidades: 0, costo: 0 };
    a.unidades += e.cantidad_recibida ?? e.cantidad_enviada;
    a.costo += costoDe(e);
    porProd.set(e.producto_id, a);
  }

  const resumenRep = (r: Rep) => ({
    codigo: r.codigo,
    colegio: colegio(r.colegio_id),
    fecha: r.created_at,
    estado: r.estado,
    productos: r.items.length,
    quitados: r.items.filter((i) => i.quitado).length,
  });

  return {
    otrosGastos: {
      total: r2(gastos.reduce((a, g) => a + g.costo, 0)),
      items: gastos.map((g) => ({ ...g, colegio: colegio(g.colegio_id), costo: r2(g.costo) })),
    },
    costo: r2(entregas.reduce((a, e) => a + e.costo, 0)),
    unidades: envios.reduce((a, e) => a + (e.cantidad_recibida ?? e.cantidad_enviada), 0),
    porColegio,
    entregas,
    productos: [...porProd.values()]
      .sort((a, b) => b.costo - a.costo)
      .slice(0, 10)
      .map((p) => ({ ...p, costo: r2(p.costo) })),
    observaciones: envios
      .filter((e) => e.estado === "OBSERVADO")
      .map((e) => ({
        fecha: e.fecha,
        colegio: colegio(e.colegio_id),
        producto: productos.get(e.producto_id)?.nombre ?? "Producto",
        enviadas: e.cantidad_enviada,
        llegaron: e.cantidad_recibida ?? 0,
        motivo: e.motivo ?? "",
      })),
    reposiciones: repsMes.map(resumenRep),
    // Lo que se pidió fuera del catálogo y se aprobó (descartables, utensilios…): su costo no queda en el sistema
    fueraCatalogo: repsMes
      .filter((r) => r.estado === "APROBADA" || r.estado === "EN_COMPRA" || r.estado === "COMPRADA")
      .flatMap((r) =>
        r.items
          .filter((i) => i.producto_id == null && !i.quitado)
          .map((i) => ({
            nombre: i.nombre,
            cantidad: i.cantidad_aprobada ?? i.cantidad,
            unidad: i.unidad,
            codigo: r.codigo,
            estado: r.estado,
            costo: i.costo == null ? null : Number(i.costo),
          })),
      ),
    pendientes: {
      porComprar: repsAbiertas
        .filter((r) => r.estado === "APROBADA")
        .map((r) => ({ codigo: r.codigo, colegio: colegio(r.colegio_id), desde: r.revisado_at ?? r.created_at })),
      enCompra: repsAbiertas
        .filter((r) => r.estado === "EN_COMPRA")
        .map((r) => ({ codigo: r.codigo, colegio: colegio(r.colegio_id), desde: r.compra_at ?? r.created_at })),
      sinRecibir: envios.filter((e) => e.estado === "PENDIENTE").length,
    },
  };
}

/** Si un reporte guardado es de antes de existir el de compras, se le agrega (sin tocar el resto) */
export async function completarCompras(mes: string, datos: DatosReporte) {
  if (datos.compras) return datos;
  const compras = await calcularCompras(mes);
  const nuevos = { ...datos, compras };
  await db().from("reportes_mensuales").update({ datos: nuevos }).eq("mes", mes);
  return nuevos;
}

export type ReporteGuardado = {
  mes: string;
  datos: DatosReporte;
  automatico: boolean;
  generado_por: number | null;
  generado_at: string;
};

export async function obtenerReportesGuardados() {
  const { data, error } = await db()
    .from("reportes_mensuales")
    .select("mes, datos, automatico, generado_por, generado_at")
    .order("mes", { ascending: false });
  if (error) return [] as ReporteGuardado[];
  return (data ?? []) as ReporteGuardado[];
}

export async function obtenerReporteGuardado(mes: string) {
  const { data, error } = await db()
    .from("reportes_mensuales")
    .select("mes, datos, automatico, generado_por, generado_at")
    .eq("mes", mes)
    .limit(1);
  if (error) return null; // sin la migración 13 todavía no hay historial
  return ((data ?? []) as ReporteGuardado[])[0] ?? null;
}

/** Guarda (o reemplaza) el reporte de un mes */
export async function guardarReporte(mes: string, usuarioId: number | null) {
  const datos = await calcularReporte(mes);
  const { error } = await db()
    .from("reportes_mensuales")
    .upsert(
      { mes, datos, automatico: usuarioId == null, generado_por: usuarioId, generado_at: new Date().toISOString() },
      { onConflict: "mes" },
    );
  // Sin la migración 13 el reporte igual se entrega, solo que no queda guardado
  if (error && usuarioId != null) throw new Error(error.message);
  if (error) console.error("No se pudo guardar el reporte mensual:", error.message);
  return datos;
}

/**
 * Generación automática: al empezar un mes, arma el reporte de cada mes ya cerrado que aún no tenga.
 * Se llama al entrar al panel (la primera visita del día 1 lo genera).
 */
/** Primer mes con movimientos (antes de eso no hay nada que reportar) */
export async function primerMesConDatos() {
  const { data } = await db().from("movimientos").select("fecha").order("fecha").limit(1);
  return (data?.[0]?.fecha as string | undefined)?.slice(0, 7) ?? null;
}

export async function asegurarReportesCerrados() {
  const actual = mesActual();
  const primerMes = await primerMesConDatos();
  if (!primerMes || primerMes >= actual) return;
  const { data: hechos, error } = await db().from("reportes_mensuales").select("mes");
  if (error) return; // si aún no se ejecutó la migración 13, no hace nada
  const ya = new Set((hechos ?? []).map((h) => h.mes as string));
  for (let m = primerMes; m < actual; m = mesSiguiente(m)) {
    if (!ya.has(m)) await guardarReporte(m, null);
  }
}
